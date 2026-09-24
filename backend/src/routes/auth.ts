import { Hono } from 'hono';
import { googleAuth } from '@hono/oauth-providers/google';
import { deleteCookie } from 'hono/cookie';
import type { AppVariables } from '../appEnv';
import { resolveFrontendUrl } from './frontendUrl';
import { issueSession } from './issueSession';

type Bindings = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  /** Only a fallback now — see routes/frontendUrl.ts. */
  FRONTEND_URL?: string;
  ENVIRONMENT?: string;
};

const auth = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

auth.use('/google', async (c, next) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Missing GOOGLE_CLIENT_ID' }, 500);
  }
  if (!c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: 'Missing GOOGLE_CLIENT_SECRET' }, 500);
  }
  const handler = googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ['openid', 'email', 'profile'],
    // The redirect target is the *frontend* origin: the Pages Function at
    // functions/auth/google.ts proxies it straight back here, which is what
    // keeps the session cookie first-party.
    // Derived from the request, so whichever domain the user reached the app
    // on is the one Google sends them back to. Each such domain has to be
    // registered as an authorised redirect URI on the OAuth client — Google
    // checks this against its own allowlist, which is also what stops a forged
    // Host header from redirecting the flow anywhere.
    redirect_uri: `${resolveFrontendUrl(c.env, c.req.raw)}/auth/google`,
  });
  return handler(c, next);
});

auth.get('/google', async (c) => {
  const frontendUrl = resolveFrontendUrl(c.env, c.req.raw);
  const oauthToken = c.get('token');
  const user = c.get('user-google');

  if (!oauthToken || !user?.id || !user.email) {
    return c.redirect(`${frontendUrl}/app?error=auth_failed`);
  }

  if (!c.env.JWT_SECRET) {
    return c.json({ error: 'Missing JWT_SECRET' }, 500);
  }

  const result = await c.var.repositories.users.upsertByIdentity({
    provider: 'google',
    providerUserId: user.id,
    email: user.email,
    name: user.name ?? null,
    picture: user.picture ?? null,
  });

  if (!result.ok) {
    console.error('Google sign-in failed to resolve a user:', result.error);
    return c.redirect(`${frontendUrl}/app?error=account_failed`);
  }

  const { user: account, isNew } = result.value;
  await issueSession(c, {
    sub: account.id,
    email: account.email,
    name: account.name,
    picture: account.picture,
  });

  return c.redirect(`${frontendUrl}/auth/callback${isNew ? '?new=1' : ''}`);
});

/**
 * Signing out is a route rather than a client-side cookie delete because the
 * cookie is httpOnly — the page that set it cannot clear it.
 */
auth.post('/logout', (c) => {
  deleteCookie(c, 'session_token', { path: '/' });
  return c.json({ ok: true });
});

export default auth;
