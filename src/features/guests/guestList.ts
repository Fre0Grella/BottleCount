import { toRaw } from 'vue';
import type { GuestContact } from '../../../shared/contact';
import {
  addRemoteGuest,
  checkInRemote,
  earlierCheckIn,
  setRemoteContact,
  setRemoteInviteStatus,
  setRemotePaid,
  undoCheckInRemote,
} from '../../lib/api/guests';
import { errorCode } from '../../lib/api/request';
import { adoptRemoteGuest } from './invites';
import { activeParty, save, session, update } from '../../store/storeState';
import { newLocalTicketCode } from '../../lib/ticket';
import type { Invite, Party } from '../../lib/types';

/**
 * The host's guest list: adding guests, their answer, where to send their
 * ticket, whether they paid, and the door.
 *
 * Every change is applied locally first, so the screen responds at once, and
 * then sent to the server for a shared party. The rules for what a change does
 * to a guest are the plain functions at the top; the store's actions below
 * add the network.
 */

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * A guest the host types in. Confirmed on the spot — the host would not be
 * typing them in otherwise — and deliberately carries no `remoteId`, which is
 * what keeps a funnel refresh from deleting them.
 */
export function manualInvite(
  party: Party,
  name: string,
  contact: GuestContact,
): Invite {
  return {
    id: party.invites.reduce((max, i) => Math.max(max, i.id), 0) + 1,
    name,
    // Stored now, so the ticket keeps its code if the guest is renamed. On a
    // shared party the server's replaces it once their row exists.
    ticketCode: newLocalTicketCode(party),
    status: 'confirmed',
    depth: 0,
    referrer: null,
    source: 'manual',
    used: false,
    ...(contact.email ? { email: contact.email } : {}),
    ...(contact.phone ? { phone: contact.phone } : {}),
  };
}

export function setStatus(invite: Invite, status: Invite['status']): void {
  invite.status = status;
  // Someone who is no longer coming cannot have walked through the door.
  if (status !== 'confirmed') setCheckedIn(invite, null);
}

export function setContact(
  invite: Invite,
  email: string | null,
  phone: string | null,
): void {
  if (email) invite.email = email;
  else delete invite.email;
  if (phone) invite.phone = phone;
  else delete invite.phone;
}

export function setPaidAt(invite: Invite, at: string | null): void {
  if (at) invite.paidAt = at;
  else delete invite.paidAt;
}

/** Records when a guest walked in, or that they have not. */
export function setCheckedIn(invite: Invite, at: string | null): void {
  invite.used = at !== null;
  invite.usedAt = at ?? undefined;
}

// ── Actions ────────────────────────────────────────────────────────────────

/** Edits one guest of the open party, if they are there. */
function editInvite(id: number, change: (invite: Invite) => void): void {
  update((p) => {
    const target = p.invites.find((i) => i.id === id);
    if (target) change(target);
  });
}

/** The open party, with one of its guests, for an action on that guest. */
function withInvite(id: number): { party: Party; invite: Invite } | null {
  const party = activeParty();
  const invite = party?.invites.find((i) => i.id === id);
  return party && invite ? { party, invite } : null;
}

export function addInvite(
  name: string,
  contact: GuestContact = { email: null, phone: null },
): void {
  const party = activeParty();
  if (!party) return;
  const invite = manualInvite(party, name, contact);
  update((p) => {
    p.invites.unshift(invite);
  });

  // On a shared party the guest has to exist on the server too, or the
  // co-organiser never sees them and the other phone on the door cannot check
  // their ticket. The row appears locally first so the list responds at once,
  // then takes the server's id — without it the next sync would add the
  // server's copy beside it rather than recognising it (see adoptRemoteGuest).
  const remoteId = party.publication?.remoteId;
  if (!remoteId) return;
  void addRemoteGuest(remoteId, name, contact).then((result) => {
    if (!result.ok || !result.value) return;
    const row = result.value;
    save(party, (p) => {
      p.invites = adoptRemoteGuest(toRaw(p).invites, invite.id, row);
    });
    if (activeParty() === party) void session.syncFunnel();
  });
}

/**
 * The host changing someone's state.
 *
 * Pushed to the server for guests who came through the link. Without that push
 * the next poll would overwrite the host's change with the guest's older answer
 * — the button would appear to work and then quietly undo itself.
 *
 * A failed push is not rolled back: the local list is what the host runs the
 * door from, and reverting a change they deliberately made because the network
 * hiccuped is the worse of the two wrong answers. The next successful sync
 * reconciles it.
 */
export function setInviteStatus(id: number, status: Invite['status']): void {
  const found = withInvite(id);
  if (!found) return;
  editInvite(id, (i) => setStatus(i, status));

  const partyRemoteId = found.party.publication?.remoteId;
  const { remoteId } = found.invite;
  if (remoteId && partyRemoteId) {
    void setRemoteInviteStatus(partyRemoteId, remoteId, status);
  }
}

/**
 * Sets where to send a guest's ticket.
 *
 * On a shared party the server is written first and the guest list follows its
 * answer, unlike a status change: a contact detail the server refused, or never
 * got, would otherwise sit on this screen until the next refresh quietly put
 * the old one back. Returns the server's error, or null.
 *
 * A hand-typed guest still waiting for their server row cannot be edited yet —
 * there is no row to write to, and a local-only edit would be overwritten by
 * the merge that follows.
 */
export async function setInviteContact(
  id: number,
  contact: GuestContact,
): Promise<string | null> {
  const found = withInvite(id);
  if (!found) return 'invite_not_found';

  const partyRemoteId = found.party.publication?.remoteId;
  if (!partyRemoteId) {
    editInvite(id, (i) => setContact(i, contact.email, contact.phone));
    return null;
  }
  if (!found.invite.remoteId) return 'not_saved_yet';

  const result = await setRemoteContact(
    partyRemoteId,
    found.invite.remoteId,
    contact,
  );
  if (!result.ok) return errorCode(result.error);
  if (!result.value) return 'save_failed';
  const { email, phone } = result.value;
  editInvite(id, (i) => setContact(i, email, phone));
  return null;
}

/**
 * Marks a guest as paid, or takes it back.
 *
 * On a shared party the server's answer then replaces the guess, which keeps
 * the time the money was *first* marked when another organiser got there
 * earlier.
 */
export async function setInvitePaid(id: number, paid: boolean): Promise<void> {
  const found = withInvite(id);
  if (!found) return;
  editInvite(id, (i) => setPaidAt(i, paid ? new Date().toISOString() : null));

  const partyRemoteId = found.party.publication?.remoteId;
  const { remoteId } = found.invite;
  if (!partyRemoteId || !remoteId) return;

  const result = await setRemotePaid(partyRemoteId, remoteId, paid);
  // A failed request leaves the local mark standing; the next funnel refresh
  // reconciles it with what the server holds.
  if (result.ok && result.value) {
    const { paidAt } = result.value;
    editInvite(id, (i) => setPaidAt(i, paidAt));
  }
}

/**
 * Records that a guest walked in.
 *
 * On a shared party the server arbitrates, which is what makes "already
 * scanned" true across every phone on the door. It is applied locally first so
 * the scanner responds instantly — a door queue does not wait for a round trip
 * — and reconciled by the answer.
 *
 * Returns the time of an *earlier* check-in when the server refuses, so the
 * scanner can say when they came in rather than only that they did.
 */
export async function checkInGuest(
  id: number,
  time: string,
): Promise<{ ok: boolean; alreadyAt?: string | null }> {
  const found = withInvite(id);
  if (!found) return { ok: false };
  editInvite(id, (i) => setCheckedIn(i, time));

  const remoteId = found.party.publication?.remoteId;
  const inviteRemoteId = found.invite.remoteId;
  if (!remoteId || !inviteRemoteId) return { ok: true };

  const result = await checkInRemote(remoteId, inviteRemoteId);
  if (result.ok) return { ok: true };

  const earlier = earlierCheckIn(result.error);
  if (earlier) {
    // Somebody else's phone got there first. Adopt their time — ours was a
    // guess made a moment ago and theirs is what actually happened.
    const alreadyAt = earlier.at;
    if (alreadyAt) {
      editInvite(id, (i) => {
        i.usedAt = alreadyAt;
      });
    }
    return { ok: false, alreadyAt };
  }

  // A network failure leaves the local check-in standing: the guest is through
  // the door either way, and the next sync reconciles it. Refusing them over a
  // dropped request would be the worse mistake.
  return { ok: true };
}

/** Undoes a check-in on every device, for someone waved through by mistake. */
export async function undoCheckIn(id: number): Promise<void> {
  const found = withInvite(id);
  if (!found) return;
  editInvite(id, (i) => setCheckedIn(i, null));

  const remoteId = found.party.publication?.remoteId;
  if (remoteId && found.invite.remoteId) {
    await undoCheckInRemote(remoteId, found.invite.remoteId);
  }
}
