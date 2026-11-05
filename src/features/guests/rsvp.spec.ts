import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InviteOpenDTO } from '../../../shared/invites';
import type { ApiResult } from '../../lib/api/request';
import {
  answerBody,
  answerOutcome,
  forwardMessage,
  forwardQrFileName,
  joinName,
  needsContact,
  readGoogleReturn,
  rememberContact,
  rememberInviteId,
  rememberedContact,
  rememberedInviteId,
  splitName,
} from './rsvp';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const base64url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

describe('what this browser remembers', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the invite id per party, under the key it always used', () => {
    expect(rememberedInviteId('abc')).toBeNull();
    rememberInviteId('abc', 'inv-1');
    expect(rememberedInviteId('abc')).toBe('inv-1');
    expect(rememberedInviteId('other')).toBeNull();
    expect(storage.getItem('bc-invite:abc')).toBe('inv-1');
  });

  it('keeps the contact details last confirmed with', () => {
    expect(rememberedContact('abc')).toEqual({ email: '', phone: '' });
    rememberContact('abc', { email: 'g@example.com', phone: '333' });
    expect(rememberedContact('abc')).toEqual({
      email: 'g@example.com',
      phone: '333',
    });
    expect(JSON.parse(storage.getItem('bc-invite-contact:abc')!)).toEqual({
      email: 'g@example.com',
      phone: '333',
    });
  });

  it('reads a damaged contact entry as blank fields', () => {
    storage.setItem('bc-invite-contact:abc', '{"email":42}');
    expect(rememberedContact('abc')).toEqual({ email: '', phone: '' });
    storage.setItem('bc-invite-contact:abc', 'not json');
    expect(rememberedContact('abc')).toEqual({ email: '', phone: '' });
  });

  it('forgets nothing and throws nothing where storage is blocked', () => {
    vi.stubGlobal('localStorage', undefined);
    rememberInviteId('abc', 'inv-1');
    expect(rememberedInviteId('abc')).toBeNull();
    expect(rememberedContact('abc')).toEqual({ email: '', phone: '' });
  });
});

describe('readGoogleReturn', () => {
  it('is null when the guest did not come back from Google', () => {
    expect(readGoogleReturn('')).toBeNull();
    expect(readGoogleReturn('#other=1')).toBeNull();
  });

  it('reads the profile, including non-ASCII names', () => {
    const hash = `#google=${base64url({ name: 'Łukasz Żak', email: 'l@gmail.com' })}`;
    expect(readGoogleReturn(hash)).toEqual({
      profile: { name: { first: 'Łukasz', last: 'Żak' }, email: 'l@gmail.com' },
    });
  });

  it('takes Google’s own first name and surname, which may be missing', () => {
    const split = `#google=${base64url({ name: 'Anna Maria Rossi', first: 'Anna Maria', last: 'Rossi' })}`;
    const noSurname = `#google=${base64url({ name: 'Giulia', first: 'Giulia', last: '' })}`;

    expect(readGoogleReturn(split)).toEqual({
      profile: { name: { first: 'Anna Maria', last: 'Rossi' } },
    });
    expect(readGoogleReturn(noSurname)).toEqual({
      profile: { name: { first: 'Giulia', last: '' } },
    });
  });

  it('keeps only string fields', () => {
    expect(
      readGoogleReturn(`#google=${base64url({ name: 7, email: 'a@b.co' })}`),
    ).toEqual({ profile: { email: 'a@b.co' } });
  });

  it('gives a null profile for a mangled fragment', () => {
    expect(readGoogleReturn('#google=%%%')).toEqual({ profile: null });
    expect(readGoogleReturn(`#google=${base64url('just text')}`)).toEqual({
      profile: null,
    });
  });

  it('says why when Google did not finish, which wins over a profile', () => {
    expect(readGoogleReturn('#google_error=email')).toEqual({
      error: 'Google didn’t share a verified email. Type yours below.',
    });
    expect(
      readGoogleReturn(`#google_error=invite&google=${base64url({})}`),
    ).toEqual({
      error: 'Google sign-in didn’t finish. Try again, or type your email.',
    });
  });
});

describe('answerBody', () => {
  const form = {
    first: ' Giulia ',
    last: ' Rossi',
    email: '',
    phone: '',
    paidParty: false,
  };

  it('wants a name and a surname first', () => {
    expect(answerBody('confirmed', { ...form, first: '  ' })).toEqual({
      error: 'Pop your name in first.',
    });
    expect(answerBody('declined', { ...form, last: '' })).toEqual({
      error: 'Add your surname too.',
    });
  });

  it('sends only the name for a decline or a free party', () => {
    expect(answerBody('confirmed', form)).toEqual({
      name: 'Giulia Rossi',
      answer: 'confirmed',
    });
    expect(
      answerBody('declined', { ...form, paidParty: true, email: 'x' }),
    ).toEqual({ name: 'Giulia Rossi', answer: 'declined' });
  });

  it('asks a yes to a paid party where to send the ticket', () => {
    const paid = { ...form, paidParty: true };
    expect(answerBody('confirmed', paid)).toEqual({
      error: 'Add an email or a phone number — it’s where your ticket goes.',
    });
    expect(answerBody('confirmed', { ...paid, email: 'nope' })).toEqual({
      error: 'That email doesn’t look right.',
    });
    expect(answerBody('confirmed', { ...paid, phone: '12' })).toEqual({
      error: 'That phone number doesn’t look right.',
    });
    expect(
      answerBody('confirmed', { ...paid, email: 'G@Example.com' }),
    ).toEqual({
      name: 'Giulia Rossi',
      answer: 'confirmed',
      email: 'g@example.com',
      phone: '',
    });
    expect(answerBody('confirmed', { ...paid, phone: '333 123 4567' })).toEqual(
      {
        name: 'Giulia Rossi',
        answer: 'confirmed',
        email: '',
        phone: '+393331234567',
      },
    );
  });

  it('needsContact: only a yes to a paid party', () => {
    expect(needsContact('confirmed', true)).toBe(true);
    expect(needsContact('confirmed', false)).toBe(false);
    expect(needsContact('declined', true)).toBe(false);
  });
});

describe('answerOutcome', () => {
  const invite = { inviteId: 'inv-1' } as InviteOpenDTO;
  const http = (code: string | null): ApiResult<InviteOpenDTO> => ({
    ok: false,
    error: { kind: 'http', status: 400, code, body: null },
  });

  it('takes the new invite on success', () => {
    expect(answerOutcome({ ok: true, value: invite })).toEqual({
      kind: 'answered',
      invite,
    });
  });

  it('marks the party paid when the server wants a contact', () => {
    expect(answerOutcome(http('contact_required'))).toEqual({
      kind: 'retry',
      error: 'Add an email or a phone number — it’s where your ticket goes.',
      party: { paid: true },
    });
  });

  it('names the field the server refused', () => {
    expect(answerOutcome(http('invalid_email'))).toEqual({
      kind: 'retry',
      error: 'That email doesn’t look right.',
    });
    expect(answerOutcome(http('invalid_phone'))).toEqual({
      kind: 'retry',
      error: 'That phone number doesn’t look right.',
    });
  });

  it('marks the party full when the last place went', () => {
    expect(answerOutcome(http('party_full'))).toEqual({
      kind: 'retry',
      error: 'That was the last place — the party just filled up.',
      party: { full: true },
    });
  });

  it('is gone only when the party link closed', () => {
    expect(answerOutcome(http('party_not_found'))).toEqual({ kind: 'gone' });
    expect(answerOutcome(http('invite_not_found')).kind).toBe('retry');
  });

  it('asks to try again on anything else', () => {
    const again = {
      kind: 'retry',
      error: "Couldn't send that. Try again in a moment.",
    };
    expect(answerOutcome({ ok: false, error: { kind: 'network' } })).toEqual(
      again,
    );
    expect(answerOutcome(http(null))).toEqual(again);
    expect(
      answerOutcome({ ok: true, value: null as unknown as InviteOpenDTO }),
    ).toEqual(again);
  });
});

describe('passing it on', () => {
  it('words the message from the guest, with the place when there is one', () => {
    const party = { name: 'Rooftop', date: '2026-11-14' };
    expect(forwardMessage(party, 'Milano', 'https://x/i/a')).toMatch(
      /^I'm going to Rooftop on .+ at Milano, come along! \\\(\^o\^\)\/ RSVP here: https:\/\/x\/i\/a$/,
    );
    expect(forwardMessage(party, 'Milano', 'L')).toMatch(/^[\x20-\x7E]*$/);
    expect(forwardMessage(party, '', 'L')).not.toContain(' at ');
  });

  it('names the QR file after the party', () => {
    expect(forwardQrFileName('Anna’s 30th!')).toBe('anna-s-30th--invite.png');
    expect(forwardQrFileName(undefined)).toBe('party-invite.png');
  });
});

describe('the name, as two fields', () => {
  it('joins them into one, spaces tidied', () => {
    expect(joinName({ first: ' Maria ', last: 'De   Luca ' })).toBe(
      'Maria De Luca',
    );
  });

  it('caps the joined name like the server does', () => {
    expect(
      joinName({ first: 'A'.repeat(40), last: 'B'.repeat(40) }),
    ).toHaveLength(60);
  });

  it('splits a stored name back: first word, then the rest', () => {
    expect(splitName('Maria De Luca')).toEqual({
      first: 'Maria',
      last: 'De Luca',
    });
    expect(splitName('Giulia')).toEqual({ first: 'Giulia', last: '' });
    expect(splitName(null)).toEqual({ first: '', last: '' });
  });
});
