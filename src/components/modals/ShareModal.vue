<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore, COVERS } from '../../lib/store';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const sent = ref(false);

const party = computed(() => store.activeParty());

const cover = computed(() => {
  const p = party.value;
  if (!p) return COVERS[0];
  return COVERS[p.cover] ?? COVERS[0];
});

const inviteLink = computed(() => {
  const p = party.value;
  if (!p) return '';
  const slug =
    p.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'party';
  return `bottlecount.app/i/${slug}-${p.id}`;
});

const venueWhere = computed(() => {
  const p = party.value;
  if (!p) return '';
  const parts = [p.venue.place, p.venue.city].filter(Boolean);
  return parts.join(', ') || 'TBD';
});

const partyDateShort = computed(() => {
  const p = party.value;
  if (!p) return '';
  return new Date(p.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
});

const allowForward = computed(() => party.value?.allowForward ?? false);

const shareHint = computed(() =>
  allowForward.value
    ? 'Friends-of-friends will show up in your spread view.'
    : 'Only people you invite directly can RSVP.',
);

interface Channel {
  label: string;
  iconName: string;
  color: string;
  onClick: () => void;
}

const channels: Channel[] = [
  { label: 'Copy link', iconName: 'link', color: 'var(--accent)' },
  { label: 'WhatsApp', iconName: 'message', color: '#25D366' },
  { label: 'Email', iconName: 'mail', color: '#60A5FA' },
  { label: 'Messages', iconName: 'message', color: '#34D399' },
  { label: 'Instagram', iconName: 'instagram', color: '#E1306C' },
  { label: 'QR code', iconName: 'qr', color: '#A78BFA' },
].map((ch) => ({
  ...ch,
  onClick: () => {
    if (ch.label === 'Copy link') {
      const link = `https://${inviteLink.value}`;
      navigator.clipboard?.writeText(link).catch(() => {});
    }
    sent.value = true;
  },
}));

function handleClose() {
  sent.value = false;
  store.closeShare();
}

watch(
  () => store.state.shareOpen,
  (open) => {
    if (!open) sent.value = false;
  },
);
</script>

<template>
  <Modal
    :open="store.state.shareOpen"
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
          <Icon name="share" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Invite to {{ party?.name ?? '' }}
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
        Invite sent — watch the RSVPs roll in
      </div>

      <!-- Preview card -->
      <div
        style="
          border-radius: var(--rs);
          overflow: hidden;
          border: 1px solid var(--border);
          margin-bottom: 16px;
        "
      >
        <div
          style="
            height: 74px;
            display: flex;
            align-items: flex-end;
            padding: 10px;
          "
          :style="{ background: cover.grad }"
        >
          <span style="font-size: 24px">{{ cover.emoji }}</span>
        </div>
        <div style="padding: 12px 14px; background: var(--surface2)">
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 700;
              font-size: 15px;
            "
          >
            {{ party?.name ?? '' }}
          </div>
          <div style="font-size: 12px; color: var(--dim); margin-top: 2px">
            {{ venueWhere }} · {{ partyDateShort }}
          </div>
          <div
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              color: var(--faint);
              margin-top: 8px;
            "
          >
            <Icon name="link" :size="12" />
            {{ inviteLink }}
          </div>
        </div>
      </div>

      <!-- Share via -->
      <div
        style="
          font-size: 12px;
          color: var(--dim);
          font-weight: 600;
          margin-bottom: 9px;
        "
      >
        Share via
      </div>
      <div
        style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          margin-bottom: 16px;
        "
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

      <!-- Allow forward toggle -->
      <div
        style="
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          border-radius: var(--rs);
          background: var(--surface2);
        "
        :style="{
          border: `1px solid ${allowForward ? 'var(--accent)' : 'var(--border)'}`,
        }"
        @click="store.update((p) => (p.allowForward = !p.allowForward))"
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 9px;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          "
          :style="{
            background: allowForward ? 'var(--accent-soft)' : 'var(--track)',
            color: allowForward ? 'var(--accent)' : 'var(--faint)',
          }"
        >
          <Icon name="share" :size="16" />
        </span>
        <div style="flex: 1">
          <div style="font-size: 13px; font-weight: 600">
            Let guests invite friends
          </div>
          <div style="font-size: 11px; color: var(--faint)">
            Your invite gets a "+ bring a friend" button
          </div>
        </div>
        <!-- Toggle switch -->
        <span
          style="
            display: flex;
            align-items: center;
            width: 42px;
            height: 24px;
            border-radius: 999px;
            padding: 3px;
            transition: background 0.2s;
            flex-shrink: 0;
          "
          :style="{
            background: allowForward ? 'var(--accent)' : 'var(--track)',
          }"
        >
          <span
            style="
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #fff;
              transition: transform 0.2s;
            "
            :style="{
              transform: allowForward ? 'translateX(18px)' : 'translateX(0)',
            }"
          />
        </span>
      </div>

      <!-- Footer hint -->
      <div
        style="
          font-size: 11px;
          color: var(--faint);
          text-align: center;
          margin-top: 12px;
        "
      >
        {{ shareHint }}
      </div>
    </div>
  </Modal>
</template>
