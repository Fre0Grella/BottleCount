<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { COVERS } from '../lib/store';
import { brandedQrDataUrl } from '../lib/qr';
import { buildTicketFile, downloadFile } from '../lib/ticket';
import { parseTicketHash, type OpenedTicket } from '../lib/ticketLink';
import Icon from './Icon.vue';

/**
 * A guest's ticket, opened from the link the host sent them.
 *
 * Like the invite page it has no account and no server call: everything is in
 * the URL fragment (see `lib/ticketLink.ts`). The QR drawn here is the same
 * signed string the host's ticket carries, so the door scans it exactly as it
 * would the host's copy.
 */

const ticket = ref<OpenedTicket | null>(null);
const qr = ref<string | null>(null);
const broken = ref(false);
const saving = ref(false);

const base = import.meta.env.BASE_URL as string;

const cover = computed(() => COVERS[ticket.value?.cover ?? 0] ?? COVERS[0]);

const dateLabel = computed(() => {
  const iso = ticket.value?.date;
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
});

const expired = computed(() => {
  const at = ticket.value?.payload.expiresAt;
  return at ? Date.parse(at) < Date.now() : false;
});

/**
 * Reads the ticket out of the fragment and draws its QR.
 *
 * Runs on every fragment change, not just on load: opening a second ticket
 * link in the same tab — two guests sharing one phone — changes only the
 * fragment, which does not reload the page. Reading it once would leave the
 * first guest's QR on screen under the second guest's link.
 */
let loads = 0;

async function load(): Promise<void> {
  const current = ++loads;
  const opened = parseTicketHash(window.location.hash);
  qr.value = null;
  ticket.value = opened;
  broken.value = opened === null;
  if (!opened) return;
  document.title = `${opened.payload.guestName} · ${opened.party || 'Ticket'} · BottleCount`;
  const drawn = await brandedQrDataUrl(opened.signed);
  // A newer fragment may have arrived while this one was drawing. (Compared by
  // counter, not by object: `ticket` holds a reactive proxy, never `opened`.)
  if (current === loads) qr.value = drawn;
}

onMounted(() => {
  window.addEventListener('hashchange', load);
  void load();
});
onBeforeUnmount(() => window.removeEventListener('hashchange', load));

/** Saves the same ticket card the host can send, for a guest with no signal at the door. */
async function saveImage(): Promise<void> {
  const t = ticket.value;
  if (!t || !qr.value || saving.value) return;
  saving.value = true;
  try {
    const file = await buildTicketFile({
      partyName: t.party || 'BottleCount',
      dateLabel: new Date(`${t.date}T00:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      }),
      guestName: t.payload.guestName,
      code: t.payload.code,
      qrDataUrl: qr.value,
      grad: cover.value.grad,
      emoji: cover.value.emoji,
    });
    downloadFile(file);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="ticket-page">
    <div v-if="broken" class="ticket-state">
      <h1>This ticket link is incomplete</h1>
      <p>
        Part of it went missing on the way — some chat apps cut long links
        short. Ask the host to send your ticket again.
      </p>
      <a class="ticket-secondary" :href="base">What is BottleCount?</a>
    </div>

    <div v-else-if="!ticket" class="ticket-state">
      <span class="ticket-spinner"><Icon name="ticket" :size="24" /></span>
      <p>Opening your ticket…</p>
    </div>

    <div v-else class="ticket-card">
      <div class="ticket-cover" :style="{ background: cover.grad }">
        <span class="ticket-emoji">{{ cover.emoji }}</span>
        <h1 class="ticket-title">{{ ticket.party || 'Your ticket' }}</h1>
        <p v-if="dateLabel" class="ticket-when">
          {{ dateLabel
          }}<template v-if="ticket.time"> · {{ ticket.time }}</template>
        </p>
      </div>

      <div class="ticket-body">
        <div class="ticket-qr" :class="{ 'ticket-qr--expired': expired }">
          <img
            v-if="qr"
            :src="qr"
            :alt="`Entry QR code for ${ticket.payload.guestName}`"
            width="260"
            height="260"
          />
        </div>

        <div class="ticket-guest">{{ ticket.payload.guestName }}</div>
        <div class="ticket-code" aria-label="Ticket code">
          {{ ticket.payload.code }}
        </div>

        <p v-if="expired" class="ticket-note ticket-note--warn" role="status">
          <Icon name="info" :size="14" />
          This ticket has expired.
        </p>
        <p v-else class="ticket-note">
          Show this at the door. Turn your screen brightness up — and if the QR
          won't scan, read out the code.
        </p>

        <button
          class="ticket-btn"
          type="button"
          :disabled="!qr || saving"
          @click="saveImage"
        >
          <Icon name="download" :size="15" />
          {{ saving ? 'Saving…' : 'Save to my phone' }}
        </button>
      </div>

      <p class="ticket-foot">
        <a :href="base">Planned with BottleCount</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.ticket-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}

.ticket-state {
  max-width: 34ch;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.ticket-state h1 {
  font-family: var(--font-disp);
  font-size: 22px;
  margin: 0;
}
.ticket-state p {
  color: var(--dim);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}
.ticket-spinner {
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

.ticket-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}

.ticket-cover {
  padding: 28px 22px 22px;
  color: #fff;
}
.ticket-emoji {
  font-size: 30px;
  display: block;
  margin-bottom: 10px;
}
.ticket-title {
  font-family: var(--font-disp);
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
  overflow-wrap: anywhere;
}
.ticket-when {
  margin: 6px 0 0;
  font-size: 13px;
  opacity: 0.92;
}

.ticket-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

/* Always white: a QR needs its light background whatever the Theme. */
.ticket-qr {
  width: min(100%, 280px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border-radius: 16px;
  background: #ffffff;
}
.ticket-qr img {
  width: 100%;
  height: auto;
  display: block;
}
.ticket-qr--expired {
  opacity: 0.35;
}

.ticket-guest {
  margin-top: 6px;
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 20px;
  overflow-wrap: anywhere;
}
.ticket-code {
  font-family: ui-monospace, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.ticket-note {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--dim);
  display: flex;
  align-items: center;
  gap: 7px;
}
.ticket-note--warn {
  color: var(--bad);
  font-weight: 600;
}

.ticket-btn {
  margin-top: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  padding: 12px 18px;
  min-height: 44px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-family: inherit;
}
.ticket-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ticket-secondary {
  color: var(--dim);
  font-size: 13px;
}

.ticket-foot {
  margin: 0;
  padding: 0 22px 18px;
  text-align: center;
  font-size: 11px;
}
.ticket-foot a {
  color: var(--faint);
  text-decoration: none;
}
</style>
