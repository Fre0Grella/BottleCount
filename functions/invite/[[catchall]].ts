import { proxyToBackend, type ProxyContext } from '../_backend';

/**
 * The guest-facing endpoints, which are outside `/api/*` because guests have no
 * account. They still need a proxy of their own — without one, `/invite/...`
 * falls through to the static build and every RSVP is a 404.
 */
export const onRequest = (ctx: ProxyContext): Promise<Response> =>
  proxyToBackend(ctx);
