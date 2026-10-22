/**
 * Serves one built page for a whole space of runtime-minted URLs.
 *
 * Invite slugs, join tokens and ticket slugs are minted at runtime, long after
 * the build, so the build has one page for each space (`/i/`, `/join/`, `/t/`)
 * and cannot have one at `/i/rooftop-abc123`. Pages Functions win over static
 * assets on the same path, so the function for the space has to hand back the
 * asset itself: it rewrites the asset lookup onto the built page and lets the
 * component read the slug off the URL. The browser's URL is untouched.
 *
 * Wrangler makes a route of every file here that exports an `onRequest*`, so
 * this one exports a factory instead and each route file is one line.
 */
interface RewriteEnv {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface RewriteContext {
  request: Request;
  env: RewriteEnv;
  next(): Promise<Response>;
}

export function rewriteTo(
  pathname: string,
): (ctx: RewriteContext) => Promise<Response> {
  return async ({ request, env, next }) => {
    // A deployment without the ASSETS binding still works: fall through and
    // let the platform serve whatever it would have.
    if (!env.ASSETS) return next();

    const url = new URL(request.url);
    url.pathname = pathname;
    return env.ASSETS.fetch(new Request(url, request));
  };
}
