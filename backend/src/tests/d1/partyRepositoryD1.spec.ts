import { describe, expect, it } from 'vitest';
import { PartyRepositoryD1 } from '../../repositories/d1/partyRepositoryD1';
import { aDocument } from '../support/party';
import { stubD1 } from '../support/d1Stub';

/** A `parties` row as D1 hands it back, its document column as given. */
function partyRow(document: string | null) {
  return {
    id: 'party-1',
    owner_id: 'user-1',
    local_id: 7,
    slug: 'rooftop-abc',
    name: 'Rooftop',
    date: '2026-10-02',
    cover: 1,
    venue_place: 'The Roof',
    venue_city: 'Milan',
    venue_time: '21:00',
    allow_forward: 1,
    max_capacity: null,
    root_token: 'root',
    published_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    document,
    version: 3,
    invites_open: 1,
    ticket_key: null,
  };
}

function repositoryHolding(document: string | null): PartyRepositoryD1 {
  return new PartyRepositoryD1(stubD1(() => partyRow(document)));
}

describe('PartyRepositoryD1 reading a stored document', () => {
  // Rows a co-organiser's merge patch broke before documents were normalised
  // on read: json_patch deletes a key whose value is null.
  it('opens a party whose settings and venue were patched away', async () => {
    const broken = JSON.stringify({
      ...aDocument(),
      settings: null,
      venue: null,
    });

    const found = await repositoryHolding(broken).findById('party-1');

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.maxCapacity).toBeNull();
    // The card columns: what the party was last published with.
    expect(found.value.venue).toEqual({
      place: 'The Roof',
      city: 'Milan',
      time: '21:00',
    });
    expect(found.value.document?.settings.ticket_price).toBe(0);
  });

  it('falls back to the published name when the document lost its own', async () => {
    const nameless = JSON.stringify({ ...aDocument(), name: null });

    const found = await repositoryHolding(nameless).findBySlug('rooftop-abc');

    expect(found.ok && found.value.name).toBe('Rooftop');
    expect(found.ok && found.value.document?.name).toBe('Rooftop');
  });

  it('reads a row with no document, or one that is not an object, as none', async () => {
    for (const raw of [null, 'not json', '[1,2]', '"text"']) {
      const found = await repositoryHolding(raw).findById('party-1');
      expect(found.ok && found.value.document).toBeNull();
      expect(found.ok && found.value.venue.city).toBe('Milan');
    }
  });

  it('normalises what a patch hands back', async () => {
    const broken = JSON.stringify({ ...aDocument(), settings: null });

    const patched = await repositoryHolding(broken).patchDocument({
      partyId: 'party-1',
      patch: { settings: null },
    });

    expect(patched.ok && patched.value.document.settings.buffer).toBe(1);
  });
});
