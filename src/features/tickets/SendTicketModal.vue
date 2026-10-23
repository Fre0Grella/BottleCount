<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore } from '../../store/store';
import { coverOf } from '../party/covers';
import { findInvite, ticketCode } from './ticket';
import { shortDate } from '../../lib/dates';
import {
  signedTicketLink,
  ticketEmailSubject,
  ticketMessage,
} from './ticketMessage';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import ShareChannels from '../sharing/ShareChannels.vue';

const store = useStore();

/** The guest's own ticket page — '' until the ticket has been signed. */
const ticketLink = ref('');
/** Signing failed, so there is no ticket to send — say so rather than wait. */
const prepareFailed = ref(false);

const party = computed(() => store.activeParty());
/** The guest being sent to, for the email and phone they left. */
const guest = computed(() => {
  const p = party.value;
  const id = store.state.sendTicketFor;
  return (p && id !== null && findInvite(p, id)) || null;
});
const guestName = computed(() => guest.value?.name ?? '');

const cover = computed(() => coverOf(party.value?.cover));

const partyDateShort = computed(() =>
  party.value ? shortDate(party.value.date) : '',
);

const code = computed(() => {
  const p = party.value;
  const g = guest.value;
  return p && g ? ticketCode(p, g.id) : '';
});

const initial = computed(() => guestName.value.charAt(0).toUpperCase());

/** The words sent with the ticket — see `ticketMessage.ts`. */
const shareText = computed(() => {
  const p = party.value;
  if (!p || !ticketLink.value) return '';
  return ticketMessage(p, guestName.value, ticketLink.value);
});

const qrFileName = computed(
  () => `ticket-${guestName.value.replace(/[^\w-]+/g, '-').toLowerCase()}.png`,
);

/** Signs the guest's ticket and builds the link that carries it. */
async function prepare(): Promise<void> {
  const p = party.value;
  const id = guest.value?.id;
  if (!p || id === undefined) return;
  try {
    ticketLink.value = await signedTicketLink(p, id);
  } catch {
    prepareFailed.value = true;
  }
}

watch(
  () => store.state.sendTicketFor,
  (val) => {
    ticketLink.value = '';
    prepareFailed.value = false;
    if (val !== null) void prepare();
  },
  { immediate: true },
);

/** The ticket QR itself, full screen — what the door scans. Not a share. */
function showQR(): void {
  const id = guest.value?.id;
  store.closeSendTicket();
  if (id !== undefined) store.openTicket(id);
}

function handleClose(): void {
  store.closeSendTicket();
}

/** Off to the contact sheet, for a guest with nothing to send to yet. */
function addContact(): void {
  const id = guest.value?.id;
  store.closeSendTicket();
  if (id !== undefined) store.openGuestContact(id);
}
</script>

<template>
  <ModalShell
    :open="store.state.sendTicketFor !== null"
    variant="sheet"
    size="md"
    icon="ticket"
    title="Send ticket"
    @close="handleClose"
  >
    <!-- Ticket preview card -->
    <div class="send__card">
      <!-- Cover banner -->
      <div class="send__cover" :style="{ background: cover.grad }">
        <span class="send__emoji">{{ cover.emoji }}</span>
      </div>

      <!-- Guest row -->
      <div class="send__guest">
        <!-- Avatar -->
        <span class="send__avatar">
          {{ initial }}
        </span>
        <div class="send__who">
          <div class="send__name">
            {{ guestName }}
          </div>
          <div class="send__meta">
            {{ party?.name ?? '' }} · {{ partyDateShort }} · admits one
          </div>
        </div>
        <span class="send__qr-mark">
          <Icon name="qr" :size="18" />
        </span>
      </div>

      <!-- Ticket ID row -->
      <div class="send__code">
        {{ code }}
      </div>
    </div>

    <p v-if="prepareFailed" role="alert" class="send__failed">
      <Icon name="info" :size="14" />
      Couldn't create this ticket, so there's no link to send.
    </p>

    <!--
      Every channel sends the ticket link. The component's own QR option is
      off: a QR of the link beside "Show QR" — the ticket QR the door scans —
      would be two QRs that look alike and do different things.
    -->
    <!-- Who WhatsApp and Email will open on, so the tap needs no typing. -->
    <p v-if="guest?.email || guest?.phone" data-test="send-to" class="send__to">
      Opens already addressed to {{ guestName }}:
      {{ [guest.phone, guest.email].filter(Boolean).join(' · ') }}
    </p>
    <p v-else-if="guest" class="send__to send__to--none">
      No email or phone saved for {{ guestName }}, so you'll pick the chat
      yourself.
      <button
        v-if="guest.source === 'manual'"
        type="button"
        class="send__add"
        @click="addContact"
      >
        Add one
      </button>
    </p>

    <ShareChannels
      :link="ticketLink"
      :message="shareText"
      :email-subject="ticketEmailSubject(party)"
      :share-title="`Ticket — ${party?.name ?? ''}`"
      :qr-file-name="qrFileName"
      :sent-note="` for ${guestName}.`"
      label="Send via"
      :show-qr="false"
      :email="guest?.email ?? null"
      :phone="guest?.phone ?? null"
    />

    <button type="button" class="send__show-qr" @click="showQR">
      <Icon name="qr" :size="15" />
      Show the ticket QR here instead
    </button>
  </ModalShell>
</template>

<style scoped>
.send__card {
  border-radius: var(--rs);
  overflow: hidden;
  border: 1px solid var(--border);
  margin-bottom: 16px;
}

.send__cover {
  position: relative;
  height: 70px;
  display: flex;
  align-items: flex-end;
  padding: 10px;
}

.send__emoji {
  font-size: 24px;
}

.send__guest {
  padding: 12px 14px;
  background: var(--surface2);
  display: flex;
  align-items: center;
  gap: 11px;
}

.send__avatar {
  display: flex;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
}

.send__who {
  min-width: 0;
  flex: 1;
}

.send__name {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 15px;
}

.send__meta {
  font-size: 11px;
  color: var(--dim);
}

.send__qr-mark {
  display: flex;
  color: var(--accent);
}

.send__code {
  padding: 8px 14px;
  background: var(--surface2);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--faint);
  font-family: var(--font-mono);
}

.send__failed {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: var(--bad);
  display: flex;
  align-items: center;
  gap: 7px;
}

.send__to {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--dim);
}
.send__to--none {
  color: var(--faint);
}

.send__add {
  cursor: pointer;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}

.send__show-qr {
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  padding: 12px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-family: inherit;
}
</style>
