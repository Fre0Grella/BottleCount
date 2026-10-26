import { deleteCoverPhoto, uploadCoverPhoto } from '../../lib/api/parties';
import { errorCode } from '../../lib/api/request';
import type { Party } from '../../lib/types';
import {
  activeParty,
  can,
  requestUpgrade,
  state,
  update,
} from '../../store/storeState';
import { shareActiveParty } from '../sharing/sharing';
import { organiserPhotoUrl, shrinkCoverPhoto } from './coverPhoto';

/**
 * The Plan tab's photo or poster: putting one on the active party and taking
 * it off. The photo lives on the server, so a local-only party is stored first,
 * the way opening the invite link does it.
 */

/** What went wrong, in the words the Plan tab shows. */
const MESSAGES: Record<string, string> = {
  not_an_image: "That file isn't an image this browser can read.",
  too_big: 'That image is too detailed to shrink enough. Try a simpler one.',
  not_a_photo: 'Only photos and posters can be uploaded.',
  cover_photo_too_large: 'That image is still too large after shrinking.',
  cover_photos_unavailable: "This server doesn't store photos.",
  // The budget that keeps photo storage free (ADR 0007).
  cover_photo_budget: 'Photo uploads are paused for today. Try again tomorrow.',
  cover_photo_storage_full:
    'Photo storage is full for now. Your party keeps its emoji cover.',
  network_error: "Couldn't reach the server. Try again in a moment.",
};

function message(code: string): string {
  return MESSAGES[code] ?? 'The photo could not be saved. Try again.';
}

/** Whether this deployment stores photos at all; Pro is checked on use. */
export function photosOffered(): boolean {
  return state.session.coverPhotos === true;
}

/** Where an organiser's browser fetches the party's photo, or null for none. */
export function photoSrc(party: Party | null | undefined): string | null {
  const remoteId = party?.publication?.remoteId;
  return party?.coverPhoto && remoteId
    ? organiserPhotoUrl(remoteId, party.coverPhoto)
    : null;
}

/**
 * Shrinks `file`, uploads it and points the party at it. Answers an error to
 * show, or null once it is on.
 */
export async function setPartyPhoto(file: Blob): Promise<string | null> {
  if (!can('coverPhotos')) {
    requestUpgrade('coverPhotos');
    return null;
  }
  const photo = await shrinkCoverPhoto(file);
  if (!photo) {
    return message(file.type.startsWith('image/') ? 'too_big' : 'not_an_image');
  }

  if (!activeParty()?.publication && !(await shareActiveParty())) {
    return message(state.publishError ?? '');
  }
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return message('');

  const result = await uploadCoverPhoto(remoteId, photo);
  if (!result.ok) return message(errorCode(result.error));
  // The server has already pointed its copy at the photo; this is ours.
  const { token } = result.value;
  update((p) => {
    p.coverPhoto = token;
  });
  return null;
}

/** Takes the photo off, back to the emoji cover. */
export async function removePartyPhoto(): Promise<string | null> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (remoteId) {
    const result = await deleteCoverPhoto(remoteId);
    if (!result.ok) return message(errorCode(result.error));
  }
  update((p) => {
    p.coverPhoto = '';
  });
  return null;
}
