import { createMiddleware } from 'hono/factory';
import type { AppEnv, UserEnv } from '../appEnv';
import type { Invite } from '../repositories/inviteRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import type { Repositories } from '../repositories/repositories';

/**
 * A session's user, for the route groups that need one.
 *
 * The app's `/api/*` guard has already checked the cookie's signature; this
 * only insists the token names somebody, and puts their id where every handler
 * in the group can read it without a cast.
 */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const sub = c.get('jwtPayload')?.sub;
  if (typeof sub !== 'string') return c.json({ error: 'unauthenticated' }, 401);
  c.set('userId', sub);
  await next();
});

/**
 * Refuses a caller over the limit `binding` sets, keyed on their IP — the
 * endpoints it guards have no account to key on. An unbound limiter (local
 * development) is no limit.
 */
export function rateLimit(
  binding: 'INVITE_RATE_LIMITER' | 'TICKET_RATE_LIMITER',
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const limiter = c.env[binding];
    if (limiter) {
      const key = c.req.header('cf-connecting-ip') ?? 'unknown';
      const { success } = await limiter.limit({ key });
      if (!success) return c.json({ error: 'rate_limited' }, 429);
    }
    await next();
  });
}

/**
 * The party an invite link names, if guests may answer it.
 *
 * A party that does not exist, one whose link the owner closed, and one stored
 * only so a co-organiser could open it all come back alike: there is nothing
 * useful to tell a link holder apart from "this is not a party", and
 * distinguishing them would leak that a slug is real.
 */
export async function findOpenParty(
  repositories: Repositories,
  slug: string,
): Promise<PublishedParty | null> {
  const found = await repositories.parties.findBySlug(slug);
  return found.ok && found.value.invitesOpen ? found.value : null;
}

/**
 * An invite, only if it belongs to `partyId`. One from another party is as
 * absent as one that does not exist: an id is not a credential for a party it
 * is not in.
 */
export async function findPartyInvite(
  repositories: Repositories,
  partyId: string,
  inviteId: string,
): Promise<Invite | null> {
  const found = await repositories.invites.findById(inviteId);
  return found.ok && found.value.partyId === partyId ? found.value : null;
}
