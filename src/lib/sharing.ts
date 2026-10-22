import type { PartyDocument } from '../../shared/collab';
import {
  closeInviteLink,
  createCollaboratorInvite,
  deleteRemoteParty,
  fetchParty,
  listMembers,
  listParties,
  openInviteLink,
  removeMember,
  revokeCollaboratorInvites,
  storeParty,
} from './api/parties';
import { errorCode } from './api/request';
import { applyDocument, publicationOf } from './collab';
import { db } from './db';
import {
  activeParty,
  can,
  requestUpgrade,
  session,
  state,
  update,
} from './storeState';
import type { Party } from './types';

/**
 * Putting a party on the server, the guest-facing invite link, and the
 * co-organisers who edit it with the host.
 */

/**
 * Puts the active party on the server, which is what makes co-organisers and
 * the invite link possible. Idempotent.
 */
export async function shareActiveParty(): Promise<boolean> {
  const p = activeParty();
  if (!p?.id) return false;
  if (!can('cloudSync')) {
    requestUpgrade('cloudSync');
    return false;
  }

  state.publishing = true;
  state.publishError = null;
  try {
    const result = await storeParty(p);
    if (!result.ok || !result.value) {
      state.publishError = result.ok ? 'share_failed' : errorCode(result.error);
      return false;
    }
    const shared = result.value;
    update((party) => {
      party.publication = publicationOf(shared);
    });
    session.start(p);
    // After the start, which clears what the previous party left there.
    state.members = shared.members;
    state.role = shared.role;
    return true;
  } finally {
    state.publishing = false;
  }
}

/** Opens the guest-facing invite link, storing the party first if need be. */
export async function openPartyInviteLink(): Promise<boolean> {
  const p = activeParty();
  if (!p) return false;
  if (!p.publication && !(await shareActiveParty())) return false;

  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;

  state.publishing = true;
  try {
    const result = await openInviteLink(remoteId);
    if (!result.ok || !result.value) {
      state.publishError = result.ok
        ? 'publish_failed'
        : errorCode(result.error);
      return false;
    }
    const { slug, rootToken } = result.value;
    update((party) => {
      if (!party.publication) return;
      party.publication.slug = slug;
      party.publication.rootToken = rootToken;
    });
    return true;
  } finally {
    state.publishing = false;
  }
}

/** Closes the link. Owner only; the server enforces it too. */
export async function closePartyInviteLink(): Promise<boolean> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;

  const result = await closeInviteLink(remoteId);
  if (!result.ok) {
    state.publishError = errorCode(result.error);
    return false;
  }
  update((party) => {
    if (!party.publication) return;
    party.publication.slug = null;
    party.publication.rootToken = null;
  });
  return true;
}

/** Stops sharing entirely: the party, its guests and its co-organisers. */
export async function unshareActiveParty(): Promise<boolean> {
  const p = activeParty();
  const remoteId = p?.publication?.remoteId;
  if (!p || !remoteId) return false;

  const result = await deleteRemoteParty(remoteId);
  if (!result.ok) {
    state.publishError = errorCode(result.error);
    return false;
  }
  session.stop();
  update((party) => {
    party.publication = null;
  });
  return true;
}

// ── Co-organisers ──────────────────────────────────────────────────────────

export async function refreshMembers(): Promise<void> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return;
  const result = await listMembers(remoteId);
  if (result.ok && result.value) state.members = result.value.members;
}

/** Mints a link that turns whoever opens it into a co-organiser. */
export async function inviteCoOrganiser(): Promise<string | null> {
  const p = activeParty();
  if (!p) return null;
  if (!p.publication && !(await shareActiveParty())) return null;

  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return null;

  const result = await createCollaboratorInvite(remoteId);
  if (!result.ok || !result.value) {
    state.publishError = result.ok ? 'invite_failed' : errorCode(result.error);
    return null;
  }
  return result.value.token;
}

export async function revokeCoOrganiserInvites(): Promise<boolean> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;
  const result = await revokeCollaboratorInvites(remoteId);
  return result.ok;
}

export async function removeCoOrganiser(userId: string): Promise<boolean> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;
  const result = await removeMember(remoteId, userId);
  if (result.ok) await refreshMembers();
  return result.ok;
}

/**
 * Pulls in parties shared with this user that this browser has never seen.
 *
 * A co-organiser's first sight of a party is here: they accepted an invitation
 * on another device (or in another tab), so it exists for them on the server
 * and nowhere locally.
 */
export async function syncPartyList(): Promise<void> {
  if (!can('cloudSync') && !state.session.authenticated) return;

  const listed = await listParties();
  if (!listed.ok || !listed.value) return;

  for (const summary of listed.value.parties) {
    const known = state.parties.find(
      (p) => p.publication?.remoteId === summary.id,
    );
    if (known) continue;

    const fetched = await fetchParty(summary.id);
    if (!fetched.ok || !fetched.value) continue;

    const shared = fetched.value;
    // The local-only half here; `applyDocument` fills in the shared half, the
    // same way every later pull does.
    const local: Omit<Party, keyof PartyDocument> = {
      createdAt: shared.updatedAt,
      // The guest list is not in the document; it arrives through the funnel.
      invites: [],
      publication: publicationOf(shared),
    };
    const party = local as Party;
    applyDocument(party, shared.document);
    const newId = await db.parties.add(party);
    party.id = newId as number;
    state.parties.push(party);
  }
}
