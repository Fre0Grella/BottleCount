/// <reference types="astro/client" />
import { describe, expect, it, vi } from 'vitest';
import { DEV_PROXY_PATHS, DEV_REWRITES } from '../astro.config.mjs';
import { rewriteTo } from './_rewrite';

/**
 * The Worker's routes and the Pages Functions that forward to them are two
 * lists kept by hand, plus a third copy for `astro dev` in astro.config.mjs. A
 * route with no proxy is a 404 in production that every backend test passes;
 * these tests hold the lists together.
 *
 * This file is not a route either: Wrangler only routes files that export an
 * `onRequest*`.
 */

type Handler = (ctx: unknown) => Promise<Response>;

/** Answers with the binding a function handed the request to. */
function stubContext(path: string) {
  const answer = (by: string) => async (request: Request) =>
    new Response(`${by} ${new URL(request.url).pathname}`);
  return {
    request: new Request(`https://pages.test${path}`),
    env: {
      BACKEND: { fetch: answer('backend') },
      ASSETS: { fetch: answer('assets') },
    },
    next: async () => new Response('next'),
  };
}

/** Wrangler's file-path routing: `[[x]]` is any number of segments. */
function pagesPattern(file: string): RegExp {
  const source = file
    .replace(/^\.\//, '')
    .replace(/\.ts$/, '')
    .split('/')
    .filter((segment) => segment !== 'index')
    .map((segment) =>
      /^\[\[.+\]\]$/.test(segment)
        ? '(?:/[^/]+)*'
        : /^\[.+\]$/.test(segment)
          ? '/[^/]+'
          : `/${segment.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}`,
    )
    .join('');
  return new RegExp(`^${source}/?$`);
}

interface PagesFunction {
  file: string;
  pattern: RegExp;
  kind: 'backend' | 'assets' | 'next';
  onRequest: Handler;
}

async function pagesFunctions(): Promise<PagesFunction[]> {
  const modules = import.meta.glob<{ onRequest?: Handler }>(
    ['./**/*.ts', '!./**/*.spec.ts'],
    { eager: true },
  );
  const found: PagesFunction[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    if (!mod.onRequest) continue; // a helper such as _backend.ts
    const { onRequest } = mod;
    const response = await onRequest(stubContext('/probe'));
    const kind = (await response.text()).split(' ')[0] as PagesFunction['kind'];
    found.push({ file, pattern: pagesPattern(file), kind, onRequest });
  }
  return found;
}

/**
 * Every route the Worker answers, as one concrete path each. Imported through
 * a variable so `astro check` does not type the Worker with the frontend's
 * tsconfig; the backend checks its own types.
 */
async function workerPaths(): Promise<string[]> {
  const appModule = '../backend/src/app';
  const { createApp } = (await import(/* @vite-ignore */ appModule)) as {
    createApp(): { routes: { method: string; path: string }[] };
  };
  const paths = createApp()
    .routes.filter((route) => route.method !== 'ALL') // middleware
    .map((route) => route.path.replace(/:[^/]+/g, 'x'))
    // The Worker's own health check; `/` on Pages is the home page.
    .filter((path) => path !== '/');
  return [...new Set(paths)];
}

/** Built pages that sit under a proxied prefix and must stay pages. */
const STATIC_PAGES = ['/auth/callback'];

describe('Pages Functions proxies', () => {
  it('forward every route the Worker mounts', async () => {
    const functions = await pagesFunctions();
    const unforwarded = (await workerPaths()).filter((path) => {
      const match = functions.filter((f) => f.pattern.test(path));
      return !(match.length > 0 && match.every((f) => f.kind === 'backend'));
    });
    expect(unforwarded).toEqual([]);
  });

  it('only forward paths the Worker answers', async () => {
    const paths = await workerPaths();
    const orphans = (await pagesFunctions())
      .filter((f) => f.kind === 'backend')
      .filter((f) => !paths.some((path) => f.pattern.test(path)))
      .map((f) => f.file);
    expect(orphans).toEqual([]);
  });

  it('leave the static pages under /auth alone', async () => {
    const functions = await pagesFunctions();
    for (const page of STATIC_PAGES) {
      expect(functions.filter((f) => f.pattern.test(page))).toEqual([]);
    }
  });
});

describe('the astro dev proxy', () => {
  // Vite matches a string proxy key as a plain prefix of the request URL.
  const proxied = (path: string) =>
    DEV_PROXY_PATHS.some((prefix) => path.startsWith(prefix));

  it('forwards every route the Worker mounts', async () => {
    expect((await workerPaths()).filter((path) => !proxied(path))).toEqual([]);
  });

  it('only forwards paths the Worker answers', async () => {
    const paths = await workerPaths();
    expect(
      DEV_PROXY_PATHS.filter((p) => !paths.some((path) => path.startsWith(p))),
    ).toEqual([]);
  });

  it('leaves the static pages under /auth alone', () => {
    expect(STATIC_PAGES.filter(proxied)).toEqual([]);
  });

  it('rewrites the same pages the Pages Functions do', async () => {
    const rewrites = (await pagesFunctions()).filter(
      (f) => f.kind === 'assets',
    );
    expect(rewrites).toHaveLength(DEV_REWRITES.length);
    for (const f of rewrites) {
      const base = f.file.replace(/^\.\//, '/').replace(/\[\[.+$/, '');
      const sample = `${base}some-slug`;
      const served = await (await f.onRequest(stubContext(sample))).text();
      const dev = DEV_REWRITES.find(([pattern]) => pattern.test(sample));
      expect(dev, sample).toBeDefined();
      expect(served).toBe(`assets ${sample.replace(dev![0], dev![1])}`);
    }
  });
});

describe('rewriteTo', () => {
  it('serves the built page and keeps the query, method and headers', async () => {
    const fetch = vi.fn(async (_request: Request) => new Response('page'));
    const request = new Request('https://pages.test/i/rooftop-abc?x=1', {
      method: 'HEAD',
      headers: { 'accept-language': 'it' },
    });

    const response = await rewriteTo('/i/')({
      request,
      env: { ASSETS: { fetch } },
      next: async () => new Response('next'),
    });

    expect(await response.text()).toBe('page');
    const forwarded = fetch.mock.calls[0]![0];
    expect(new URL(forwarded.url).pathname).toBe('/i/');
    expect(new URL(forwarded.url).search).toBe('?x=1');
    expect(forwarded.method).toBe('HEAD');
    expect(forwarded.headers.get('accept-language')).toBe('it');
  });

  it('falls through when the deployment has no ASSETS binding', async () => {
    const response = await rewriteTo('/t/')({
      request: new Request('https://pages.test/t/abc'),
      env: {},
      next: async () => new Response('next'),
    });
    expect(await response.text()).toBe('next');
  });
});
