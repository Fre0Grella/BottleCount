import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { guestName, normaliseEmail } from '../../../shared/contact';
import { newToken } from '../lib/tokens';
import type { AppEnv } from '../appEnv';
import { deployment } from '../deployment';
import { resolveFrontendUrl } from './frontendUrl';
import { findOpenParty, findPartyInvite } from './middleware';

type Env = AppEnv;
type Bindings = Env['Bindings'];

/**
 * "Continue with Google" for a guest confirming a paid party (#22).
 *
 * A separate flow from host sign-in, on purpose: that one upserts a `users`
 * row and issues a session, and on a self-hosted install every signed-in user
 * is `pro` (ADR 0001). A guest has no account (ADR 0002), so this flow creates
 * neither. It asks Google for a verified email and name, writes the email onto
 * the guest's invite, and sends the guest back to their invite page with the
 * form filled in.
 *
 * The invite rides in the OAuth `state`, which is signed — with a key of its
 * own, so it is never mistaken for a session — short-lived, and bound to the
 * browser that started the flow by a one-time nonce cookie. A `state` lifted
 * from someone else's redirect, edited, or used a second time is refused, so it
 * cannot write an email onto an invite that is not the caller's.
 */
const guestGoogle = new Hono<Env>();

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/** Long enough to pick an account, short enough that a leaked state is stale. */
const STATE_TTL_SECONDS = 10 * 60;
const NONCE_COOKIE = 'guest_google_nonce';
const PURPOSE = 'guest-google';

interface GuestState {
  purpose: typeof PURPOSE;
  slug: string;
  inviteId: string;
  nonce: string;
  exp: number;
}

function stateKey(env: Bindings): string {
  return `${env.JWT_SECRET}:${PURPOSE}`;
}

function callbackUrl(env: Bindings): string {
  // The frontend origin, like host sign-in: the Pages Function at
  // functions/auth/guest-google proxies it here, keeping the nonce cookie
  // first-party.
  return `${resolveFrontendUrl(env)}/auth/guest-google/callback`;
}

function backToInvite(c: Context<Env>, slug: string, fragment: string) {
  const base = resolveFrontendUrl(c.env);
  return c.redirect(`${base}/i/${encodeURIComponent(slug)}#${fragment}`);
}

/** base64url, so the fragment survives without escaping. */
function encodeFragment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * `GET /auth/guest-google?slug=…&invite=…` — off to Google.
 *
 * Only for an invite that exists on an open party: a state minted for nothing
 * would be a way to probe which invite ids are real.
 */
guestGoogle.get('/guest-google', async (c) => {
  if (!deployment(c.env).guestGoogle) {
    return c.json({ error: 'not_found' }, 404);
  }

  const slug = c.req.query('slug') ?? '';
  const inviteId = c.req.query('invite') ?? '';
  const party = await findOpenParty(c.var.repositories, slug);
  if (!party) return c.json({ error: 'party_not_found' }, 404);
  if (!(await findPartyInvite(c.var.repositories, party.id, inviteId))) {
    return backToInvite(c, slug, 'google_error=invite');
  }

  const nonce = newToken();
  const state: GuestState = {
    purpose: PURPOSE,
    slug,
    inviteId,
    nonce,
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  setCookie(c, NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/auth/guest-google',
    maxAge: STATE_TTL_SECONDS,
  });

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID.trim());
  url.searchParams.set('redirect_uri', callbackUrl(c.env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set(
    'state',
    await sign({ ...state }, stateKey(c.env), 'HS256'),
  );
  return c.redirect(url.toString());
});

/** The state, if it is ours, unexpired, and from this browser. */
async function readState(c: Context<Env>): Promise<GuestState | null> {
  const raw = c.req.query('state');
  const cookieNonce = getCookie(c, NONCE_COOKIE);
  // One use only: whatever happens next, this browser's nonce is spent.
  deleteCookie(c, NONCE_COOKIE, { path: '/auth/guest-google' });
  if (!raw || !cookieNonce) return null;

  try {
    const payload = (await verify(
      raw,
      stateKey(c.env),
      'HS256',
    )) as unknown as GuestState;
    if (payload.purpose !== PURPOSE) return null;
    if (payload.nonce !== cookieNonce) return null;
    return payload;
  } catch {
    // Bad signature, or expired — `verify` checks `exp`.
    return null;
  }
}

interface GoogleProfile {
  email?: string;
  email_verified?: boolean;
  name?: string;
}

async function profileFor(
  c: Context<Env>,
  code: string,
): Promise<GoogleProfile | null> {
  const token = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID.trim(),
      client_secret: c.env.GOOGLE_CLIENT_SECRET.trim(),
      redirect_uri: callbackUrl(c.env),
      grant_type: 'authorization_code',
    }),
  }).catch(() => null);
  if (!token?.ok) return null;
  const { access_token } = (await token.json()) as { access_token?: string };
  if (!access_token) return null;

  const info = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${access_token}` },
  }).catch(() => null);
  if (!info?.ok) return null;
  return (await info.json()) as GoogleProfile;
}

/**
 * `GET /auth/guest-google/callback` — Google sends the guest back.
 *
 * Writes the email onto the invite and returns to the invite page with name and
 * email in the URL fragment, which never reaches a server: the invite endpoints
 * do not hand contact details back to anyone (#21), so the page fills its form
 * from here instead. The guest still presses "I'm in" to confirm.
 */
guestGoogle.get('/guest-google/callback', async (c) => {
  if (!deployment(c.env).guestGoogle) {
    return c.json({ error: 'not_found' }, 404);
  }

  const state = await readState(c);
  if (!state) return c.json({ error: 'invalid_state' }, 400);

  const code = c.req.query('code');
  if (!code) return backToInvite(c, state.slug, 'google_error=cancelled');

  const profile = await profileFor(c, code);
  const email = profile?.email_verified
    ? normaliseEmail(profile.email ?? '')
    : null;
  if (!email) return backToInvite(c, state.slug, 'google_error=email');

  // Re-checked rather than trusted from the state: the party may have closed
  // its link, or the invite gone, in the minute spent at Google.
  const party = await findOpenParty(c.var.repositories, state.slug);
  const invite =
    party &&
    (await findPartyInvite(c.var.repositories, party.id, state.inviteId));
  if (!party || !invite) {
    return backToInvite(c, state.slug, 'google_error=invite');
  }

  await c.var.repositories.invites.setContact({
    inviteId: invite.id,
    partyId: party.id,
    contact: { email, phone: invite.phone },
  });

  const name = guestName(profile?.name ?? '');
  return backToInvite(
    c,
    state.slug,
    `google=${encodeFragment({ name, email })}`,
  );
});

export default guestGoogle;
