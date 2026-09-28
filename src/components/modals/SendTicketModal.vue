<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore, COVERS } from '../../lib/store';
import { ticketCode, ticketPayload } from '../../lib/ticket';
import { signTicket } from '../../lib/crypto';
import { ticketUrl } from '../../lib/ticketLink';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';
import ShareChannels from '../ShareChannels.vue';

const store = useStore();

/** The guest's own ticket page — '' until the ticket has been signed. */
const ticketLink = ref('');
/** Signing failed, so there is no ticket to send — say so rather than wait. */
const prepareFailed = ref(false);

const party = computed(() => store.activeParty());
const guestName = computed(() => store.state.sendTicketFor ?? '');

const cover = computed(() => {
  const p = party.value;
  if (!p) return COVERS[0];
  return COVERS[p.cover] ?? COVERS[0];
});

const partyDateShort = computed(() => {
  const p = party.value;
  if (!p) return '';
  return new Date(p.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
});

const code = computed(() => {
  const p = party.value;
  if (!p || !guestName.value) return '';
  return ticketCode(p, guestName.value);
});

const initial = computed(() => guestName.value.charAt(0).toUpperCase());

/**
 * The words sent with the ticket. Every channel sends the link — never the
 * ticket image — so a guest gets the same thing however it reached them: a
 * page with their name, their code and a QR the door scans.
 */
const shareText = computed(() => {
  const p = party.value;
  if (!p || !ticketLink.value) return '';
  return `🎫 ${guestName.value}, you're on the list for ${p.name} (${partyDateShort.value}). Your ticket — show the QR at the door: ${ticketLink.value}`;
});

const qrFileName = computed(
  () => `ticket-${guestName.value.replace(/[^\w-]+/g, '-').toLowerCase()}.png`,
);

/** Signs the guest's ticket and builds the link that carries it. */
async function prepare(): Promise<void> {
  const p = party.value;
  const name = guestName.value;
  if (!p || !name) return;
  try {
    const signed = await signTicket(p, ticketPayload(p, name));
    ticketLink.value = ticketUrl(
      window.location.origin,
      import.meta.env.BASE_URL as string,
      signed,
      { party: p.name, date: p.date, cover: p.cover, time: p.venue.time },
    );
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
  const name = guestName.value;
  store.closeSendTicket();
  store.openTicket(name);
}

function handleClose(): void {
  store.closeSendTicket();
}
</script>

<template>
  <Modal
    :open="store.state.sendTicketFor !== null"
    variant="sheet"
    max-width="460px"
    @close="handleClose"
  >
    <div style="padding: 22px">
      <!-- Header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
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
          <Icon name="ticket" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Send ticket
        </div>
        <button
          style="
            margin-left: auto;
            cursor: pointer;
            display: flex;
            width: 32px;
            height: 32px;
            align-items: center;
            justify-content: center;
            border: none;
            background: transparent;
            color: var(--dim);
          "
          @click="handleClose"
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

      <!-- Ticket preview card -->
      <div
        style="
          border-radius: var(--rs);
          overflow: hidden;
          border: 1px solid var(--border);
          margin-bottom: 16px;
        "
      >
        <!-- Cover banner -->
        <div
          style="
            position: relative;
            height: 70px;
            display: flex;
            align-items: flex-end;
            padding: 10px;
          "
          :style="{ background: cover.grad }"
        >
          <span style="font-size: 24px">{{ cover.emoji }}</span>
        </div>

        <!-- Guest row -->
        <div
          style="
            padding: 12px 14px;
            background: var(--surface2);
            display: flex;
            align-items: center;
            gap: 11px;
          "
        >
          <!-- Avatar -->
          <span
            style="
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
            "
          >
            {{ initial }}
          </span>
          <div style="min-width: 0; flex: 1">
            <div
              style="
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 15px;
              "
            >
              {{ guestName }}
            </div>
            <div style="font-size: 11px; color: var(--dim)">
              {{ party?.name ?? '' }} · {{ partyDateShort }} · admits one
            </div>
          </div>
          <span style="display: flex; color: var(--accent)">
            <Icon name="qr" :size="18" />
          </span>
        </div>

        <!-- Ticket ID row -->
        <div
          style="
            padding: 8px 14px;
            background: var(--surface2);
            border-top: 1px solid var(--border);
            font-size: 11px;
            color: var(--faint);
            font-family: var(--font-mono);
          "
        >
          {{ code }}
        </div>
      </div>

      <p
        v-if="prepareFailed"
        role="alert"
        style="
          margin: 0 0 14px;
          font-size: 12.5px;
          color: var(--bad);
          display: flex;
          align-items: center;
          gap: 7px;
        "
      >
        <Icon name="info" :size="14" />
        Couldn't create this ticket, so there's no link to send.
      </p>

      <!--
        Every channel sends the ticket link. The component's own QR option is
        off: a QR of the link beside "Show QR" — the ticket QR the door scans —
        would be two QRs that look alike and do different things.
      -->
      <ShareChannels
        :link="ticketLink"
        :message="shareText"
        :email-subject="`Your ticket — ${party?.name ?? 'the party'}`"
        :share-title="`Ticket — ${party?.name ?? ''}`"
        :qr-file-name="qrFileName"
        :sent-note="` for ${guestName}.`"
        label="Send via"
        :show-qr="false"
      />

      <button
        type="button"
        style="
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
        "
        @click="showQR"
      >
        <Icon name="qr" :size="15" />
        Show the ticket QR here instead
      </button>
    </div>
  </Modal>
</template>
