import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPartyDTO } from '../../../../shared/collab';
import type { PhotoSlot } from '../../../../shared/coverPhotos';
import { COVER_PHOTO_MAX_BYTES } from '../../../../shared/coverPhotos';
import type { InviteOpenDTO } from '../../../../shared/invites';
import type { SessionDTO } from '../../../../shared/session';
import { R2_BUDGET } from '../../lib/coverPhotos';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { fakeCoverBucket } from '../support/fakeCoverBucket';
import { aUser, fakeCoverPhotos, fakeUsers } from '../support/fakeRepositories';
import { request, sessionCookie } from '../support/harness';
import {
  publishAndOpenInvites,
  publishParty,
  repositoriesWith,
} from '../support/party';

/** The smallest header each kind is recognised by, padded to look like a file. */
function webp(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(
    [...'RIFF'].map((ch) => ch.charCodeAt(0)),
    0,
  );
  bytes.set(
    [...'WEBP'].map((ch) => ch.charCodeAt(0)),
    8,
  );
  return bytes;
}
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

let repositories: Repositories;
let bucket: ReturnType<typeof fakeCoverBucket>;
let party: SharedPartyDTO;

/** The bucket as the Worker sees its binding. */
const withBucket = () => ({ COVER_PHOTOS: bucket as unknown as R2Bucket });

beforeEach(async () => {
  resetFakeIds();
  bucket = fakeCoverBucket();
  repositories = repositoriesWith(
    fakeUsers([
      aUser({ id: 'user-1', tier: 'pro' }),
      aUser({ id: 'user-2', email: 'friend@example.com', tier: 'free' }),
    ]),
  );
  party = await publishParty(repositories);
});

const photoPath = (slot: string) => `/api/parties/${party.id}/photos/${slot}`;

async function upload(
  body: Uint8Array,
  {
    slot = 'poster',
    as = 'user-1',
    bound = true,
  }: { slot?: string; as?: string; bound?: boolean } = {},
): Promise<Response> {
  return request(photoPath(slot), {
    repositories,
    env: bound ? withBucket() : {},
    cookie: await sessionCookie(as),
    method: 'PUT',
    body,
  });
}

async function uploadedToken(
  body: Uint8Array,
  slot: PhotoSlot = 'poster',
): Promise<string> {
  const res = await upload(body, { slot });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function remove(slot: PhotoSlot): Promise<Response> {
  return request(photoPath(slot), {
    repositories,
    env: withBucket(),
    cookie: await sessionCookie('user-1'),
    method: 'DELETE',
  });
}

async function serve(slot: string, token: string): Promise<Response> {
  return request(`${photoPath(slot)}/${token}`, {
    repositories,
    env: withBucket(),
    cookie: await sessionCookie('user-1'),
  });
}

async function storedPhotos(): Promise<Record<PhotoSlot, string> | undefined> {
  const found = await repositories.parties.findById(party.id);
  return found.ok ? found.value.document?.photos : undefined;
}

describe('uploading', () => {
  it('stores the photo and points the document at it', async () => {
    const token = await uploadedToken(webp());

    expect(await storedPhotos()).toEqual({ banner: '', poster: token });
    expect(bucket.keys()).toEqual([`covers/${party.id}/${token}`]);
  });

  it('takes a JPEG too, which is what Safari encodes', async () => {
    expect((await upload(jpeg())).status).toBe(200);
  });

  // Two photos per party at most, by construction: one per slot.
  it('keeps a banner and a poster side by side', async () => {
    const banner = await uploadedToken(webp(), 'banner');
    const poster = await uploadedToken(jpeg(), 'poster');

    expect(await storedPhotos()).toEqual({ banner, poster });
    expect(bucket.keys()).toHaveLength(2);
  });

  it('replaces only the photo in the same slot', async () => {
    await uploadedToken(webp(), 'banner');
    const poster = await uploadedToken(webp(), 'poster');
    const banner = await uploadedToken(webp(), 'banner');

    expect(bucket.keys().sort()).toEqual(
      [`covers/${party.id}/${banner}`, `covers/${party.id}/${poster}`].sort(),
    );
    expect(await storedPhotos()).toEqual({ banner, poster });
  });

  it('is a 404 for a slot that does not exist', async () => {
    expect((await upload(webp(), { slot: 'logo' })).status).toBe(404);
    expect(bucket.keys()).toEqual([]);
  });

  it('refuses anything that is not a WebP or JPEG, whatever it claims', async () => {
    expect((await upload(png())).status).toBe(415);
    expect(bucket.keys()).toEqual([]);
  });

  it('refuses a photo over the size limit', async () => {
    expect((await upload(webp(COVER_PHOTO_MAX_BYTES + 1))).status).toBe(413);
    expect(bucket.keys()).toEqual([]);
  });

  it('refuses an empty body', async () => {
    expect((await upload(new Uint8Array())).status).toBe(413);
  });

  it('answers 501 on a Worker with no bucket bound', async () => {
    expect((await upload(webp(), { bound: false })).status).toBe(501);
  });

  it('follows the owner tier, like every Pro party feature', async () => {
    await repositories.users.setTier('user-1', 'free');
    const res = await upload(webp());

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ feature: 'coverPhotos' });
  });

  it('is a 404 for someone who is not on the party', async () => {
    expect((await upload(webp(), { as: 'user-2' })).status).toBe(404);
  });
});

describe('serving an organiser', () => {
  it('serves the photo as the image it is', async () => {
    const token = await uploadedToken(jpeg());
    const res = await serve('poster', token);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg());
  });

  it('is a 404 for a token that is not the photo in that slot', async () => {
    const banner = await uploadedToken(webp(), 'banner');
    for (const [slot, token] of [
      ['poster', banner],
      ['logo', banner],
      ['poster', 'aaaaaaaaaaaaaaaaaaaa'],
      ['poster', '..%2F..%2Fsecret'],
    ] as const) {
      expect((await serve(slot, token)).status).toBe(404);
    }
  });
});

describe('guests', () => {
  async function invitedParty(): Promise<string> {
    repositories = repositoriesWith();
    const opened = await publishAndOpenInvites(repositories);
    party = opened.party;
    return opened.slug;
  }

  it('see the banner and poster on their invite card while the link is open', async () => {
    const slug = await invitedParty();
    const banner = await uploadedToken(webp(), 'banner');
    const poster = await uploadedToken(webp(), 'poster');

    const open = await request(`/invite/${slug}/open`, {
      repositories,
      env: withBucket(),
      method: 'POST',
      body: {},
    });
    expect(((await open.json()) as InviteOpenDTO).party.photos).toEqual({
      banner,
      poster,
    });

    for (const [slot, token] of [
      ['banner', banner],
      ['poster', poster],
    ] as const) {
      const photo = await request(`/invite/${slug}/photos/${slot}/${token}`, {
        repositories,
        env: withBucket(),
      });
      expect(photo.status).toBe(200);
    }
  });

  it('lose them when the host closes the link', async () => {
    const slug = await invitedParty();
    const token = await uploadedToken(webp());
    await request(`/api/parties/${party.id}/invite-link`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });

    const photo = await request(`/invite/${slug}/photos/poster/${token}`, {
      repositories,
      env: withBucket(),
    });
    expect(photo.status).toBe(404);
  });
});

describe('deleting', () => {
  it('removes the slot photo and clears it in the document', async () => {
    const banner = await uploadedToken(webp(), 'banner');
    await uploadedToken(webp(), 'poster');

    expect((await remove('poster')).status).toBe(200);
    expect(bucket.keys()).toEqual([`covers/${party.id}/${banner}`]);
    expect(await storedPhotos()).toEqual({ banner, poster: '' });
  });

  it('takes both photos with the party', async () => {
    await uploadedToken(webp(), 'banner');
    await uploadedToken(webp(), 'poster');
    const res = await request(`/api/parties/${party.id}`, {
      repositories,
      env: withBucket(),
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(bucket.keys()).toEqual([]);
  });
});

describe('the session', () => {
  it('says whether this deployment can store photos', async () => {
    const read = async (env: object): Promise<boolean> => {
      const res = await request('/api/session', { repositories, env });
      return ((await res.json()) as SessionDTO).coverPhotos;
    };

    expect(await read(withBucket())).toBe(true);
    expect(await read({})).toBe(false);
  });
});

describe('the free-tier budget', () => {
  const ledger = () =>
    repositories.coverPhotos as ReturnType<typeof fakeCoverPhotos>;
  const DAY = '2026-10-26';

  /** Fills the bucket, as another party's photo, to `short` bytes under the cap. */
  function fillTo(short: number): void {
    ledger().rows.set('elsewhere:poster', {
      partyId: 'elsewhere',
      slot: 'poster',
      token: 'x',
      bytes: R2_BUDGET.storageBytes - short,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a ledger of what is stored, and empties it with the photo', async () => {
    const token = await uploadedToken(webp(1000));
    expect(ledger().rows.get(`${party.id}:poster`)).toEqual({
      partyId: party.id,
      slot: 'poster',
      token,
      bytes: 1000,
    });

    // Replacing counts the new photo only; the other slot counts on its own.
    await uploadedToken(webp(400));
    await uploadedToken(webp(100), 'banner');
    expect(await ledger().totalBytes()).toEqual({ ok: true, value: 500 });

    await remove('poster');
    await remove('banner');
    expect(ledger().rows.size).toBe(0);
  });

  it('refuses an upload that would pass the storage cap', async () => {
    fillTo(100);

    const res = await upload(webp(200));
    expect(res.status).toBe(507);
    expect(await res.json()).toEqual({ error: 'cover_photo_storage_full' });
    expect(bucket.keys()).toEqual([]);
  });

  it('counts a replacement as the difference it makes, not on top', async () => {
    await uploadedToken(webp(1000));
    fillTo(1000);

    // Same size again: the total does not grow, so it fits.
    expect((await upload(webp(1000))).status).toBe(200);
    expect((await upload(webp(1001))).status).toBe(507);
    // A second slot adds to the total: it replaces nothing.
    expect((await upload(webp(12), { slot: 'banner' })).status).toBe(507);
  });

  it("stops uploads once the day's are spent, until the next day", async () => {
    ledger().usage.set(`${DAY}:write`, R2_BUDGET.writesPerDay - 1);
    expect((await upload(webp())).status).toBe(200);

    const refused = await upload(webp(), { slot: 'banner' });
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: 'cover_photo_budget' });

    vi.setSystemTime(new Date('2026-10-27T00:00:01Z'));
    expect((await upload(webp())).status).toBe(200);
  });

  it("stops serving once the day's reads are spent", async () => {
    const token = await uploadedToken(webp());
    ledger().usage.set(`${DAY}:read`, R2_BUDGET.readsPerDay);

    const res = await serve('poster', token);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('3600');
  });

  it('spends a read only on a photo it actually serves', async () => {
    await uploadedToken(webp());
    await serve('poster', 'aaaaaaaaaaaaaaaaaaaa');
    expect(ledger().usage.get(`${DAY}:read`)).toBeUndefined();
  });

  // The limits themselves: 31 days of them, the most one bill can hold,
  // against R2's monthly free allowance.
  it('stays inside the free tier whichever 31 days are billed', () => {
    expect(R2_BUDGET.storageBytes).toBeLessThanOrEqual(10e9 / 2);
    expect(R2_BUDGET.writesPerDay * 31).toBeLessThan(1_000_000 / 10);
    expect(R2_BUDGET.readsPerDay * 31).toBeLessThan(10_000_000 / 10);
  });
});
