import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyDocument } from '../../../../shared/collab';
import type { PublishPartyRequest } from '../../../../shared/invites';
import { INVITE_ERRORS } from '../../repositories/inviteRepository';
import type { Invite } from '../../repositories/inviteRepository';
import type { LicenceKey } from '../../repositories/licenceRepository';
import { LICENCE_ERRORS } from '../../repositories/licenceRepository';
import { MEMBER_ERRORS } from '../../repositories/memberRepository';
import { PARTY_ERRORS } from '../../repositories/partyRepository';
import type { PublishedParty } from '../../repositories/partyRepository';
import type { Repositories } from '../../repositories/repositories';
import type { Result } from '../../repositories/result';
import type { User } from '../../repositories/userRepository';
import { USER_ERRORS } from '../../repositories/userRepository';
import { aDocument } from '../support/party';

/**
 * What every storage target promises, written once against the interfaces.
 *
 * The route tests run on in-memory fakes, so a fake that drifts from D1 makes
 * them pass for the wrong reason. These cases are the definition both have to
 * meet: today they run against the fakes (`fakes.spec.ts`); a runner with a
 * real D1 binding passes its own `make` and runs the same cases unchanged.
 *
 * Everything is seeded through the interfaces themselves — users by signing
 * in, parties by publishing — so a target with foreign keys gets rows that
 * satisfy them. Only licences, which nothing in the app creates, are seeded.
 */
export interface ContractTarget {
  make(seed: { licences: LicenceKey[] }): Repositories | Promise<Repositories>;
  /**
   * Makes the next ticket-code draws return `codes`, in order. Optional: a
   * target that cannot steer the draw skips the collision case.
   */
  forceTicketCodes?(codes: string[]): void;
}

/** The value of a result the case expects to have succeeded. */
function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
}

export function repositoryContract(name: string, target: ContractTarget): void {
  describe(`repository contract: ${name}`, () => {
    let repos: Repositories;
    let clock = Date.parse('2026-06-01T12:00:00.000Z');

    /** Moves time on, so rows written one after another sort as they were. */
    function tick(): void {
      clock += 1000;
      vi.setSystemTime(clock);
    }

    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      tick();
      repos = await target.make({
        licences: [
          {
            code: 'BC-AAAA-BBBB',
            tier: 'pro',
            issuedAt: '2026-01-01T00:00:00.000Z',
            redeemedAt: null,
            redeemedBy: null,
            note: null,
          },
        ],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function signIn(
      email: string,
      providerUserId = email,
    ): Promise<User> {
      tick();
      return value(
        await repos.users.upsertByIdentity({
          provider: 'dev',
          providerUserId,
          email,
          name: email.split('@')[0],
        }),
      ).user;
    }

    async function publish(
      ownerId: string,
      document: Partial<PartyDocument> = {},
      localId = 1,
    ): Promise<PublishedParty> {
      tick();
      const request: PublishPartyRequest = {
        localId,
        document: aDocument(document),
      };
      return value(await repos.parties.publish(ownerId, request));
    }

    async function openInvite(
      partyId: string,
      referrerToken: string | null = null,
    ): Promise<Invite> {
      tick();
      return value(
        await repos.invites.open({
          partyId,
          referrerToken,
          rootToken: 'root',
          existingInviteId: null,
        }),
      );
    }

    // ── Users ──────────────────────────────────────────────────────────────

    describe('users', () => {
      it('creates a user on their first sign-in only', async () => {
        const first = await repos.users.upsertByIdentity({
          provider: 'google',
          providerUserId: 'g-1',
          email: 'giulia@example.com',
          name: 'Giulia',
        });
        const again = await repos.users.upsertByIdentity({
          provider: 'google',
          providerUserId: 'g-1',
          email: 'giulia@example.com',
          name: 'Giulia R.',
        });

        expect(value(first).isNew).toBe(true);
        expect(value(again).isNew).toBe(false);
        expect(value(again).user.id).toBe(value(first).user.id);
        // The provider's side changes; the row follows it.
        expect(value(again).user.name).toBe('Giulia R.');
        expect(value(first).user.tier).toBe('free');
      });

      it('attaches a second provider to the user its email names', async () => {
        const dev = await signIn('giulia@example.com');
        const google = value(
          await repos.users.upsertByIdentity({
            provider: 'google',
            providerUserId: 'g-1',
            email: 'giulia@example.com',
          }),
        );

        expect(google).toMatchObject({ isNew: false, user: { id: dev.id } });
      });

      it('finds a known identity by the identity, not the email', async () => {
        // An address changed at the provider is still the same account.
        const before = value(
          await repos.users.upsertByIdentity({
            provider: 'google',
            providerUserId: 'g-1',
            email: 'old@example.com',
          }),
        ).user;
        const after = value(
          await repos.users.upsertByIdentity({
            provider: 'google',
            providerUserId: 'g-1',
            email: 'new@example.com',
          }),
        );

        expect(after).toMatchObject({ isNew: false, user: { id: before.id } });
      });

      it('sets a tier, and knows nobody it has not met', async () => {
        const user = await signIn('host@example.com');

        expect(value(await repos.users.setTier(user.id, 'pro')).tier).toBe(
          'pro',
        );
        expect(value(await repos.users.findById(user.id)).tier).toBe('pro');
        expect(await repos.users.findById('nobody')).toEqual({
          ok: false,
          error: USER_ERRORS.NOT_FOUND,
        });
        expect(await repos.users.setTier('nobody', 'pro')).toEqual({
          ok: false,
          error: USER_ERRORS.NOT_FOUND,
        });
      });
    });

    // ── Licences ───────────────────────────────────────────────────────────

    describe('licences', () => {
      it('grants the tier once, however the code is typed', async () => {
        const user = await signIn('host@example.com');

        const redeemed = value(
          await repos.licences.redeem(' bc-aaaa-bbbb ', user.id),
        );

        expect(redeemed).toMatchObject({ tier: 'pro', redeemedBy: user.id });
      });

      it('is idempotent for the holder and refused to anyone else', async () => {
        const holder = await signIn('host@example.com');
        const other = await signIn('other@example.com');
        await repos.licences.redeem('BC-AAAA-BBBB', holder.id);

        expect(
          (await repos.licences.redeem('BC-AAAA-BBBB', holder.id)).ok,
        ).toBe(true);
        expect(await repos.licences.redeem('BC-AAAA-BBBB', other.id)).toEqual({
          ok: false,
          error: LICENCE_ERRORS.ALREADY_REDEEMED,
        });
        expect(await repos.licences.redeem('BC-NOPE', holder.id)).toEqual({
          ok: false,
          error: LICENCE_ERRORS.UNKNOWN,
        });
      });
    });

    // ── Parties ────────────────────────────────────────────────────────────

    describe('parties', () => {
      it('stores a party closed to guests, with its owner as owner', async () => {
        const owner = await signIn('host@example.com');

        const party = await publish(owner.id);

        expect(party).toMatchObject({
          ownerId: owner.id,
          name: 'Rooftop',
          version: 1,
          invitesOpen: false,
        });
        expect(party.ticketKey).not.toBeNull();
        expect(value(await repos.members.roleFor(party.id, owner.id))).toBe(
          'owner',
        );
        expect(value(await repos.parties.findBySlug(party.slug)).id).toBe(
          party.id,
        );
        expect(value(await repos.parties.findById(party.id)).document).toEqual(
          party.document,
        );
      });

      it('republishes into the same row without touching its links', async () => {
        const owner = await signIn('host@example.com');
        const first = await publish(owner.id);
        await repos.parties.setInvitesOpen(first.id, true);

        const again = await publish(owner.id, { name: 'Rooftop II' });

        expect(again).toMatchObject({
          id: first.id,
          slug: first.slug,
          rootToken: first.rootToken,
          version: 2,
          name: 'Rooftop II',
          // Storing the party again must not close, or reopen, the link.
          invitesOpen: true,
        });
        expect(again.ticketKey).toEqual(first.ticketKey);
        expect(value(await repos.members.roleFor(first.id, owner.id))).toBe(
          'owner',
        );
      });

      it('opens and closes the link, and says when', async () => {
        const owner = await signIn('host@example.com');
        const party = await publish(owner.id);

        tick();
        const opened = value(
          await repos.parties.setInvitesOpen(party.id, true),
        );
        tick();
        const closed = value(
          await repos.parties.setInvitesOpen(party.id, false),
        );

        expect(opened.invitesOpen).toBe(true);
        expect(closed.invitesOpen).toBe(false);
        expect(opened.updatedAt > party.updatedAt).toBe(true);
        expect(closed.updatedAt > opened.updatedAt).toBe(true);
        expect(await repos.parties.setInvitesOpen('nope', true)).toEqual({
          ok: false,
          error: PARTY_ERRORS.NOT_FOUND,
        });
      });

      it('lists what a user can open, newest party first', async () => {
        const owner = await signIn('host@example.com');
        const friend = await signIn('friend@example.com');
        const older = await publish(owner.id, { date: '2026-03-01' }, 1);
        const newer = await publish(owner.id, { date: '2026-09-01' }, 2);
        await repos.members.add({
          partyId: older.id,
          userId: friend.id,
          role: 'editor',
        });

        const mine = value(await repos.parties.listForUser(owner.id));
        const theirs = value(await repos.parties.listForUser(friend.id));

        expect(mine.map((p) => p.id)).toEqual([newer.id, older.id]);
        expect(mine[1]).toMatchObject({ role: 'owner', memberCount: 2 });
        expect(theirs).toEqual([
          expect.objectContaining({ id: older.id, role: 'editor' }),
        ]);
      });

      it('merges a patch and bumps the version', async () => {
        const owner = await signIn('host@example.com');
        const party = await publish(owner.id);

        const patched = value(
          await repos.parties.patchDocument({
            partyId: party.id,
            patch: { name: 'Renamed', venue: { city: 'Turin' } },
          }),
        );

        expect(patched.version).toBe(2);
        expect(patched.document.name).toBe('Renamed');
        expect(patched.document.venue).toEqual({
          place: 'The Roof',
          city: 'Turin',
          time: '21:00',
        });
        const found = value(await repos.parties.findById(party.id));
        expect(found).toMatchObject({ name: 'Renamed', version: 2 });
        expect(found.venue.city).toBe('Turin');
        expect(
          await repos.parties.patchDocument({ partyId: 'nope', patch: {} }),
        ).toEqual({ ok: false, error: PARTY_ERRORS.NOT_FOUND });
      });

      it('reads a document a patch broke as a whole one', async () => {
        const owner = await signIn('host@example.com');
        const party = await publish(owner.id);

        const patched = value(
          await repos.parties.patchDocument({
            partyId: party.id,
            patch: { settings: null, venue: null, name: null },
          }),
        );
        const found = value(await repos.parties.findById(party.id));

        expect(patched.document.settings.max_capacity).toBeNull();
        // What it was published with, not a blank.
        expect(found.venue).toEqual({
          place: 'The Roof',
          city: 'Milan',
          time: '21:00',
        });
        expect(found.maxCapacity).toBeNull();
        // The name it was published under, not none.
        expect(found.name).toBe('Rooftop');
        expect(found.document?.name).toBe('Rooftop');
      });

      it('takes everything of the party with it when deleted', async () => {
        const owner = await signIn('host@example.com');
        const friend = await signIn('friend@example.com');
        const party = await publish(owner.id);
        await repos.members.add({
          partyId: party.id,
          userId: friend.id,
          role: 'editor',
        });
        const link = value(
          await repos.members.createInvite({
            partyId: party.id,
            createdBy: owner.id,
          }),
        );
        const guest = await openInvite(party.id);

        expect((await repos.parties.deleteById(party.id)).ok).toBe(true);

        expect((await repos.parties.findById(party.id)).ok).toBe(false);
        expect((await repos.invites.findById(guest.id)).ok).toBe(false);
        expect((await repos.members.roleFor(party.id, friend.id)).ok).toBe(
          false,
        );
        expect(value(await repos.parties.listForUser(friend.id))).toEqual([]);
        expect(value(await repos.members.listMembers(party.id))).toEqual([]);
        expect((await repos.members.findInvite(link.token)).ok).toBe(false);
        expect(await repos.parties.deleteById(party.id)).toEqual({
          ok: false,
          error: PARTY_ERRORS.NOT_FOUND,
        });
      });
    });

    // ── Invites ────────────────────────────────────────────────────────────

    describe('invites', () => {
      let party: PublishedParty;

      beforeEach(async () => {
        const owner = await signIn('host@example.com');
        party = await publish(owner.id);
      });

      it('opens at the depth of whoever forwarded the link', async () => {
        const root = await openInvite(party.id, 'root');
        const unknown = await openInvite(party.id, 'not-a-token');
        const forwarded = await openInvite(party.id, root.forwardToken);

        expect(root).toMatchObject({
          depth: 0,
          referrerId: null,
          status: 'opened',
          source: 'link',
          name: null,
        });
        expect(unknown).toMatchObject({ depth: 0, referrerId: null });
        expect(forwarded).toMatchObject({ depth: 1, referrerId: root.id });
        expect(root.ticketCode).toMatch(/^[A-Z0-9]{5}$/);
      });

      it('gives a returning browser its own row, in its own party only', async () => {
        const owner2 = await signIn('other@example.com');
        const otherParty = await publish(owner2.id);
        const first = await openInvite(party.id);

        const again = value(
          await repos.invites.open({
            partyId: party.id,
            referrerToken: null,
            rootToken: 'root',
            existingInviteId: first.id,
          }),
        );
        const elsewhere = value(
          await repos.invites.open({
            partyId: otherParty.id,
            referrerToken: null,
            rootToken: 'root',
            existingInviteId: first.id,
          }),
        );

        expect(again.id).toBe(first.id);
        expect(elsewhere.id).not.toBe(first.id);
        expect(elsewhere.partyId).toBe(otherParty.id);
      });

      it('redraws a ticket code its party already has', async () => {
        if (!target.forceTicketCodes) return;
        target.forceTicketCodes(['AAAAA', 'AAAAA', 'BBBBB']);

        const first = await openInvite(party.id);
        const second = value(
          await repos.invites.addManual({
            partyId: party.id,
            name: 'Giulia',
            contact: { email: null, phone: null },
          }),
        );

        expect(first.ticketCode).toBe('AAAAA');
        expect(second.ticketCode).toBe('BBBBB');
      });

      it('refuses a confirmation past capacity, never a decline', async () => {
        const a = await openInvite(party.id);
        const b = await openInvite(party.id);
        const answer = (id: string, ans: 'confirmed' | 'declined') =>
          repos.invites.answer({
            inviteId: id,
            partyId: party.id,
            name: 'Guest',
            answer: ans,
            maxCapacity: 1,
            contact: { email: 'g@example.com', phone: null },
          });

        expect(value(await answer(a.id, 'confirmed')).status).toBe('confirmed');
        // Already counted: correcting their own answer still fits.
        expect((await answer(a.id, 'confirmed')).ok).toBe(true);
        expect(await answer(b.id, 'confirmed')).toEqual({
          ok: false,
          error: INVITE_ERRORS.PARTY_FULL,
        });
        expect(value(await answer(b.id, 'declined')).status).toBe('declined');
        expect(value(await repos.invites.countConfirmed(party.id))).toBe(1);
      });

      it('stores the answer and replaces the contact', async () => {
        const guest = await openInvite(party.id);

        const answered = value(
          await repos.invites.answer({
            inviteId: guest.id,
            partyId: party.id,
            name: 'Giulia',
            answer: 'confirmed',
            maxCapacity: null,
            contact: { email: 'g@example.com', phone: null },
          }),
        );
        const declined = value(
          await repos.invites.answer({
            inviteId: guest.id,
            partyId: party.id,
            name: 'Giulia',
            answer: 'declined',
            maxCapacity: null,
            contact: { email: null, phone: null },
          }),
        );

        expect(answered).toMatchObject({
          name: 'Giulia',
          status: 'confirmed',
          email: 'g@example.com',
        });
        expect(answered.answeredAt).not.toBeNull();
        expect(declined).toMatchObject({ status: 'declined', email: null });
      });

      it('finds nothing through another party or an unknown id', async () => {
        const owner2 = await signIn('other@example.com');
        const otherParty = await publish(owner2.id);
        const guest = await openInvite(party.id);
        const notFound = { ok: false, error: INVITE_ERRORS.NOT_FOUND };
        const elsewhere = { inviteId: guest.id, partyId: otherParty.id };

        expect(
          await repos.invites.answer({
            ...elsewhere,
            name: 'X',
            answer: 'confirmed',
            maxCapacity: null,
            contact: { email: null, phone: null },
          }),
        ).toEqual(notFound);
        expect(
          await repos.invites.setStatus({ ...elsewhere, status: 'confirmed' }),
        ).toEqual(notFound);
        expect(
          await repos.invites.setContact({
            ...elsewhere,
            contact: { email: 'x@example.com', phone: null },
          }),
        ).toEqual(notFound);
        expect(
          await repos.invites.setPaid({ ...elsewhere, at: '2026-01-01' }),
        ).toEqual(notFound);
        expect(
          await repos.invites.checkIn({ ...elsewhere, at: '2026-01-01' }),
        ).toEqual(notFound);
        expect(await repos.invites.undoCheckIn(elsewhere)).toEqual(notFound);
        expect(
          await repos.invites.setTicket({ ...elsewhere, signed: 's' }),
        ).toEqual(notFound);
        expect(await repos.invites.findById('nope')).toEqual(notFound);
      });

      it('lets the host override an answer, capacity or not', async () => {
        const guest = await openInvite(party.id);

        const confirmed = value(
          await repos.invites.setStatus({
            inviteId: guest.id,
            partyId: party.id,
            status: 'confirmed',
          }),
        );
        const reopened = value(
          await repos.invites.setStatus({
            inviteId: guest.id,
            partyId: party.id,
            status: 'opened',
          }),
        );

        expect(confirmed.answeredAt).not.toBeNull();
        // Back to no answer, so no time it was answered at.
        expect(reopened).toMatchObject({ status: 'opened', answeredAt: null });
      });

      it('adds a guest by hand, already confirmed', async () => {
        const added = value(
          await repos.invites.addManual({
            partyId: party.id,
            name: 'Bruno',
            contact: { email: null, phone: '+393331234567' },
          }),
        );

        expect(added).toMatchObject({
          name: 'Bruno',
          status: 'confirmed',
          source: 'manual',
          depth: 0,
          referrerId: null,
          phone: '+393331234567',
          paidAt: null,
        });
        expect(added.ticketCode).toMatch(/^[A-Z0-9]{5}$/);
      });

      it('keeps the first time a payment was seen, until it is undone', async () => {
        const guest = await openInvite(party.id);
        const at = { inviteId: guest.id, partyId: party.id };

        await repos.invites.setPaid({ ...at, at: '2026-06-01T20:00:00.000Z' });
        const twice = value(
          await repos.invites.setPaid({
            ...at,
            at: '2026-06-01T21:00:00.000Z',
          }),
        );
        const undone = value(await repos.invites.setPaid({ ...at, at: null }));

        expect(twice.paidAt).toBe('2026-06-01T20:00:00.000Z');
        expect(undone.paidAt).toBeNull();
      });

      it('checks a guest in once, and can undo it', async () => {
        const guest = await openInvite(party.id);
        const at = { inviteId: guest.id, partyId: party.id };

        const first = value(
          await repos.invites.checkIn({
            ...at,
            at: '2026-06-01T23:14:00.000Z',
          }),
        );
        const second = await repos.invites.checkIn({
          ...at,
          at: '2026-06-01T23:20:00.000Z',
        });

        expect(first).toMatchObject({
          checkedIn: true,
          checkedInAt: '2026-06-01T23:14:00.000Z',
        });
        expect(second).toEqual({
          ok: false,
          error: INVITE_ERRORS.ALREADY_CHECKED_IN,
        });
        // The losing scan changed nothing: the first time stands.
        expect(value(await repos.invites.findById(guest.id)).checkedInAt).toBe(
          '2026-06-01T23:14:00.000Z',
        );
        expect(value(await repos.invites.undoCheckIn(at))).toMatchObject({
          checkedIn: false,
          checkedInAt: null,
        });
      });

      it('keeps a ticket link once given, across re-sends', async () => {
        const guest = await openInvite(party.id);
        const at = { inviteId: guest.id, partyId: party.id };

        const first = value(
          await repos.invites.setTicket({ ...at, signed: 'a' }),
        );
        const again = value(
          await repos.invites.setTicket({ ...at, signed: 'b' }),
        );

        expect(first.ticketSlug).toBeTruthy();
        expect(again).toMatchObject({
          ticketSlug: first.ticketSlug,
          ticketSigned: 'b',
        });
        expect(
          value(await repos.invites.findByTicketSlug(first.ticketSlug!)).id,
        ).toBe(guest.id);
        expect((await repos.invites.findByTicketSlug('nope')).ok).toBe(false);
      });

      it('lists the funnel oldest first, with who referred each guest', async () => {
        const giulia = await openInvite(party.id);
        await repos.invites.answer({
          inviteId: giulia.id,
          partyId: party.id,
          name: 'Giulia',
          answer: 'confirmed',
          maxCapacity: null,
          contact: { email: null, phone: null },
        });
        const marco = await openInvite(party.id, giulia.forwardToken);

        const listed = value(await repos.invites.listForParty(party.id));

        expect(listed.map((i) => [i.id, i.referrerName])).toEqual([
          [giulia.id, null],
          [marco.id, 'Giulia'],
        ]);
      });
    });

    // ── Members ────────────────────────────────────────────────────────────

    describe('members', () => {
      let owner: User;
      let friend: User;
      let party: PublishedParty;

      beforeEach(async () => {
        owner = await signIn('host@example.com');
        friend = await signIn('friend@example.com');
        party = await publish(owner.id);
      });

      it('adds an editor, and never demotes the owner', async () => {
        const added = value(
          await repos.members.add({
            partyId: party.id,
            userId: friend.id,
            role: 'editor',
          }),
        );
        const ownerAgain = value(
          await repos.members.add({
            partyId: party.id,
            userId: owner.id,
            role: 'editor',
          }),
        );

        expect(added).toMatchObject({
          userId: friend.id,
          email: 'friend@example.com',
          role: 'editor',
        });
        expect(ownerAgain.role).toBe('owner');
        expect(
          value(await repos.members.listMembers(party.id)).map((m) => m.role),
        ).toEqual(['owner', 'editor']);
        expect(await repos.members.roleFor(party.id, 'nobody')).toEqual({
          ok: false,
          error: MEMBER_ERRORS.NOT_A_MEMBER,
        });
      });

      it('removes an editor but never the owner', async () => {
        await repos.members.add({
          partyId: party.id,
          userId: friend.id,
          role: 'editor',
        });

        expect((await repos.members.remove(party.id, friend.id)).ok).toBe(true);
        expect(await repos.members.remove(party.id, friend.id)).toEqual({
          ok: false,
          error: MEMBER_ERRORS.NOT_FOUND,
        });
        expect(await repos.members.remove(party.id, owner.id)).toEqual({
          ok: false,
          error: MEMBER_ERRORS.CANNOT_REMOVE_OWNER,
        });
      });

      it('mints co-organiser links and revokes them', async () => {
        const link = value(
          await repos.members.createInvite({
            partyId: party.id,
            createdBy: owner.id,
          }),
        );

        expect(value(await repos.members.findInvite(link.token))).toMatchObject(
          { partyId: party.id, createdBy: owner.id, revokedAt: null },
        );
        await repos.members.revokeInvitesFor(party.id);
        expect(await repos.members.findInvite(link.token)).toEqual({
          ok: false,
          error: MEMBER_ERRORS.INVITE_REVOKED,
        });
        expect(await repos.members.findInvite('nope')).toEqual({
          ok: false,
          error: MEMBER_ERRORS.INVITE_UNKNOWN,
        });
      });
    });
  });
}
