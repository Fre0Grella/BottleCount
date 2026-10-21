import { proxyToBackend, type ProxyContext } from '../../_backend';

// `/auth/guest-google` and `/auth/guest-google/callback` — a guest's "Continue
// with Google" (#22). Its own folder rather than an /auth catchall, for the
// reason in ../README.md.
export const onRequest = (ctx: ProxyContext): Promise<Response> =>
  proxyToBackend(ctx);
