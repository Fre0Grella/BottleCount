import { request, type ApiResult } from './request';

/**
 * Who the caller is, as the Worker sees it. Unchecked: `fetchSession` in
 * `../session` decides what to make of the answer.
 */
export function getSession(): Promise<ApiResult<unknown>> {
  return request('/api/session');
}

/**
 * Signs in by email alone, where the Worker allows it (`session.devSignIn`):
 * local development and self-hosted deployments. The cookie it sets is the same
 * one Google sign-in sets, so nothing downstream can tell them apart.
 */
export function devSignIn(email: string): Promise<ApiResult<unknown>> {
  return request('/auth/dev', { method: 'POST', body: { email } });
}

/** Clears the httpOnly session cookie, which only the server can do. */
export async function logout(): Promise<void> {
  // A failure is ignored: already effectively signed out as far as the user is
  // concerned.
  await request('/auth/logout', { method: 'POST' });
}

/** Exchanges a purchased licence code for the `pro` tier. */
export function redeemLicence(code: string): Promise<ApiResult<unknown>> {
  return request('/api/licences/redeem', { method: 'POST', body: { code } });
}
