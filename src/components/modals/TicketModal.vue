<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore } from '../../lib/store';
import { signTicket } from '../../lib/crypto';
import { brandedQrDataUrl } from '../../lib/drawing';
import {
  findInvite,
  ticketCode,
  ticketPayload,
  ticketExpiryLabel,
} from '../../lib/ticket';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const qrDataUrl = ref<string | null>(null);
const qrLoading = ref(false);

const party = computed(() => store.activeParty());
const inviteId = computed(() => store.state.ticketFor);
const guestName = computed(() => {
  const p = party.value;
  const id = inviteId.value;
  return (p && id !== null && findInvite(p, id)?.name) || '';
});

const ticketId = computed(() => {
  const p = party.value;
  const id = inviteId.value;
  return p && id !== null ? ticketCode(p, id) : '';
});

const ticketExpiry = computed(() => {
  const p = party.value;
  if (!p) return '';
  return ticketExpiryLabel(p);
});

async function generateQR(id: number) {
  const p = party.value;
  const payload = p ? ticketPayload(p, id) : null;
  if (!p || !payload) {
    qrDataUrl.value = null;
    return;
  }

  qrLoading.value = true;
  qrDataUrl.value = null;

  try {
    qrDataUrl.value = await brandedQrDataUrl(await signTicket(p, payload));
  } catch {
    qrDataUrl.value = null;
  } finally {
    qrLoading.value = false;
  }
}

// Re-generate QR whenever the modal opens with a new guest
watch(
  () => store.state.ticketFor,
  (id) => {
    if (id !== null) {
      void generateQR(id);
    } else {
      qrDataUrl.value = null;
      qrLoading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    :open="store.state.ticketFor !== null"
    variant="center"
    max-width="320px"
    @close="store.closeTicket()"
  >
    <div
      style="
        padding: 26px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      "
    >
      <!-- Party name -->
      <div
        style="
          font-size: 11px;
          color: var(--faint);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 700;
        "
      >
        {{ party?.name ?? '' }}
      </div>

      <!-- Guest name -->
      <div
        style="
          font-family: var(--font-disp);
          font-weight: 700;
          font-size: 20px;
          letter-spacing: -0.01em;
        "
      >
        {{ guestName }}
      </div>

      <!-- QR code area -->
      <div
        style="
          margin: 12px 0;
          padding: 12px;
          background: #fff;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 220px;
          height: 220px;
        "
      >
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="Ticket QR code"
          width="196"
          height="196"
          style="display: block; border-radius: 4px"
        />
        <!-- Loading / placeholder spinner -->
        <div
          v-else
          style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: var(--dim);
          "
        >
          <Icon v-if="qrLoading" name="loader" :size="32" class="bc-spin" />
          <Icon v-else name="qr" :size="32" />
        </div>
      </div>

      <!-- Ticket ID -->
      <div
        style="
          font-size: 11px;
          color: var(--dim);
          font-family: var(--font-mono);
        "
      >
        {{ ticketId }}
      </div>

      <!-- Expiry -->
      <div style="font-size: 11px; color: var(--faint)">
        valid until {{ ticketExpiry }}
      </div>

      <!-- Done button -->
      <button
        style="
          margin-top: 12px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          padding: 10px 26px;
          border-radius: 999px;
          border: none;
          background: var(--accent);
          color: var(--on-accent);
          min-height: 40px;
        "
        @click="store.closeTicket()"
      >
        Done
      </button>
    </div>
  </Modal>
</template>
