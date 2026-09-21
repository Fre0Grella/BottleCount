import { Hono } from 'hono';
import type { AppVariables } from '../appEnv';
import { issueSession } from './issueSession';

type Bindings = {
  JWT_SECRET: string;
  FRONTEND_URL: string;
  ENVIRONMENT: string;
  SELF_HOSTED?: string;
};

const devAuth = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

/**
 * Sign in without Google.
 *
 * Two audiences: local development, and self-hosters. Registering a Google
 * OAuth client is a real chunk of setup to demand of someone whose whole
 * reason for self-hosting may be that they wanted nothing to do with Google,
 * and a self-hosted Worker is single-tenant by definition — whoever can reach
 * it is already the owner.
 *
 * It is refused everywhere else. The check is on a binding, not on a request
 * header, so no caller can talk their way into it; on the hosted deployment
 * `SELF_HOSTED` is unset and `ENVIRONMENT` is "production", and this returns
 * 404 as though the route did not exist.
 */
devAuth.post('/dev', async (c) => {
  const enabled = c.env.SELF_HOSTED === 'true' || c.env.ENVIRONMENT === 'local';
  if (!enabled) return c.notFound();

  const body = await c.req
    .json<{ email?: string; name?: string }>()
    .catch(() => ({}) as { email?: string; name?: string });
  const email = body.email?.trim();
  if (!email) return c.json({ error: 'email is required' }, 400);

  const result = await c.var.repositories.users.upsertByIdentity({
    provider: 'dev',
    providerUserId: email,
    email,
    name: body.name ?? email.split('@')[0] ?? null,
    picture: null,
  });

  if (!result.ok) return c.json({ error: result.error }, 500);

  const { user, isNew } = result.value;
  await issueSession(c, {
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  });

  return c.json({ ok: true, isNew });
});

export default devAuth;
