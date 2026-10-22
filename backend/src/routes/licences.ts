import { Hono } from 'hono';
import { featuresFor, type Tier } from '../../../shared/tiers';
import type { Bindings, UserEnv } from '../appEnv';
import { effectiveTier } from '../deployment';
import { fail, readBody, text } from './http';
import { requireUser } from './middleware';

/**
 * Whether `code` is this deployment's test licence.
 *
 * Every paid feature sits behind a redeemed code, and a minted one is spent on
 * first use — so testing the upgrade, or a second account, would mean minting
 * again each time. The test code is reusable, never written to `licence_keys`,
 * and comes from a var set only on the `local` and `preview` environments.
 *
 * Refused on production whatever the var says: the code is in a public
 * repository, so a copy-pasted env block must not become a free licence.
 */
function isTestLicence(
  env: Pick<Bindings, 'ENVIRONMENT' | 'TEST_LICENCE_CODE'>,
  code: string,
): boolean {
  if (env.ENVIRONMENT === 'production') return false;
  const expected = env.TEST_LICENCE_CODE?.trim().toUpperCase();
  return !!expected && code.toUpperCase() === expected;
}

const licences = new Hono<UserEnv>();

licences.use('*', requireUser);

/**
 * `POST /api/licences/redeem` — turn a purchased code into `pro`.
 *
 * This is the whole upgrade path for now. No checkout provider is wired yet
 * (ADR 0001), so codes are minted by hand with `npm run licence:issue`; when
 * one is chosen, its webhook inserts rows into the same table and nothing here
 * changes.
 */
licences.post('/redeem', async (c) => {
  const userId = c.get('userId');
  const code = text(await readBody(c), 'code').trim();
  if (!code) return c.json({ error: 'code is required' }, 400);

  let grantedTier: Tier;
  if (isTestLicence(c.env, code)) {
    grantedTier = 'pro';
  } else {
    const redeemed = await c.var.repositories.licences.redeem(code, userId);
    if (!redeemed.ok) return fail(c, redeemed.error);
    grantedTier = redeemed.value.tier;
  }

  // A session whose user genuinely does not exist is a 404; anything else is
  // ours and must not be dressed up as a missing user.
  const updated = await c.var.repositories.users.setTier(userId, grantedTier);
  if (!updated.ok) return fail(c, updated.error);

  const tier = effectiveTier(updated.value.tier, c.env);
  return c.json({ tier, features: featuresFor(tier) });
});

export default licences;
