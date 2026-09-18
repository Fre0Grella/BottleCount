import type { SessionDTO } from '../../shared/session';
import { featuresFor } from '../../shared/tiers';

/**
 * What the app assumes before — and if need be instead of — an answer from the
 * server: an anonymous browser on the free tier.
 *
 * This is the whole free product, so it is a real state rather than a loading
 * placeholder. A user who never signed in, an offline phone, a Worker that is
 * down and a self-hosted Pages project whose service binding is missing all
 * land here, and every one of them gets a working planner.
 */
export const ANONYMOUS_SESSION: SessionDTO = Object.freeze({
  authenticated: false,
  user: null,
  tier: 'free',
  features: featuresFor('free'),
  selfHosted: false,
  backendAvailable: false,
});

function isSessionDTO(value: unknown): value is SessionDTO {
  if (typeof value !== 'object' || value === null) return false;
  const dto = value as Partial<SessionDTO>;
  return (
    typeof dto.authenticated === 'boolean' &&
    typeof dto.tier === 'string' &&
    typeof dto.features === 'object' &&
    dto.features !== null
  );
}

/**
 * Asks the Worker who the caller is.
 *
 * Never throws and never rejects. Every failure — no backend deployed, a 501
 * from the proxy, a network error, a body that isn't a session — resolves to
 * {@link ANONYMOUS_SESSION}, because the alternative is an app that refuses to
 * start when the part of it that is meant to be optional is missing.
 */
export async function fetchSession(): Promise<SessionDTO> {
  try {
    const res = await fetch('/api/session', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return ANONYMOUS_SESSION;
    const body: unknown = await res.json();
    return isSessionDTO(body) ? body : ANONYMOUS_SESSION;
  } catch {
    return ANONYMOUS_SESSION;
  }
}

/** Clears the httpOnly session cookie, which only the server can do. */
export async function logout(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* Already effectively signed out as far as the user is concerned. */
  }
}

export interface RedeemResult {
  ok: boolean;
  error?: string;
}

/** Exchanges a purchased licence code for the `pro` tier. */
export async function redeemLicence(code: string): Promise<RedeemResult> {
  try {
    const res = await fetch('/api/licences/redeem', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}
