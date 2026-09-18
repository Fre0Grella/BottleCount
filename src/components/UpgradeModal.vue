<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../lib/store';
import { redeemLicence } from '../lib/session';
import type { Feature } from '../../shared/tiers';
import { APP_URL } from '../lib/links';
import Modal from './Modal.vue';
import Icon from './Icon.vue';

const store = useStore();

const base = import.meta.env.BASE_URL as string;

/** Why each locked feature needs a server, in the user's terms. */
const COPY: Record<Feature, { title: string; body: string }> = {
  inviteLink: {
    title: 'Invite links are a Pro feature',
    body: 'An invite link has to live somewhere your guests can open it. That means a server — so it ships with the hosted plan, not the browser-only one.',
  },
  rsvpFunnel: {
    title: 'The RSVP funnel is a Pro feature',
    body: 'The funnel counts people who replied through your invite link. Without links there is nothing to count, so the two unlock together.',
  },
  coOrganizers: {
    title: 'Co-organisers are a Pro feature',
    body: 'A second organiser needs to open the same party from their own device, which only works once the party is stored server-side.',
  },
  cloudSync: {
    title: 'Multi-device sync is a Pro feature',
    body: 'On the free plan your parties live in this browser and nowhere else. Pro keeps them on your account so any device you sign in on sees them.',
  },
  doorScannerSync: {
    title: 'Shared door scanning is a Pro feature',
    body: 'Two phones on the door need to agree on who has already walked in. That agreement is server-side; one phone on its own works on every plan.',
  },
};

const feature = computed(() => store.state.upgradeFor);
const copy = computed(() => (feature.value ? COPY[feature.value] : null));
const session = computed(() => store.state.session);

const code = ref('');
const redeeming = ref(false);
const error = ref<string | null>(null);

const ERRORS: Record<string, string> = {
  licence_unknown: "That code isn't valid. Check it and try again.",
  licence_already_redeemed: 'That code has already been used.',
  network_error: "Couldn't reach the server. Try again in a moment.",
};

async function handleRedeem(): Promise<void> {
  if (!code.value.trim() || redeeming.value) return;
  redeeming.value = true;
  error.value = null;
  const result = await redeemLicence(code.value);
  if (result.ok) {
    await store.refreshSession();
    store.closeUpgrade();
  } else {
    error.value = ERRORS[result.error ?? ''] ?? 'Something went wrong.';
  }
  redeeming.value = false;
}

watch(feature, (f) => {
  if (!f) {
    code.value = '';
    error.value = null;
  }
});
</script>

<template>
  <Modal
    :open="feature !== null"
    variant="sheet"
    max-width="460px"
    @close="store.closeUpgrade()"
  >
    <div v-if="copy" style="padding: 22px">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        "
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            align-items: center;
            justify-content: center;
            background: var(--accent-soft);
            color: var(--accent);
          "
        >
          <Icon name="lock" :size="17" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 16px;
          "
        >
          {{ copy.title }}
        </div>
      </div>

      <p
        style="
          font-size: 13px;
          line-height: 1.6;
          color: var(--dim);
          margin: 0 0 18px 0;
        "
      >
        {{ copy.body }}
      </p>

      <p
        v-if="!session.backendAvailable"
        style="
          font-size: 12.5px;
          line-height: 1.6;
          color: var(--dim);
          margin: -8px 0 16px 0;
        "
      >
        We can't reach the server from here, so there's nothing to sign in to
        right now. Everything on the planning side keeps working offline.
      </p>

      <!--
        No server answered. On the hosted app that means the Worker is down or
        unreachable; on a self-hosted copy it usually means the Pages project
        has no service binding. Either way there is no account to make and no
        code to redeem, so say so plainly instead of offering a sign-in link
        that cannot work.
      -->
      <a
        v-if="!session.backendAvailable"
        :href="APP_URL"
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          padding: 12px 16px;
          border-radius: 999px;
          border: none;
          background: var(--accent);
          color: var(--on-accent);
          text-decoration: none;
          margin-bottom: 12px;
        "
      >
        <Icon name="share" :size="15" />
        Reload the app
      </a>

      <!-- Signed out: signing in is the first step either way. -->
      <a
        v-else-if="!session.authenticated"
        href="/auth/google"
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 700;
          padding: 12px 16px;
          border-radius: 999px;
          border: none;
          background: var(--accent);
          color: var(--on-accent);
          text-decoration: none;
          margin-bottom: 12px;
        "
      >
        <Icon name="user" :size="15" />
        Sign in with Google
      </a>

      <!-- Signed in and still free: they need a code. -->
      <template v-else-if="session.authenticated">
        <label
          style="
            display: block;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--faint);
            margin-bottom: 7px;
          "
        >
          Have a licence code?
        </label>
        <div style="display: flex; gap: 8px; margin-bottom: 12px">
          <input
            v-model="code"
            placeholder="BC-XXXX-XXXX-XXXX"
            autocapitalize="characters"
            spellcheck="false"
            style="
              flex: 1;
              min-width: 0;
              font-family: var(--font-body);
              font-size: 13px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
            "
            @keyup.enter="handleRedeem"
          />
          <button
            :disabled="redeeming || !code.trim()"
            style="
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 13px;
              font-weight: 700;
              padding: 11px 16px;
              border-radius: 999px;
              border: none;
              background: var(--accent);
              color: var(--on-accent);
            "
            :style="{ opacity: redeeming || !code.trim() ? 0.55 : 1 }"
            @click="handleRedeem"
          >
            <Icon name="key" :size="14" />
            {{ redeeming ? 'Checking…' : 'Redeem' }}
          </button>
        </div>
        <div
          v-if="error"
          style="font-size: 12px; color: var(--bad); margin-bottom: 12px"
        >
          {{ error }}
        </div>
      </template>

      <a
        :href="`${base}pricing`"
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 12.5px;
          font-weight: 600;
          padding: 11px 16px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--dim);
          text-decoration: none;
        "
      >
        <Icon name="info" :size="14" />
        Compare plans — including self-hosting for free
      </a>
    </div>
  </Modal>
</template>
