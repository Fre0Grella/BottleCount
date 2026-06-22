<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore } from '../../lib/store';
import {
  ticketCode,
  ticketPayload,
  ticketExpiryLabel,
  ticketQrDataUrl,
} from '../../lib/ticket';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const qrDataUrl = ref<string | null>(null);
const qrLoading = ref(false);

const party = computed(() => store.activeParty());
const guestName = computed(() => store.state.ticketFor ?? '');

const ticketId = computed(() => {
  const p = party.value;
  if (!p || !guestName.value) return '';
  return ticketCode(p, guestName.value);
});

const ticketExpiry = computed(() => {
  const p = party.value;
  if (!p) return '';
  return ticketExpiryLabel(p);
});

async function generateQR(name: string) {
  const p = party.value;
  if (!p || !name) {
    qrDataUrl.value = null;
    return;
  }

  qrLoading.value = true;
  qrDataUrl.value = null;

  try {
    qrDataUrl.value = await ticketQrDataUrl(ticketPayload(p, name));
  } catch {
    qrDataUrl.value = null;
  } finally {
    qrLoading.value = false;
  }
}

// Re-generate QR whenever the modal opens with a new guest
watch(
  () => store.state.ticketFor,
  (name) => {
    if (name) {
      void generateQR(name);
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
          <svg
            v-if="qrLoading"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="animation: bc-spin 0.8s linear infinite"
          >
            <path
              d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
            />
          </svg>
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

<style scoped>
@keyframes bc-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
