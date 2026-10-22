import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { deployment } from '../deployment';
import { readBody, text } from './http';
import { issueSession } from './issueSession';

const devAuth = new Hono<AppEnv>();

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
  if (!deployment(c.env).devSignIn) return c.notFound();

  const body = await readBody(c);
  const email = text(body, 'email').trim();
  if (!email) return c.json({ error: 'email is required' }, 400);

  const result = await c.var.repositories.users.upsertByIdentity({
    provider: 'dev',
    providerUserId: email,
    email,
    name:
      typeof body['name'] === 'string'
        ? body['name']
        : (email.split('@')[0] ?? null),
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
