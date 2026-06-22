<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore, COVERS } from '../../lib/store';
import {
  ticketCode,
  ticketPayload,
  ticketQrDataUrl,
  buildTicketFile,
  downloadFile,
} from '../../lib/ticket';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const status = ref('');
const working = ref(false);
const ticketFile = ref<File | null>(null);

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

const appUrl =
  typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL + 'app'
    : '';

const shareText = computed(() => {
  const p = party.value;
  if (!p) return '';
  return `🎫 ${guestName.value}, you're on the list for ${p.name} (${partyDateShort.value}). Open your BottleCount ticket: ${appUrl}`;
});

// Pre-build the branded ticket image when the modal opens so the native
// share sheet can be invoked synchronously from the user's tap.
async function prepare(): Promise<void> {
  const p = party.value;
  const name = guestName.value;
  if (!p || !name) {
    ticketFile.value = null;
    return;
  }
  try {
    const qr = await ticketQrDataUrl(ticketPayload(p, name));
    ticketFile.value = await buildTicketFile({
      partyName: p.name,
      dateLabel: partyDateShort.value,
      guestName: name,
      code: code.value,
      qrDataUrl: qr,
      grad: cover.value.grad,
      emoji: cover.value.emoji,
    });
  } catch {
    ticketFile.value = null;
  }
}

watch(
  () => store.state.sendTicketFor,
  (val) => {
    status.value = '';
    working.value = false;
    ticketFile.value = null;
    if (val !== null) void prepare();
  },
  { immediate: true },
);

// ── Send channels ────────────────────────────────────────────────────────────

async function shareNative(): Promise<void> {
  working.value = true;
  try {
    const file = ticketFile.value;
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `Ticket — ${party.value?.name ?? ''}`,
        text: shareText.value,
        files: [file],
      });
      status.value = `Ticket shared with ${guestName.value}`;
    } else if (navigator.share) {
      await navigator.share({
        title: 'BottleCount ticket',
        text: shareText.value,
      });
      status.value = `Invite shared with ${guestName.value}`;
    } else if (file) {
      downloadFile(file);
      status.value = 'Ticket image saved — attach it in your chat';
    }
  } catch {
    /* user cancelled the share sheet */
  } finally {
    working.value = false;
  }
}

function saveImage(): void {
  if (!ticketFile.value) return;
  downloadFile(ticketFile.value);
  status.value = 'Ticket image saved to your device';
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareText.value);
    status.value = 'Invite text copied to clipboard';
  } catch {
    status.value = 'Could not access the clipboard';
  }
}

function openWhatsApp(): void {
  window.open(
    `https://wa.me/?text=${encodeURIComponent(shareText.value)}`,
    '_blank',
    'noopener',
  );
  status.value = `Opening WhatsApp for ${guestName.value}`;
}

function openEmail(): void {
  const subject = `Your ticket — ${party.value?.name ?? 'the party'}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(shareText.value)}`;
  status.value = 'Opening your email app';
}

function showQR(): void {
  const name = guestName.value;
  store.closeSendTicket();
  store.openTicket(name);
}

interface Channel {
  label: string;
  iconName: string;
  color: string;
  onClick: () => void;
}

const channels = computed((): Channel[] => [
  {
    label: 'Share',
    iconName: 'share',
    color: 'var(--accent)',
    onClick: () => void shareNative(),
  },
  {
    label: 'WhatsApp',
    iconName: 'message',
    color: '#25D366',
    onClick: openWhatsApp,
  },
  { label: 'Email', iconName: 'mail', color: '#60A5FA', onClick: openEmail },
  {
    label: 'Copy text',
    iconName: 'link',
    color: '#34D399',
    onClick: () => void copyLink(),
  },
  { label: 'Save image', iconName: 'qr', color: '#A78BFA', onClick: saveImage },
  { label: 'Show QR', iconName: 'qr', color: '#F472B6', onClick: showQR },
]);

function handleClose(): void {
  status.value = '';
  working.value = false;
  ticketFile.value = null;
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

      <!-- Status banner -->
      <div
        v-if="status"
        style="
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 11px 13px;
          border-radius: var(--rs);
          background: var(--good-soft);
          border: 1px solid var(--good);
          color: var(--good);
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 14px;
        "
      >
        <Icon name="check" :size="16" />
        {{ status }}
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

      <!-- Send via -->
      <div
        style="
          font-size: 12px;
          color: var(--dim);
          font-weight: 600;
          margin-bottom: 9px;
        "
      >
        Send via
      </div>
      <div
        style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px"
      >
        <button
          v-for="ch in channels"
          :key="ch.label"
          :disabled="working"
          style="
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 7px;
            padding: 14px 6px;
            border-radius: var(--rs);
            border: 1.5px solid var(--border);
            background: var(--surface2);
            color: var(--text);
          "
          @click="ch.onClick"
        >
          <span
            style="
              display: flex;
              width: 38px;
              height: 38px;
              border-radius: 11px;
              align-items: center;
              justify-content: center;
            "
            :style="{
              background: ch.color + '22',
              color: ch.color,
            }"
          >
            <Icon :name="ch.iconName" :size="18" />
          </span>
          <span style="font-size: 11px; font-weight: 600">{{ ch.label }}</span>
        </button>
      </div>
    </div>
  </Modal>
</template>
