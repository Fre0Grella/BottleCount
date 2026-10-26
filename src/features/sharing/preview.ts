import type { PhotoSlot } from '../../../shared/coverPhotos';
import type { InvitePartyDTO } from '../../../shared/invites';
import { invitePartyOf } from '../../../shared/invites';
import { documentOf } from '../../lib/collab';
import type { Party } from '../../lib/types';
import { organiserPhotoUrl } from '../party/coverPhoto';

/**
 * What the Preview tab shows a host: their invite and a ticket, as a guest
 * would get them.
 *
 * The invite is built with the same `invitePartyOf` the Worker uses for the
 * guest's page, from the same document, so the preview cannot drift from the
 * real thing. It never says the party is full: that depends on answers the
 * server holds, and the preview is about how it looks.
 */
export function previewInvite(party: Party): InvitePartyDTO {
  const document = documentOf(party);
  return invitePartyOf(document, document, {
    slug: party.publication?.slug ?? '',
    full: false,
    googleSignIn: false,
  });
}

/**
 * Where the preview fetches a photo: the organiser's own route, since the
 * guests' one needs an open invite link. Null for a party not stored yet,
 * which has no photos anyway.
 */
export function previewPhotoUrl(
  party: Party,
): (slot: PhotoSlot, token: string) => string | null {
  const remoteId = party.publication?.remoteId;
  return (slot, token) =>
    remoteId ? organiserPhotoUrl(remoteId, slot, token) : null;
}

/** The guest the sample ticket is made out to: the first on the list, or a stand-in. */
export function sampleGuestName(party: Party): string {
  const named = party.invites.find((invite) => invite.name.trim());
  return named?.name.trim() || 'Your guest';
}
