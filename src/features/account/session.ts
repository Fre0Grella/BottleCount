import type { SessionDTO } from '../../../shared/session';
import { featuresFor } from '../../../shared/tiers';
import { getSession } from '../../lib/api/session';

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
  devSignIn: false,
  coverPhotos: false,
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
  const result = await getSession();
  return result.ok && isSessionDTO(result.value)
    ? result.value
    : ANONYMOUS_SESSION;
}
