import { proxyToBackend, type ProxyContext } from '../_backend';

export const onRequest = (ctx: ProxyContext): Promise<Response> =>
  proxyToBackend(ctx);
