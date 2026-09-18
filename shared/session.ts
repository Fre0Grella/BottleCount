import type { Feature, FeatureSet, Tier } from './tiers';

/** The signed-in user, as the frontend is allowed to see them. */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/**
 * The answer to "what may this browser do?", and the only place the frontend
 * learns it.
 *
 * It is served to anonymous callers too — that is the free tier, and a 401
 * there would make the browser-only product depend on being logged out
 * *successfully*. A frontend with no backend at all (the static build) fabricates
 * the same shape locally, so every consumer sees one type.
 */
export interface SessionDTO {
  authenticated: boolean;
  user: SessionUser | null;
  tier: Tier;
  features: FeatureSet;
  /** True when this is somebody's own deployment, which grants `pro` outright. */
  selfHosted: boolean;
  /** False when no backend is reachable — the pure browser-only build. */
  backendAvailable: boolean;
}

export type { Feature, FeatureSet, Tier };
