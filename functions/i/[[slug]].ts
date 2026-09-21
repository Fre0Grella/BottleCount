/**
 * Serves the invite page for every `/i/<slug>` URL.
 *
 * Pages Functions win over static assets on the same path, so this one has to
 * hand back the asset itself: it rewrites the request onto `/i/`, which is the
 * built invite page, and lets the component read the slug off the URL. Without
 * it, `/i/rooftop-abc123` is a 404 — the build has no page at that path and
 * cannot have one, because slugs are minted at runtime, long after the build.
 *
 * The browser's URL is untouched; only the asset lookup is redirected.
 */
interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface Ctx {
  request: Request;
  env: Env;
  next(): Promise<Response>;
}

export async function onRequest({
  request,
  env,
  next,
}: Ctx): Promise<Response> {
  // A deployment without the ASSETS binding still works: fall through and let
  // the platform serve whatever it would have.
  if (!env.ASSETS) return next();

  const url = new URL(request.url);
  url.pathname = '/i/';
  return env.ASSETS.fetch(new Request(url, request));
}
