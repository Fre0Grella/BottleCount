<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CollaboratorPreviewDTO } from '../../shared/collab';
import {
  acceptCollaboratorInvite,
  previewCollaboratorInvite,
} from '../lib/collab';
import { fetchSession } from '../lib/session';
import { COVERS } from '../lib/store';
import { APP_URL } from '../lib/links';
import Icon from './Icon.vue';

/**
 * Where a co-organiser invite lands.
 *
 * Unlike a guest invite this one needs an account — an editor has to be
 * somebody the owner can later remove — so a signed-out visitor is sent through
 * Google first and comes back here.
 */

type Phase = 'loading' | 'signin' | 'ready' | 'joined' | 'gone' | 'error';

const phase = ref<Phase>('loading');
const preview = ref<CollaboratorPreviewDTO | null>(null);
const joining = ref(false);

const base = import.meta.env.BASE_URL as string;

function tokenFromPath(): string {
  const path = window.location.pathname.replace(base, '/');
  const match = /^\/join\/([^/?#]+)/.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

const token = ref('');

const cover = computed(() => COVERS[preview.value?.cover ?? 0] ?? COVERS[0]);

const dateLabel = computed(() => {
  const iso = preview.value?.date;
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
});

onMounted(async () => {
  token.value = tokenFromPath();
  if (!token.value) {
    phase.value = 'gone';
    return;
  }

  const session = await fetchSession();
  if (!session.authenticated) {
    phase.value = 'signin';
    return;
  }

  const result = await previewCollaboratorInvite(token.value);
  if (!result.ok || !result.value) {
    phase.value = result.error === 'http_404' ? 'gone' : 'error';
    return;
  }

  preview.value = result.value;
  // Already on the party: nothing to accept, just show them the way in.
  phase.value = result.value.alreadyMember ? 'joined' : 'ready';
});

async function accept(): Promise<void> {
  if (joining.value) return;
  joining.value = true;

  const result = await acceptCollaboratorInvite(token.value);
  phase.value = result.ok ? 'joined' : 'error';
  joining.value = false;
}

/**
 * Signing in leaves this page and comes back to it. The Worker's callback goes
 * to `/auth/callback`, so the return path is remembered here and picked up by
 * the app once the session exists.
 */
function signIn(): void {
  try {
    sessionStorage.setItem('bc-after-signin', window.location.pathname);
  } catch {
    /* Private window. They land on the app and can reopen the link. */
  }
  window.location.href = '/auth/google';
}
</script>

<template>
  <div class="join-page">
    <div v-if="phase === 'loading'" class="join-state">
      <span class="join-spinner"><Icon name="users" :size="24" /></span>
      <p>Opening your invitation…</p>
    </div>

    <div v-else-if="phase === 'signin'" class="join-card join-card--plain">
      <h1>You've been asked to co-organise</h1>
      <p>
        Co-organising means editing someone's party, so we need to know who you
        are. Sign in and you'll come straight back here.
      </p>
      <p class="join-note">
        You won't be charged for this — the party belongs to whoever invited
        you, and it's already paid for.
      </p>
      <button class="join-btn join-btn--primary" @click="signIn">
        <Icon name="user" :size="15" />
        Sign in with Google
      </button>
    </div>

    <div v-else-if="phase === 'gone'" class="join-state">
      <h1>This invitation has expired</h1>
      <p>
        The link is no longer active — whoever sent it may have revoked it. Ask
        them for a fresh one.
      </p>
    </div>

    <div v-else-if="phase === 'error'" class="join-state">
      <h1>Something went wrong</h1>
      <p>
        We couldn't open this invitation. Check your connection and refresh.
      </p>
    </div>

    <div v-else-if="preview" class="join-card">
      <div class="join-cover" :style="{ background: cover?.grad }">
        <span class="join-emoji">{{ cover?.emoji }}</span>
        <h1 class="join-title">{{ preview.partyName }}</h1>
        <p class="join-when">{{ dateLabel }}</p>
      </div>

      <div class="join-body">
        <template v-if="phase === 'joined'">
          <div class="join-verdict">
            <Icon name="check" :size="18" />
            <div>
              <strong>You're a co-organiser.</strong>
              <span>The party is in your list now.</span>
            </div>
          </div>
          <a class="join-btn join-btn--primary" :href="APP_URL">
            Open the party
          </a>
        </template>

        <template v-else>
          <p class="join-invited">
            <strong>{{ preview.invitedBy }}</strong> has asked you to help run
            this party.
          </p>
          <p class="join-note">
            You'll be able to edit the menu, the budget and the guest list, from
            your own device. You can't delete the party or remove people — that
            stays with {{ preview.invitedBy }}.
          </p>
          <button
            class="join-btn join-btn--primary"
            :disabled="joining"
            @click="accept"
          >
            <Icon name="check" :size="15" />
            {{ joining ? 'Joining…' : "I'm in" }}
          </button>
          <a class="join-secondary" :href="APP_URL">No thanks</a>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.join-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}

.join-state {
  max-width: 34ch;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.join-state h1 {
  font-family: var(--font-disp);
  font-size: 22px;
  margin: 0;
}
.join-state p {
  color: var(--dim);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}
.join-spinner {
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

.join-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}
.join-card--plain {
  padding: 26px 24px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.join-card--plain h1 {
  font-family: var(--font-disp);
  font-size: 21px;
  line-height: 1.2;
  margin: 0;
}
.join-card--plain p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--dim);
}

.join-cover {
  padding: 28px 22px 22px;
  color: #fff;
}
.join-emoji {
  font-size: 30px;
  display: block;
  margin-bottom: 10px;
}
.join-title {
  font-family: var(--font-disp);
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
}
.join-when {
  margin: 6px 0 0;
  font-size: 13px;
  opacity: 0.92;
}

.join-body {
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.join-invited {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}
.join-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--faint);
}

.join-btn {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  padding: 13px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  min-height: 46px;
  text-decoration: none;
}
.join-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.join-btn--primary {
  background: var(--accent);
  color: var(--on-accent);
}

.join-verdict {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 15px;
  border-radius: var(--rs);
  background: var(--surface2);
  color: var(--good);
}
.join-verdict div {
  display: flex;
  flex-direction: column;
}
.join-verdict strong {
  font-size: 14px;
}
.join-verdict span {
  font-size: 12px;
  color: var(--dim);
}

.join-secondary {
  align-self: center;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dim);
  text-decoration: none;
}
</style>
