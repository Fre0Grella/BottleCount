import { beforeEach, describe, expect, it } from 'vitest';
import type { SharedPartyDTO } from '../../../../shared/collab';
import { COVER_PHOTO_MAX_BYTES } from '../../../../shared/coverPhotos';
import type { InviteOpenDTO } from '../../../../shared/invites';
import type { SessionDTO } from '../../../../shared/session';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { fakeCoverBucket } from '../support/fakeCoverBucket';
import { aUser, fakeUsers } from '../support/fakeRepositories';
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

async function upload(
  body: Uint8Array,
  { as = 'user-1', bound = true } = {},
): Promise<Response> {
  return request(`/api/parties/${party.id}/cover`, {
    repositories,
    env: bound ? withBucket() : {},
    cookie: await sessionCookie(as),
    method: 'PUT',
    body,
  });
}

async function uploadedToken(body: Uint8Array): Promise<string> {
  const res = await upload(body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function storedPhoto(): Promise<string | undefined> {
  const found = await repositories.parties.findById(party.id);
  return found.ok ? found.value.document?.coverPhoto : undefined;
}

describe('uploading', () => {
  it('stores the photo and points the document at it', async () => {
    const token = await uploadedToken(webp());

    expect(await storedPhoto()).toBe(token);
    expect(bucket.keys()).toEqual([`covers/${party.id}/${token}`]);
  });

  it('takes a JPEG too, which is what Safari encodes', async () => {
    expect((await upload(jpeg())).status).toBe(200);
  });

  // One photo per party, by construction: that is the count limit.
  it('replaces the previous photo rather than keeping both', async () => {
    await uploadedToken(webp());
    const second = await uploadedToken(webp());

    expect(bucket.keys()).toEqual([`covers/${party.id}/${second}`]);
    expect(await storedPhoto()).toBe(second);
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
    const res = await request(`/api/parties/${party.id}/cover/${token}`, {
      repositories,
      env: withBucket(),
      cookie: await sessionCookie('user-1'),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg());
  });

  it('is a 404 for a token that is not a photo of this party', async () => {
    for (const token of ['aaaaaaaaaaaaaaaaaaaa', '..%2F..%2Fsecret']) {
      const res = await request(`/api/parties/${party.id}/cover/${token}`, {
        repositories,
        env: withBucket(),
        cookie: await sessionCookie('user-1'),
      });
      expect(res.status).toBe(404);
    }
  });
});

describe('guests', () => {
  async function invitedParty(): Promise<{ slug: string; token: string }> {
    repositories = repositoriesWith();
    const opened = await publishAndOpenInvites(repositories);
    party = opened.party;
    return { slug: opened.slug, token: await uploadedToken(webp()) };
  }

  it('see the photo on their invite card while the link is open', async () => {
    const { slug, token } = await invitedParty();

    const open = await request(`/invite/${slug}/open`, {
      repositories,
      env: withBucket(),
      method: 'POST',
      body: {},
    });
    expect(((await open.json()) as InviteOpenDTO).party.coverPhoto).toBe(token);

    const photo = await request(`/invite/${slug}/cover/${token}`, {
      repositories,
      env: withBucket(),
    });
    expect(photo.status).toBe(200);
  });

  it('lose it when the host closes the link', async () => {
    const { slug, token } = await invitedParty();
    await request(`/api/parties/${party.id}/invite-link`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });

    const photo = await request(`/invite/${slug}/cover/${token}`, {
      repositories,
      env: withBucket(),
    });
    expect(photo.status).toBe(404);
  });
});

describe('deleting', () => {
  it('removes the photo and clears the document', async () => {
    await uploadedToken(webp());
    const res = await request(`/api/parties/${party.id}/cover`, {
      repositories,
      env: withBucket(),
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(bucket.keys()).toEqual([]);
    expect(await storedPhoto()).toBe('');
  });

  it('takes the photo with the party', async () => {
    await uploadedToken(webp());
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
