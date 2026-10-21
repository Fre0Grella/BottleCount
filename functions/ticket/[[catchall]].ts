import { proxyToBackend, type ProxyContext } from '../_backend';

/**
 * The public ticket endpoint behind short ticket links (`GET /ticket/:slug`),
 * outside `/api/*` because whoever opens a ticket has no account. Like
 * `/invite/*`, it needs a proxy of its own or it falls through to the static
 * build and every short link is a 404.
 */
export const onRequest = (ctx: ProxyContext): Promise<Response> =>
  proxyToBackend(ctx);
