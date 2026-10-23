<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStore } from '../../store/store';
import { signTicket } from './crypto';
import { brandedQrDataUrl } from '../../lib/drawing';
import {
  findInvite,
  ticketCode,
  ticketPayload,
  ticketExpiryLabel,
} from './ticket';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import CloseButton from '../../components/ui/CloseButton.vue';

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
  <ModalShell
    v-slot="{ titleId }"
    :open="store.state.ticketFor !== null"
    variant="center"
    size="xs"
    @close="store.closeTicket()"
  >
    <!-- The centred ticket keeps its own heading; the close sits in the corner. -->
    <CloseButton
      class="ticket__close"
      label="Close ticket"
      @click="store.closeTicket()"
    />
    <div class="ticket">
      <!-- Party name -->
      <div class="ticket__party">
        {{ party?.name ?? '' }}
      </div>

      <!-- Guest name -->
      <div :id="titleId" class="ticket__guest">
        {{ guestName }}
      </div>

      <!-- QR code area -->
      <div class="ticket__qr">
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="Ticket QR code"
          width="196"
          height="196"
          class="ticket__qr-img"
        />
        <!-- Loading / placeholder spinner -->
        <div v-else class="ticket__qr-wait">
          <Icon v-if="qrLoading" name="loader" :size="32" class="bc-spin" />
          <Icon v-else name="qr" :size="32" />
        </div>
      </div>

      <!-- Ticket ID -->
      <div class="ticket__code">
        {{ ticketId }}
      </div>

      <!-- Expiry -->
      <div class="ticket__expiry">valid until {{ ticketExpiry }}</div>

      <!-- Done button -->
      <button class="ticket__done" @click="store.closeTicket()">Done</button>
    </div>
  </ModalShell>
</template>

<style scoped>
.ticket {
  padding: 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.ticket__close {
  position: absolute;
  top: 12px;
  right: 12px;
}

.ticket__party {
  font-size: 11px;
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}

.ticket__guest {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.01em;
}

/* White in both Themes: a QR scans best dark on light. */
.ticket__qr {
  margin: 12px 0;
  padding: 12px;
  background: #fff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
}

.ticket__qr-img {
  display: block;
  border-radius: 4px;
}

.ticket__qr-wait {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--dim);
}

.ticket__code {
  font-size: 11px;
  color: var(--dim);
  font-family: var(--font-mono);
}

.ticket__expiry {
  font-size: 11px;
  color: var(--faint);
}

.ticket__done {
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
}
</style>
