/**
 * Hands `/api/*` and `/auth/*` to the Worker over a service binding.
 *
 * The point is the origin. A service binding is an internal dispatch, not a
 * network hop, so the browser only ever talks to the Pages domain — which makes
 * the `session_token` cookie first-party, lets it be `SameSite=Lax`, and means
 * no CORS preflight stands between a user and signing in. Pointing the frontend
 * straight at `*.workers.dev` instead would make every session cross-site.
 *
 * A file prefixed with `_` is not itself a route, so this module stays shared
 * helper code rather than becoming a `/_backend` endpoint.
 */
export interface ProxyEnv {
  BACKEND?: { fetch(request: Request): Promise<Response> };
}

export interface ProxyContext {
  request: Request;
  env: ProxyEnv;
}

export async function proxyToBackend({
  request,
  env,
}: ProxyContext): Promise<Response> {
  // A Pages deployment with no service binding — a self-hoster who has not
  // wired the Worker up yet. The free tier is entirely client-side, so answer
  // in the shape the frontend already handles and let the planner carry on,
  // rather than failing the request.
  if (!env.BACKEND) {
    return Response.json(
      { error: 'backend_unavailable' },
      { status: 501, headers: { 'cache-control': 'no-store' } },
    );
  }
  return env.BACKEND.fetch(request);
}
