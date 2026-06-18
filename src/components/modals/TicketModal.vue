<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useStore } from '../../lib/store';
import { signTicket } from '../../lib/crypto';
import type { TicketQRPayload } from '../../lib/types';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const qrDataUrl = ref<string | null>(null);
const qrLoading = ref(false);

const party = computed(() => store.activeParty());
const guestName = computed(() => store.state.ticketFor ?? '');

/** FNV-1a 32-bit hash for stable ticket id fallback */
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

const ticketExpiry = computed(() => {
  const p = party.value;
  if (!p) return '';
  const exp = new Date(p.date + 'T12:00');
  exp.setDate(exp.getDate() + 1);
  return (
    exp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' 06:00'
  );
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
    // Find invite by name to get its id; fall back to hash-based id
    const invite = p.invites.find((i) => i.name === name);
    const h = fnv1a(name + '·' + String(p.id));
    const ticketIdNum = invite?.id ?? h % 100000;

    // Build expiry: party date +1 day at 06:00
    const expDate = new Date(p.date + 'T06:00:00');
    expDate.setDate(expDate.getDate() + 1);

    const payload: TicketQRPayload = {
      ticketId: ticketIdNum,
      partyId: p.id!,
      guestName: name,
      expiresAt: expDate.toISOString(),
    };

    const signed = await signTicket(payload);
    qrDataUrl.value = await QRCode.toDataURL(signed, {
      margin: 1,
      width: 220,
    });
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
