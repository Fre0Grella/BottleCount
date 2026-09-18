import { Hono } from 'hono';
import type { JwtVariables } from 'hono/jwt';
import type { CollaboratorPreviewDTO } from '../../../shared/collab';
import { featuresFor, resolveTier } from '../../../shared/tiers';
import type { AppVariables } from '../appEnv';
import { MEMBER_ERRORS } from '../repositories/memberRepository';

type Bindings = {
  SELF_HOSTED?: string;
};

const collaborate = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables & JwtVariables;
}>();

/**
 * Accepting a co-organiser invitation.
 *
 * Unlike a guest invite, this one needs an account: a co-organiser edits the
 * party, so there has to be someone to attribute the edit to and someone the
 * owner can later remove.
 *
 * It does **not** require the invitee to be on the paid tier. The party is
 * somebody else's, already paid for, and charging both people to run one party
 * would make the feature useless — you cannot co-organise alone. What a free
 * co-organiser does not get is parties of their own.
 */
collaborate.use('*', async (c, next) => {
  const sub = c.get('jwtPayload')?.sub;
  if (typeof sub !== 'string') return c.json({ error: 'unauthenticated' }, 401);
  c.set('userId', sub);
  return next();
});

/** `GET /api/collaborate/:token` — what am I being asked to join? */
collaborate.get('/:token', async (c) => {
  const userId = c.get('userId') as string;
  const invite = await c.var.repositories.members.findInvite(
    c.req.param('token'),
  );
  if (!invite.ok) {
    // A revoked link and an unknown one answer alike: which it is tells a
    // stranger whether they guessed a real token.
    return c.json({ error: 'collaborator_invite_unknown' }, 404);
  }

  const party = await c.var.repositories.parties.findById(invite.value.partyId);
  if (!party.ok) return c.json({ error: 'collaborator_invite_unknown' }, 404);

  const inviter = await c.var.repositories.users.findById(
    invite.value.createdBy,
  );
  const existing = await c.var.repositories.members.roleFor(
    party.value.id,
    userId,
  );

  const preview: CollaboratorPreviewDTO = {
    partyName: party.value.name,
    date: party.value.date,
    cover: party.value.cover,
    invitedBy: inviter.ok
      ? (inviter.value.name ?? inviter.value.email)
      : 'the host',
    alreadyMember: existing.ok,
  };
  return c.json(preview);
});

/** `POST /api/collaborate/:token` — join the party as an editor. */
collaborate.post('/:token', async (c) => {
  const userId = c.get('userId') as string;
  const invite = await c.var.repositories.members.findInvite(
    c.req.param('token'),
  );
  if (!invite.ok) {
    return c.json({ error: 'collaborator_invite_unknown' }, 404);
  }

  const party = await c.var.repositories.parties.findById(invite.value.partyId);
  if (!party.ok) return c.json({ error: 'collaborator_invite_unknown' }, 404);

  // Adding is idempotent and never demotes, so an owner opening their own link
  // stays the owner and a second visit is not an error.
  const added = await c.var.repositories.members.add({
    partyId: party.value.id,
    userId,
    role: 'editor',
  });
  if (!added.ok) {
    const status = added.error === MEMBER_ERRORS.NOT_FOUND ? 404 : 500;
    return c.json({ error: added.error }, status);
  }

  return c.json({ partyId: party.value.id, role: added.value.role });
});

export default collaborate;
