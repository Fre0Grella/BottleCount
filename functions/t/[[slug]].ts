/**
 * Serves the ticket page for every `/t/<slug>` URL — the short ticket links of
 * #41 — and for the bare `/t/` the older fragment links (`/t/#t=…`) use.
 *
 * The same trick as `functions/i/[[slug]].ts`: a slug is minted at runtime, so
 * the build has no page at its path. This rewrites the asset lookup onto `/t/`,
 * the built ticket page, which reads the slug off the URL itself. The browser's
 * URL is untouched.
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
  if (!env.ASSETS) return next();

  const url = new URL(request.url);
  url.pathname = '/t/';
  return env.ASSETS.fetch(new Request(url, request));
}
