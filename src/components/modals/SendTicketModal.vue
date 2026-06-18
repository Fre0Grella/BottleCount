<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore, COVERS } from '../../lib/store';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const sent = ref(false);

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

/** FNV-1a 32-bit hash — same algorithm as the prototype */
function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const ticketId = computed(() => {
  const p = party.value;
  if (!p || !guestName.value) return '';
  const h = fnv1a(guestName.value + '·' + String(p.id));
  return `BC-${p.id}-${(h % 100000).toString().padStart(5, '0')}`;
});

const initial = computed(() => guestName.value.charAt(0).toUpperCase());

interface Channel {
  label: string;
  iconName: string;
  color: string;
  onClick: () => void;
}

const channels = computed((): Channel[] => {
  const id = ticketId.value.toLowerCase();
  return [
    { label: 'WhatsApp', iconName: 'message', color: '#25D366' },
    { label: 'Email', iconName: 'mail', color: '#60A5FA' },
    { label: 'Messages', iconName: 'message', color: '#34D399' },
    { label: 'Copy link', iconName: 'link', color: 'var(--accent)' },
    { label: 'AirDrop', iconName: 'share', color: '#0EA5E9' },
    { label: 'QR code', iconName: 'qr', color: '#A78BFA' },
  ].map((ch) => ({
    ...ch,
    onClick: () => {
      if (ch.label === 'Copy link') {
        navigator.clipboard
          ?.writeText(`https://bottlecount.app/t/${id}`)
          .catch(() => {});
      }
      sent.value = true;
    },
  }));
});

function handleClose() {
  sent.value = false;
  store.closeSendTicket();
}

watch(
  () => store.state.sendTicketFor,
  (val) => {
    if (val === null) sent.value = false;
  },
);
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

      <!-- Success banner -->
      <div
        v-if="sent"
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
        Ticket sent to {{ guestName }}
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
          {{ ticketId }}
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
