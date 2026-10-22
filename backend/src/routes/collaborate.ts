import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { CollaboratorPreviewDTO } from '../../../shared/collab';
import type { UserEnv } from '../appEnv';
import type { CollaboratorInvite } from '../repositories/memberRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import { respond } from './http';
import { requireUser } from './middleware';

type Env = {
  Bindings: UserEnv['Bindings'];
  Variables: UserEnv['Variables'] & {
    invite: CollaboratorInvite;
    party: PublishedParty;
  };
};

const collaborate = new Hono<Env>();

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
collaborate.use('*', requireUser);

/**
 * Resolves `:token` to its invitation and party. A revoked link, an unknown
 * one and one whose party is gone all answer alike: which it is tells a
 * stranger whether they guessed a real token.
 */
collaborate.use(
  '/:token',
  createMiddleware<Env>(async (c, next) => {
    const unknown = () => c.json({ error: 'collaborator_invite_unknown' }, 404);

    const invite = await c.var.repositories.members.findInvite(
      c.req.param('token') ?? '',
    );
    if (!invite.ok) return unknown();

    const party = await c.var.repositories.parties.findById(
      invite.value.partyId,
    );
    if (!party.ok) return unknown();

    c.set('invite', invite.value);
    c.set('party', party.value);
    await next();
  }),
);

/** `GET /api/collaborate/:token` — what am I being asked to join? */
collaborate.get('/:token', async (c) => {
  const party = c.get('party');
  const inviter = await c.var.repositories.users.findById(
    c.get('invite').createdBy,
  );
  const existing = await c.var.repositories.members.roleFor(
    party.id,
    c.get('userId'),
  );

  const preview: CollaboratorPreviewDTO = {
    partyName: party.name,
    date: party.date,
    cover: party.cover,
    invitedBy: inviter.ok
      ? (inviter.value.name ?? inviter.value.email)
      : 'the host',
    alreadyMember: existing.ok,
  };
  return c.json(preview);
});

/** `POST /api/collaborate/:token` — join the party as an editor. */
collaborate.post('/:token', async (c) => {
  const party = c.get('party');

  // Adding is idempotent and never demotes, so an owner opening their own link
  // stays the owner and a second visit is not an error.
  const added = await c.var.repositories.members.add({
    partyId: party.id,
    userId: c.get('userId'),
    role: 'editor',
  });
  return respond(c, added, (member) => ({
    partyId: party.id,
    role: member.role,
  }));
});

export default collaborate;
