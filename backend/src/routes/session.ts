import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import type { SessionDTO } from '../../../shared/session';
import { featuresFor } from '../../../shared/tiers';
import type { AppEnv } from '../appEnv';
import { deployment, effectiveTier } from '../deployment';

const session = new Hono<AppEnv>();

/** Anonymous free tier — what an unsigned, expired or unreadable cookie means. */
function anonymous(selfHosted: boolean, devSignIn: boolean): SessionDTO {
  const tier = effectiveTier(null, {});
  return {
    authenticated: false,
    user: null,
    tier,
    features: featuresFor(tier),
    selfHosted,
    backendAvailable: true,
    devSignIn,
  };
}

/**
 * `GET /api/session` — public on purpose.
 *
 * Every other `/api/*` route sits behind the JWT guard, but this one answers
 * for logged-out browsers as well, because "logged out" is a supported tier
 * rather than an error. An unreadable cookie degrades to anonymous instead of
 * 401 for the same reason: a user whose session expired mid-plan should quietly
 * drop to free, not be shown a failure over a product they are still using.
 */
session.get('/', async (c) => {
  const { selfHosted, devSignIn } = deployment(c.env);
  const token = getCookie(c, 'session_token');
  if (!token) return c.json(anonymous(selfHosted, devSignIn));

  let sub: string;
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    if (typeof payload.sub !== 'string')
      return c.json(anonymous(selfHosted, devSignIn));
    sub = payload.sub;
  } catch {
    return c.json(anonymous(selfHosted, devSignIn));
  }

  // The tier comes from the row, never from the cookie: a JWT lives 7 days, and
  // a claim baked into one would keep granting `pro` for a week after a refund
  // — or withhold it until re-login after a purchase.
  const found = await c.var.repositories.users.findById(sub);
  if (!found.ok) return c.json(anonymous(selfHosted, devSignIn));

  const user = found.value;
  const tier = effectiveTier(user.tier, c.env);

  const dto: SessionDTO = {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    tier,
    features: featuresFor(tier),
    selfHosted,
    backendAvailable: true,
    devSignIn,
  };
  return c.json(dto);
});

export default session;
