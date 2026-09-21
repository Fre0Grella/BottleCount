<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { InviteAnswer, InviteOpenDTO } from '../../shared/invites';
import { inviteUrl } from '../../shared/invites';
import { answerInvite, openInvite } from '../lib/invites';
import { COVERS } from '../lib/store';
import Icon from './Icon.vue';

/**
 * The page a guest lands on. It is the only screen in the app with no account
 * behind it and no IndexedDB — everything it knows comes from the link and the
 * two endpoints it calls.
 */

type Phase = 'loading' | 'ready' | 'answered' | 'gone' | 'error';

const phase = ref<Phase>('loading');
const data = ref<InviteOpenDTO | null>(null);
const name = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

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
const isDeclined = computed(() => data.value?.status === 'declined');

/** Their own link to forward, once they have said yes and if the host allows it. */
const forwardLink = computed(() => {
  const token = data.value?.forwardToken;
  if (!token || !data.value) return '';
  return inviteUrl(window.location.host, base, data.value.party.slug, token);
});

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
    phase.value = result.error === 'http_404' ? 'gone' : 'error';
    return;
  }

  data.value = result.value;
  rememberInviteId(slug.value, result.value.inviteId);
  name.value = result.value.name ?? '';
  phase.value = result.value.status === 'opened' ? 'ready' : 'answered';
});

async function respond(answer: InviteAnswer): Promise<void> {
  if (submitting.value || !data.value) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    error.value = 'Pop your name in first.';
    return;
  }

  submitting.value = true;
  error.value = null;

  const result = await answerInvite(slug.value, {
    inviteId: data.value.inviteId,
    name: trimmed,
    answer,
  });

  if (result.ok && result.value) {
    data.value = result.value;
    phase.value = 'answered';
  } else if (result.error === 'party_full') {
    // Re-read so the card flips to "full" — someone took the last place while
    // this guest was typing.
    error.value = 'That was the last place — the party just filled up.';
    if (data.value) {
      data.value = {
        ...data.value,
        party: { ...data.value.party, full: true },
      };
    }
  } else if (result.error === 'http_404') {
    phase.value = 'gone';
  } else {
    error.value = "Couldn't send that. Try again in a moment.";
  }

  submitting.value = false;
}

function changeAnswer(): void {
  phase.value = 'ready';
  error.value = null;
}

function copyForward(): void {
  navigator.clipboard
    ?.writeText(`https://${forwardLink.value}`)
    .then(() => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
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
            <button class="invite-btn invite-btn--ghost" @click="copyForward">
              <Icon name="copy" :size="14" />
              {{ copied ? 'Copied' : 'Copy my link' }}
            </button>
          </div>

          <button class="invite-secondary" @click="changeAnswer">
            Change my answer
          </button>
        </template>

        <!-- Not yet answered -->
        <template v-else>
          <p v-if="full" class="invite-full">
            <Icon name="info" :size="14" />
            This party is full. You can still let the host know you can't come.
          </p>

          <label class="invite-label" for="invite-name">Your name</label>
          <input
            id="invite-name"
            v-model="name"
            class="invite-input"
            placeholder="How the host knows you"
            autocomplete="name"
            maxlength="60"
            @keyup.enter="respond('confirmed')"
          />

          <p v-if="error" class="invite-error">{{ error }}</p>

          <div class="invite-actions">
            <button
              class="invite-btn invite-btn--yes"
              :disabled="submitting || full"
              @click="respond('confirmed')"
            >
              <Icon name="check" :size="15" />
              {{ submitting ? 'Sending…' : "I'm in" }}
            </button>
            <button
              class="invite-btn invite-btn--no"
              :disabled="submitting"
              @click="respond('declined')"
            >
              <Icon name="x" :size="15" />
              Can't make it
            </button>
          </div>
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
.invite-btn--ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  flex: none;
  align-self: flex-start;
  padding: 10px 15px;
  min-height: 40px;
  font-size: 13px;
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
