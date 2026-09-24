import type { Context, Env } from 'hono';
import { setCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';
import { resolveFrontendUrl } from './frontendUrl';

const SESSION_DAYS = 7;

/** Who the session says the caller is. `sub` is our user id, not Google's. */
export interface SessionClaims {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

type SessionEnv = Env & {
  Bindings: { JWT_SECRET: string; FRONTEND_URL?: string; ENVIRONMENT?: string };
};

/**
 * Signs a session and sets it as the `session_token` cookie.
 *
 * Both sign-in routes go through here, so a feature downstream never has to
 * know which door a user came through — and the two cannot drift apart on
 * `secure` or on the expiry, which is the kind of difference nothing fails on
 * until it locks someone out.
 *
 * The Pages Function proxy serves the frontend and this Worker on one origin,
 * so the cookie is first-party and SameSite=Lax suffices. `secure` mirrors the
 * frontend's scheme so the cookie also works against http://localhost.
 */
export async function issueSession<E extends SessionEnv>(
  c: Context<E>,
  claims: SessionClaims,
): Promise<void> {
  const payload: JWTPayload = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * SESSION_DAYS,
  };

  const token = await sign(payload, c.env.JWT_SECRET, 'HS256');

  setCookie(c, 'session_token', token, {
    httpOnly: true,
    secure: resolveFrontendUrl(c.env, c.req.raw).startsWith('https://'),
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}
