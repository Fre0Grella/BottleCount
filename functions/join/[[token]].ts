/**
 * Serves the co-organiser invitation page for every `/join/<token>` URL.
 *
 * Same arrangement as `functions/i/[[slug]].ts`: Pages Functions win over
 * static assets, so this rewrites the request onto the one built page and lets
 * the component read the token off the URL. Tokens are minted at runtime, so no
 * build could enumerate them.
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
  url.pathname = '/join/';
  return env.ASSETS.fetch(new Request(url, request));
}
