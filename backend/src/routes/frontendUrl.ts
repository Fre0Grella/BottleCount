/** What {@link resolveFrontendUrl} needs, whatever else its caller has. */
export interface FrontendUrlEnv {
  FRONTEND_URL?: string;
  ENVIRONMENT?: string;
}

/**
 * Where the browser should be sent back to.
 *
 * Taken from the request itself rather than from configuration, because the
 * Pages Function proxies `/auth/*` and `/api/*` over a service binding — an
 * internal dispatch that preserves the original request. The host this Worker
 * sees *is* the host the user typed. A configured value can only ever be a
 * second opinion about something the request already knows, and a stale one
 * sends every sign-in to whichever domain the config was written for.
 *
 * Deriving also means a custom domain, a preview deployment and a self-hoster
 * all work with nothing set.
 *
 * Two cases the request cannot answer, which fall back to `FRONTEND_URL`:
 *
 * - **Local development**, where the Astro dev server and `wrangler dev` are
 *   two different ports. The request arrives at the Worker's port, and the
 *   frontend is on the other one.
 * - **A direct hit on `*.workers.dev`**, which did not come through the proxy.
 *   That host is this Worker's own, and redirecting a user there lands them on
 *   a 404.
 */
export function resolveFrontendUrl(
  env: FrontendUrlEnv,
  request?: Request,
): string {
  return originFromRequest(env, request) ?? configuredUrl(env);
}

function originFromRequest(
  env: FrontendUrlEnv,
  request?: Request,
): string | null {
  if (!request) return null;
  // Local runs the frontend on a different port from this Worker, so the
  // request's own origin is the wrong answer by construction.
  if (env.ENVIRONMENT === 'local') return null;

  try {
    const url = new URL(request.url);
    if (url.hostname.endsWith('.workers.dev')) return null;

    // Force https for anything that is not loopback, rather than trusting the
    // scheme on the request. A service-binding dispatch is internal and its URL
    // is not guaranteed to carry the scheme the browser used; getting this
    // wrong produces an OAuth redirect_uri Google rejects and a session cookie
    // without `Secure`. No public deployment of this serves plain http.
    const loopback =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]';
    const protocol = loopback ? url.protocol : 'https:';

    return `${protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** The fallback, normalised: a bare host gets a scheme, a trailing slash goes. */
function configuredUrl(env: FrontendUrlEnv): string {
  let url = env.FRONTEND_URL || 'localhost:4321';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const isLocal = url.startsWith('localhost') || url.startsWith('127.');
    url = (isLocal ? 'http://' : 'https://') + url;
  }
  return url.replace(/\/$/, '');
}
