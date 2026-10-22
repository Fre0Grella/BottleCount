<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { requireContact } from '../../shared/contact';
import type { InviteAnswer, InviteOpenDTO } from '../../shared/invites';
import { inviteUrl } from '../../shared/invites';
import { formatIban, paymentReference } from '../../shared/payments';
import { answerInvite, openInvite } from '../lib/api/guests';
import { isNotFound } from '../lib/api/request';
import { COVERS } from '../lib/store';
import BrandMark from './BrandMark.vue';
import Icon from './Icon.vue';
import ShareChannels from './ShareChannels.vue';

/**
 * The page a guest lands on. It is the only screen in the app with no account
 * behind it and no IndexedDB — everything it knows comes from the link and the
 * two endpoints it calls.
 */

type Phase = 'loading' | 'ready' | 'answered' | 'gone' | 'error';

const phase = ref<Phase>('loading');
const data = ref<InviteOpenDTO | null>(null);
/**
 * The answer the guest picked on the first screen, or null while they have
 * not. The RSVP is two steps on purpose: the choice alone first, so nobody is
 * met with a form before deciding, then only the details that answer needs.
 */
const choice = ref<InviteAnswer | null>(null);
const name = ref('');
const email = ref('');
const phone = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);
/** Which copy button last worked, so only that one says "Copied". */
const copied = ref<string | null>(null);
const showBank = ref(false);

const base = import.meta.env.BASE_URL as string;

/**
 * The slug is in the path (`/i/<slug>`), which a static build cannot route on
 * its own — a Pages Function rewrites `/i/*` onto this page and the slug is
 * read back off the URL here.
 */
function slugFromPath(): string {
  const path = window.location.pathname.replace(base, '/');
  const match = /^\/i\/([^/?#]+)/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

const slug = ref('');

/** Which guest this browser already is, if it has been here before. */
function storageKey(s: string): string {
  return `bc-invite:${s}`;
}

function rememberedInviteId(s: string): string | null {
  try {
    return localStorage.getItem(storageKey(s));
  } catch {
    // Private windows and blocked site data. They will be counted as a new
    // visitor on their next visit, which overstates "reached" slightly — far
    // better than refusing to let them RSVP at all.
    return null;
  }
}

function rememberInviteId(s: string, id: string): void {
  try {
    localStorage.setItem(storageKey(s), id);
  } catch {
    /* see above */
  }
}

/**
 * The email and phone this browser last confirmed with.
 *
 * Kept here because the server never hands them back — the invite id that
 * identifies a guest is a bearer token, and a page that echoed contact details
 * to whoever holds it would leak them. Remembering them locally is what saves a
 * guest who changes their answer from typing them again.
 */
function contactKey(s: string): string {
  return `bc-invite-contact:${s}`;
}

function rememberedContact(s: string): { email: string; phone: string } {
  try {
    const raw = localStorage.getItem(contactKey(s));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return {
      email: typeof parsed['email'] === 'string' ? parsed['email'] : '',
      phone: typeof parsed['phone'] === 'string' ? parsed['phone'] : '',
    };
  } catch {
    return { email: '', phone: '' };
  }
}

function rememberContact(s: string, contact: { email: string; phone: string }) {
  try {
    localStorage.setItem(contactKey(s), JSON.stringify(contact));
  } catch {
    /* see rememberedInviteId */
  }
}

const cover = computed(() => COVERS[data.value?.party.cover ?? 0] ?? COVERS[0]);

const dateLabel = computed(() => {
  const iso = data.value?.party.date;
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
});

const whereLabel = computed(() => {
  const venue = data.value?.party.venue;
  if (!venue) return '';
  return [venue.place, venue.city].filter(Boolean).join(', ');
});

const isConfirmed = computed(() => data.value?.status === 'confirmed');
/** Guests pay for this party, so saying yes needs somewhere to send the ticket. */
const isPaid = computed(() => data.value?.party.paid === true);

/** Offered on a paid party, when this deployment has a Google client. */
const offerGoogle = computed(
  () => isPaid.value && data.value?.party.googleSignIn === true,
);
const fromGoogle = ref(false);

/** Hands the guest to Google; they come back to this page with the form filled. */
function continueWithGoogle(): void {
  if (!data.value) return;
  const params = new URLSearchParams({
    slug: slug.value,
    invite: data.value.inviteId,
  });
  window.location.href = `${base}auth/guest-google?${params.toString()}`;
}

/**
 * What Google sent back, read off the URL fragment and then erased from it.
 * The fragment never reaches a server, and the invite endpoints never return a
 * guest's email (#21), so this is how the verified one gets into the form.
 */
function takeGoogleResult(): void {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const encoded = hash.get('google');
  const failed = hash.get('google_error');
  if (!encoded && !failed) return;
  history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search,
  );
  // Google is only offered on the "I'm in" details step, so that is where the
  // guest goes back to, whether it worked or not.
  choice.value = 'confirmed';

  if (failed) {
    error.value =
      failed === 'email'
        ? 'Google didn’t share a verified email. Type yours below.'
        : 'Google sign-in didn’t finish. Try again, or type your email.';
    return;
  }
  try {
    const padded = encoded!.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
    const profile = JSON.parse(new TextDecoder().decode(bytes)) as {
      name?: string;
      email?: string;
    };
    if (profile.email) email.value = profile.email;
    if (profile.name && !name.value.trim()) name.value = profile.name;
    fromGoogle.value = !!profile.email;
  } catch {
    /* a mangled fragment: the form is still there to type into */
  }
}
const isDeclined = computed(() => data.value?.status === 'declined');

/** Their own link to forward, once they have said yes and if the host allows it. */
const forwardLink = computed(() => {
  const token = data.value?.forwardToken;
  if (!token || !data.value) return '';
  return inviteUrl(window.location.origin, base, data.value.party.slug, token);
});

/**
 * What travels with the forward link. Worded from the guest's side — they are
 * the one sending it, to their own friend — not the host's "you're invited".
 */
const forwardMessage = computed(() => {
  const party = data.value?.party;
  if (!party) return forwardLink.value;
  const day = new Date(`${party.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const where = whereLabel.value ? ` at ${whereLabel.value}` : '';
  return `I'm going to ${party.name} on ${day}${where} — come along! RSVP here: ${forwardLink.value}`;
});

const forwardQrFileName = computed(
  () =>
    `${(data.value?.party.name ?? 'party').replace(/[^\w-]+/g, '-').toLowerCase()}-invite.png`,
);

/** How to pay the host. The server only sends it once they have said yes. */
const payment = computed(() =>
  isConfirmed.value ? (data.value?.payment ?? null) : null,
);

const priceLabel = computed(() => {
  const price = payment.value?.price ?? 0;
  if (price <= 0) return '';
  return `€${Number.isInteger(price) ? price : price.toFixed(2)}`;
});

/** The causale, so the host can tell whose transfer is whose. */
const reference = computed(() =>
  data.value
    ? paymentReference(data.value.party.name, data.value.name ?? '')
    : '',
);

/** A full party can still be declined, so the form stays — only yes is barred. */
const full = computed(
  () => data.value?.party.full === true && !isConfirmed.value,
);

onMounted(async () => {
  slug.value = slugFromPath();
  if (!slug.value) {
    phase.value = 'gone';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const result = await openInvite(slug.value, {
    referrer: params.get('r'),
    inviteId: rememberedInviteId(slug.value),
  });

  if (!result.ok || !result.value) {
    phase.value = !result.ok && isNotFound(result.error) ? 'gone' : 'error';
    return;
  }

  data.value = result.value;
  rememberInviteId(slug.value, result.value.inviteId);
  name.value = result.value.name ?? '';
  const contact = rememberedContact(slug.value);
  email.value = contact.email;
  phone.value = contact.phone;
  takeGoogleResult();
  phase.value = result.value.status === 'opened' ? 'ready' : 'answered';
});

const CONTACT_ERRORS: Record<string, string> = {
  contact_required:
    'Add an email or a phone number — it’s where your ticket goes.',
  invalid_email: 'That email doesn’t look right.',
  invalid_phone: 'That phone number doesn’t look right.',
};

async function respond(answer: InviteAnswer): Promise<void> {
  if (submitting.value || !data.value) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = 'Pop your name in first.';
    return;
  }

  // Checked here as well as on the server, so the guest hears what is wrong
  // before the round trip — with the same rules, so the two never disagree.
  const needsContact = answer === 'confirmed' && isPaid.value;
  const contact = requireContact(email.value, phone.value);
  if (needsContact && 'error' in contact) {
    error.value = CONTACT_ERRORS[contact.error] ?? null;
    return;
  }

  submitting.value = true;
  error.value = null;

  const result = await answerInvite(slug.value, {
    inviteId: data.value.inviteId,
    name: trimmed,
    answer,
    ...(needsContact && !('error' in contact)
      ? { email: contact.email ?? '', phone: contact.phone ?? '' }
      : {}),
  });

  const failure = result.ok ? null : result.error;
  const code = failure?.kind === 'http' ? failure.code : null;

  if (result.ok && result.value) {
    data.value = result.value;
    phase.value = 'answered';
    if (needsContact) {
      rememberContact(slug.value, { email: email.value, phone: phone.value });
    }
  } else if (code && CONTACT_ERRORS[code]) {
    // The host made the party paid while this guest had the page open, or the
    // server read the details differently. Either way, say which field.
    error.value = CONTACT_ERRORS[code] ?? null;
    if (data.value && code === 'contact_required') {
      data.value = {
        ...data.value,
        party: { ...data.value.party, paid: true },
      };
    }
  } else if (code === 'party_full') {
    // Re-read so the card flips to "full" — someone took the last place while
    // this guest was typing.
    error.value = 'That was the last place — the party just filled up.';
    if (data.value) {
      data.value = {
        ...data.value,
        party: { ...data.value.party, full: true },
      };
    }
  } else if (failure && isNotFound(failure)) {
    phase.value = 'gone';
  } else {
    error.value = "Couldn't send that. Try again in a moment.";
  }

  submitting.value = false;
}

function changeAnswer(): void {
  phase.value = 'ready';
  choice.value = null;
  error.value = null;
}

/** First step: the answer. The details step follows. */
function choose(answer: InviteAnswer): void {
  choice.value = answer;
  error.value = null;
}

/** Back from the details to the choice, keeping whatever was typed. */
function backToChoice(): void {
  choice.value = null;
  error.value = null;
}

/** On the details step, Enter sends the answer they picked. */
function submitChoice(): void {
  if (choice.value) void respond(choice.value);
}

/** Whether the details step asks how to reach them: a yes to a paid party. */
const asksContact = computed(
  () => choice.value === 'confirmed' && isPaid.value,
);

function copy(text: string, key: string): void {
  navigator.clipboard
    ?.writeText(text)
    .then(() => {
      copied.value = key;
      setTimeout(() => {
        if (copied.value === key) copied.value = null;
      }, 2000);
    })
    .catch(() => {});
}
</script>

<template>
  <div class="invite-page">
    <!-- Loading -->
    <div v-if="phase === 'loading'" class="invite-state">
      <span class="invite-spinner"><Icon name="bottle" :size="24" /></span>
      <p>Opening your invite…</p>
    </div>

    <!-- The link is dead: never existed, or the host turned it off. -->
    <div v-else-if="phase === 'gone'" class="invite-state">
      <h1>This invite has expired</h1>
      <p>
        The link is no longer active — the host may have closed the guest list.
        Ask them for a fresh one.
      </p>
      <a class="invite-secondary" :href="base">What is BottleCount?</a>
    </div>

    <div v-else-if="phase === 'error'" class="invite-state">
      <h1>Something went wrong</h1>
      <p>We couldn't load this invite. Check your connection and refresh.</p>
    </div>

    <!-- The invitation itself -->
    <div v-else-if="data" class="invite-card">
      <div class="invite-cover" :style="{ background: cover?.grad }">
        <span class="invite-emoji">{{ cover?.emoji }}</span>
        <h1 class="invite-title">{{ data.party.name }}</h1>
        <p class="invite-when">{{ dateLabel }} · {{ data.party.venue.time }}</p>
      </div>

      <div class="invite-body">
        <p v-if="whereLabel" class="invite-where">
          <Icon name="mapPin" :size="14" />
          {{ whereLabel }}
        </p>

        <!-- Already answered -->
        <template v-if="phase === 'answered'">
          <div v-if="isConfirmed" class="invite-verdict invite-verdict--yes">
            <Icon name="check" :size="18" />
            <div>
              <strong>You're on the list, {{ data.name }}.</strong>
              <span>See you there.</span>
            </div>
          </div>
          <div v-else-if="isDeclined" class="invite-verdict invite-verdict--no">
            <Icon name="x" :size="18" />
            <div>
              <strong>You've said you can't make it.</strong>
              <span>No hard feelings.</span>
            </div>
          </div>

          <!-- Paying the host. BottleCount only shows the way; the money goes
               straight to them. -->
          <div v-if="payment" class="invite-pay">
            <div class="invite-pay__head">
              <span>Pay for your ticket</span>
              <strong v-if="priceLabel">{{ priceLabel }}</strong>
            </div>

            <a
              v-if="payment.paypalUrl"
              class="pay-btn pay-btn--paypal"
              :href="payment.paypalUrl"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pay with PayPal"
            >
              <span>Pay with</span>
              <span class="paypal-mark" aria-hidden="true"
                ><span class="paypal-mark__pay">Pay</span
                ><span class="paypal-mark__pal">Pal</span></span
              >
            </a>

            <a
              v-if="payment.satispayUrl"
              class="pay-btn pay-btn--satispay"
              :href="payment.satispayUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pay with <BrandMark name="satispay" :size="17" />
              <strong>Satispay</strong>
            </a>

            <a
              v-if="payment.revolutUrl"
              class="pay-btn pay-btn--revolut"
              :href="payment.revolutUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pay with <BrandMark name="revolut" :size="16" />
              <strong>Revolut</strong>
            </a>

            <template v-if="payment.bank">
              <button
                class="pay-btn pay-btn--bank"
                :aria-expanded="showBank"
                @click="showBank = !showBank"
              >
                <Icon name="euro" :size="15" />
                Bank transfer
                <Icon :name="showBank ? 'chevU' : 'chevD'" :size="14" />
              </button>

              <dl v-if="showBank" class="invite-bank">
                <div class="invite-bank__row">
                  <dt>Account holder</dt>
                  <dd>{{ payment.bank.holder }}</dd>
                  <button
                    class="invite-bank__copy"
                    @click="copy(payment.bank.holder, 'holder')"
                  >
                    {{ copied === 'holder' ? 'Copied' : 'Copy' }}
                  </button>
                </div>
                <div class="invite-bank__row">
                  <dt>IBAN</dt>
                  <dd class="invite-bank__mono">
                    {{ formatIban(payment.bank.iban) }}
                  </dd>
                  <button
                    class="invite-bank__copy"
                    @click="copy(payment.bank.iban, 'iban')"
                  >
                    {{ copied === 'iban' ? 'Copied' : 'Copy' }}
                  </button>
                </div>
                <div v-if="priceLabel" class="invite-bank__row">
                  <dt>Amount</dt>
                  <dd>{{ priceLabel }}</dd>
                </div>
                <div class="invite-bank__row">
                  <dt>Causale</dt>
                  <dd>{{ reference }}</dd>
                  <button
                    class="invite-bank__copy"
                    @click="copy(reference, 'reference')"
                  >
                    {{ copied === 'reference' ? 'Copied' : 'Copy' }}
                  </button>
                </div>
              </dl>
            </template>

            <p class="invite-pay__note">
              The money goes straight to the host, who marks you as paid once it
              arrives.
            </p>
          </div>

          <!-- Their own link to pass on. Only appears once confirmed. -->
          <div v-if="forwardLink" class="invite-forward">
            <div class="invite-forward__head">
              <Icon name="share" :size="14" />
              Bring someone
            </div>
            <p>
              The host is happy for you to invite a friend. Share your own link
              and they'll show up as yours.
            </p>
            <ShareChannels
              :link="forwardLink"
              :message="forwardMessage"
              :email-subject="`Come to ${data.party.name}`"
              :share-title="data.party.name"
              :qr-file-name="forwardQrFileName"
            />
          </div>

          <button class="invite-secondary" @click="changeAnswer">
            Change my answer
          </button>
        </template>

        <!-- Not yet answered, step 1: only the choice. -->
        <template v-else-if="choice === null">
          <p v-if="full" class="invite-full">
            <Icon name="info" :size="14" />
            This party is full. You can still let the host know you can't come.
          </p>

          <p v-if="error" class="invite-error">{{ error }}</p>

          <div class="invite-actions">
            <button
              class="invite-btn invite-btn--yes"
              :disabled="full"
              @click="choose('confirmed')"
            >
              <Icon name="check" :size="15" />
              I'm in
            </button>
            <button
              class="invite-btn invite-btn--no"
              @click="choose('declined')"
            >
              <Icon name="x" :size="15" />
              Can't make it
            </button>
          </div>
        </template>

        <!-- Step 2: the details that answer needs. -->
        <template v-else>
          <p class="invite-step">
            {{
              choice === 'confirmed'
                ? asksContact
                  ? 'Great! Tell the host who you are and where to send your ticket.'
                  : 'Great! Tell the host who you are.'
                : 'Sorry to miss you. Let the host know who you are.'
            }}
          </p>

          <label class="invite-label" for="invite-name">Your name</label>
          <input
            id="invite-name"
            v-model="name"
            class="invite-input"
            placeholder="How the host knows you"
            autocomplete="name"
            maxlength="60"
            @keyup.enter="submitChoice"
          />

          <!-- A yes to a paid party: somewhere to send the ticket once they've paid. -->
          <template v-if="asksContact">
            <button
              v-if="offerGoogle && !fromGoogle"
              type="button"
              class="invite-google"
              @click="continueWithGoogle"
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.9l4-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
                />
              </svg>
              Continue with Google
            </button>
            <p v-if="fromGoogle" class="invite-contact-note">
              Filled in from Google. Check it, then confirm.
            </p>
            <p class="invite-contact-note">
              An email, a phone number, or both — at least one.
            </p>
            <label class="invite-label" for="invite-email">Your email</label>
            <input
              id="invite-email"
              v-model="email"
              class="invite-input"
              type="email"
              inputmode="email"
              placeholder="Where your ticket goes"
              autocomplete="email"
              spellcheck="false"
              maxlength="254"
              @keyup.enter="submitChoice"
            />
            <label class="invite-label" for="invite-phone">
              Your phone
              <span class="invite-optional">(for WhatsApp)</span>
            </label>
            <input
              id="invite-phone"
              v-model="phone"
              class="invite-input"
              type="tel"
              inputmode="tel"
              placeholder="+39 333 123 4567"
              autocomplete="tel"
              @keyup.enter="submitChoice"
            />
            <!-- The phone is the field people hesitate over: say who uses it. -->
            <div class="invite-reassure">
              <svg
                class="invite-reassure__art"
                viewBox="0 0 48 48"
                width="44"
                height="44"
                aria-hidden="true"
              >
                <rect
                  x="9"
                  y="5"
                  width="20"
                  height="36"
                  rx="4"
                  fill="var(--surface2)"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <line
                  x1="16"
                  y1="36"
                  x2="22"
                  y2="36"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <path
                  d="M24 14h17a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9l-5 4v-4h-3a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z"
                  fill="var(--accent)"
                />
                <path
                  d="M30 19.5h8M30 23.5h5"
                  stroke="var(--on-accent)"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <p>
                The host sends your ticket from their own phone, by hand — no
                bots, no spam.
                <span>Used only to send your ticket for this party.</span>
              </p>
            </div>
          </template>

          <p v-if="error" class="invite-error">{{ error }}</p>

          <div class="invite-actions">
            <button
              class="invite-btn"
              :class="
                choice === 'confirmed' ? 'invite-btn--yes' : 'invite-btn--no'
              "
              :disabled="submitting || (choice === 'confirmed' && full)"
              @click="submitChoice"
            >
              <Icon :name="choice === 'confirmed' ? 'check' : 'x'" :size="15" />
              {{
                submitting
                  ? 'Sending…'
                  : choice === 'confirmed'
                    ? 'Confirm I’m in'
                    : 'Send my answer'
              }}
            </button>
          </div>
          <button
            class="invite-secondary"
            :disabled="submitting"
            @click="backToChoice"
          >
            Back
          </button>
        </template>
      </div>

      <p class="invite-foot">
        <a :href="base">Planned with BottleCount</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.invite-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}

.invite-state {
  max-width: 34ch;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.invite-state h1 {
  font-family: var(--font-disp);
  font-size: 22px;
  margin: 0;
}
.invite-state p {
  color: var(--dim);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}
.invite-spinner {
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--accent);
  color: var(--on-accent);
  animation: bcPulse 1.4s ease-in-out infinite;
}

.invite-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}

.invite-cover {
  padding: 28px 22px 22px;
  color: #fff;
}
.invite-emoji {
  font-size: 30px;
  display: block;
  margin-bottom: 10px;
}
.invite-title {
  font-family: var(--font-disp);
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
}
.invite-when {
  margin: 6px 0 0;
  font-size: 13px;
  opacity: 0.92;
}

.invite-body {
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.invite-where {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 13px;
  color: var(--dim);
}

.invite-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
  margin-bottom: -8px;
}
.invite-input {
  font-family: var(--font-body);
  font-size: 15px;
  padding: 13px 14px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  width: 100%;
}

.invite-reassure {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--rs);
  background: var(--surface2);
  color: var(--dim);
}
.invite-reassure__art {
  flex-shrink: 0;
  color: var(--dim);
}
.invite-reassure p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text);
}
.invite-reassure span {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--faint);
}

.invite-step {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--dim);
}

.invite-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 46px;
  padding: 11px 14px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: #fff;
  color: #1f1f1f;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.invite-optional {
  text-transform: none;
  letter-spacing: 0;
}
.invite-contact-note {
  margin: -6px 0 0;
  font-size: 11.5px;
  color: var(--faint);
  line-height: 1.5;
}

.invite-actions {
  display: flex;
  gap: 9px;
}
.invite-btn {
  flex: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  padding: 13px 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  min-height: 46px;
}
.invite-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.invite-btn--yes {
  background: var(--accent);
  color: var(--on-accent);
}
.invite-btn--no {
  background: transparent;
  border-color: var(--border);
  color: var(--dim);
}

.invite-verdict {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 15px;
  border-radius: var(--rs);
  background: var(--surface2);
}
.invite-verdict div {
  display: flex;
  flex-direction: column;
}
.invite-verdict strong {
  font-size: 14px;
}
.invite-verdict span {
  font-size: 12px;
  color: var(--dim);
}
.invite-verdict--yes {
  color: var(--good);
}
.invite-verdict--no {
  color: var(--faint);
}

.invite-forward {
  border-top: 1px solid var(--border);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.invite-forward__head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}
.invite-forward p {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
  line-height: 1.55;
}

.invite-pay {
  border-top: 1px solid var(--border);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.invite-pay__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
}
.invite-pay__head strong {
  font-family: var(--font-disp);
  font-size: 18px;
}
.invite-pay__note {
  margin: 0;
  font-size: 11.5px;
  color: var(--faint);
  line-height: 1.5;
}

.pay-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 46px;
  padding: 12px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
/* The colours of PayPal's own button, so it reads as the one people know. */
.pay-btn--paypal {
  background: #ffc439;
  color: #111;
}
.pay-btn--paypal:hover {
  background: #f2ba36;
}
.paypal-mark {
  font-family: Verdana, 'DejaVu Sans', sans-serif;
  font-size: 17px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: -0.02em;
}
.paypal-mark__pay {
  color: #003087;
}
.paypal-mark__pal {
  color: #009cde;
}
.pay-btn--satispay {
  background: #ef373e;
  color: #fff;
}
.pay-btn--satispay:hover {
  background: #db2f36;
}
/* Revolut's own near-black, with an edge so it still reads on a dark card. */
.pay-btn--revolut {
  background: #191c1f;
  border-color: #3d4249;
  color: #fff;
}
.pay-btn--revolut:hover {
  background: #2c3035;
}
.pay-btn--bank {
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

.invite-bank {
  margin: 0;
  padding: 4px 13px;
  border-radius: var(--rs);
  background: var(--surface2);
}
.invite-bank__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 10px;
  padding: 9px 0;
}
.invite-bank__row + .invite-bank__row {
  border-top: 1px solid var(--border);
}
.invite-bank__row dt {
  grid-column: 1 / -1;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}
.invite-bank__row dd {
  margin: 2px 0 0;
  font-size: 13.5px;
  overflow-wrap: anywhere;
}
.invite-bank__mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.invite-bank__copy {
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 5px 11px;
  font-family: var(--font-body);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}

.invite-full {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 11px 13px;
  border-radius: var(--rs);
  background: var(--surface2);
  color: var(--dim);
  font-size: 12.5px;
  line-height: 1.5;
}
.invite-error {
  margin: 0;
  font-size: 12.5px;
  color: var(--bad);
}

.invite-secondary {
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dim);
  text-decoration: none;
  align-self: center;
}

.invite-foot {
  margin: 0;
  padding: 0 22px 20px;
  text-align: center;
  font-size: 11px;
}
.invite-foot a {
  color: var(--faint);
  text-decoration: none;
}
</style>
