/**
 * Takes only the field it reads, so anything holding a `FRONTEND_URL` can ask —
 * the dev sign-in route has no OAuth client to speak of.
 */
export function resolveFrontendUrl(env: { FRONTEND_URL?: string }): string {
  let url = env.FRONTEND_URL ?? 'localhost:4321';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const isLocal = url.startsWith('localhost') || url.startsWith('127.');
    url = (isLocal ? 'http://' : 'https://') + url;
  }
  return url.replace(/\/$/, '');
}
