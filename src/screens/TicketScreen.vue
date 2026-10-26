<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { coverOf } from '../features/party/covers';
import { downloadFile } from '../lib/download';
import { brandedQrDataUrl, buildTicketFile } from '../lib/drawing';
import type { TicketLinkDTO } from '../../shared/ticketLinks';
import { fetchTicketLink } from '../lib/api/tickets';
import { isNotFound } from '../lib/api/request';
import {
  openTicket,
  parseTicketHash,
  type OpenedTicket,
} from '../features/tickets/ticketLink';
import { ticketSlugFromPath } from '../../shared/urls';
import { shortDate } from '../lib/dates';
import { safeLocal } from '../lib/safeStorage';
import Icon from '../components/ui/Icon.vue';
import TicketCard from '../features/tickets/TicketCard.vue';

/**
 * A guest's ticket, opened from the link the host sent them.
 *
 * Like the invite page it has no account and no server call: everything is in
 * the URL fragment (see `features/tickets/ticketLink.ts`). The QR drawn here is the same
 * signed string the host's ticket carries, so the door scans it exactly as it
 * would the host's copy.
 */

const ticket = ref<OpenedTicket | null>(null);
const qr = ref<string | null>(null);
const broken = ref(false);
/**
 * Why there is no ticket to show. `incomplete` is a fragment link a chat app
 * cut short; `gone` a short link the host took down or that never existed;
 * `offline` a short link that could not be fetched and was never seen here.
 */
const problem = ref<'incomplete' | 'gone' | 'offline'>('incomplete');
const saving = ref(false);

const base = import.meta.env.BASE_URL as string;

const cover = computed(() => coverOf(ticket.value?.cover));

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
  qr.value = null;
  const opened = window.location.hash.includes('t=')
    ? parseTicketHash(window.location.hash)
    : await fromShortLink();
  if (current !== loads) return;
  ticket.value = opened;
  broken.value = opened === null;
  if (!opened) return;
  document.title = `${opened.payload.guestName} · ${opened.party || 'Ticket'} · BottleCount`;
  const drawn = await brandedQrDataUrl(opened.signed);
  // A newer fragment may have arrived while this one was drawing. (Compared by
  // counter, not by object: `ticket` holds a reactive proxy, never `opened`.)
  if (current === loads) qr.value = drawn;
}

/**
 * The short-link half of `load`: the slug in the path, fetched from the server.
 *
 * What it fetched is kept on this phone, so a guest who opened their ticket
 * once can open it again at the door with no signal. A link the server says is
 * gone is forgotten here too — the host took it down for a reason.
 */
async function fromShortLink(): Promise<OpenedTicket | null> {
  problem.value = 'incomplete';
  const slug = ticketSlugFromPath(window.location.pathname, base);
  if (!slug) return null;

  const key = `bc-ticket:${slug}`;
  const result = await fetchTicketLink(slug);
  if (result.ok && result.value) {
    // Private mode: it still opens, just not offline.
    safeLocal.setJSON(key, result.value);
    return openTicket(result.value.signed, result.value);
  }

  if (!result.ok && isNotFound(result.error)) {
    safeLocal.remove(key);
    problem.value = 'gone';
    return null;
  }

  const cached = safeLocal.getJSON(key) as TicketLinkDTO | null;
  if (cached && typeof cached.signed === 'string') {
    return openTicket(cached.signed, cached);
  }
  problem.value = 'offline';
  return null;
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
      dateLabel: shortDate(t.date),
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
      <template v-if="problem === 'gone'">
        <h1>This ticket isn't available</h1>
        <p>
          The host may have taken it back, or the link is wrong. Ask them to
          send your ticket again.
        </p>
      </template>
      <template v-else-if="problem === 'offline'">
        <h1>Couldn't load your ticket</h1>
        <p>
          It needs a connection the first time. Try again with signal — after
          that it opens on this phone without one.
        </p>
      </template>
      <template v-else>
        <h1>This ticket link is incomplete</h1>
        <p>
          Part of it went missing on the way — some chat apps cut long links
          short. Ask the host to send your ticket again.
        </p>
      </template>
      <a class="ticket-secondary" :href="base">What is BottleCount?</a>
    </div>

    <div v-else-if="!ticket" class="ticket-state">
      <span class="ticket-spinner"><Icon name="ticket" :size="24" /></span>
      <p>Opening your ticket…</p>
    </div>

    <!-- Shared with the planner's preview, so a host sees what a guest gets. -->
    <TicketCard
      v-else
      :party="ticket.party"
      :date="ticket.date"
      :time="ticket.time ?? ''"
      :cover="ticket.cover"
      :guest-name="ticket.payload.guestName"
      :code="ticket.payload.code"
      :qr="qr"
      :expired="expired"
    >
      <button
        class="ticket-btn"
        type="button"
        :disabled="!qr || saving"
        @click="saveImage"
      >
        <Icon name="download" :size="15" />
        {{ saving ? 'Saving…' : 'Save to my phone' }}
      </button>
    </TicketCard>
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
</style>
