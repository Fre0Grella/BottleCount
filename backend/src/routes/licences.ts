import { Hono } from 'hono';
import type { JwtVariables } from 'hono/jwt';
import { featuresFor, resolveTier } from '../../../shared/tiers';
import type { AppVariables } from '../appEnv';
import { LICENCE_ERRORS } from '../repositories/licenceRepository';
import { userErrorStatus } from './helpers';

type Bindings = {
  SELF_HOSTED?: string;
};

const licences = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables & JwtVariables;
}>();

/**
 * `POST /api/licences/redeem` — turn a purchased code into `pro`.
 *
 * This is the whole upgrade path for now. No checkout provider is wired yet
 * (ADR 0001), so codes are minted by hand with `npm run licence:issue`; when
 * one is chosen, its webhook inserts rows into the same table and nothing here
 * changes.
 */
licences.post('/redeem', async (c) => {
  const sub = c.get('jwtPayload')?.sub;
  if (typeof sub !== 'string') return c.json({ error: 'unauthenticated' }, 401);

  const body = await c.req
    .json<{ code?: string }>()
    .catch(() => ({}) as { code?: string });
  const code = body.code?.trim();
  if (!code) return c.json({ error: 'code is required' }, 400);

  const redeemed = await c.var.repositories.licences.redeem(code, sub);
  if (!redeemed.ok) {
    // An unknown code and a spent one answer alike: telling them apart lets
    // someone probe the keyspace for codes that merely belong to somebody else.
    const status = redeemed.error === LICENCE_ERRORS.UNKNOWN ? 404 : 409;
    return c.json({ error: redeemed.error }, status);
  }

  const updated = await c.var.repositories.users.setTier(
    sub,
    redeemed.value.tier,
  );
  if (!updated.ok) {
    return c.json({ error: updated.error }, userErrorStatus(updated.error));
  }

  const tier = resolveTier({
    storedTier: updated.value.tier,
    selfHosted: c.env.SELF_HOSTED === 'true',
  });
  return c.json({ tier, features: featuresFor(tier) });
});

export default licences;
