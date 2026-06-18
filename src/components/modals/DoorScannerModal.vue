<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import QrScanner from 'qr-scanner';
import { useStore } from '../../lib/store';
import { verifyTicket } from '../../lib/crypto';
import Icon from '../Icon.vue';

const store = useStore();

// ── QR scanner instance ───────────────────────────────────────────────────
const videoRef = ref<HTMLVideoElement | null>(null);
let scanner: QrScanner | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────
function nowHHMM(): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nowHHMMSS(): string {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function pushHistory(name: string, time: string): void {
  store.state.scanHistory = [{ name, time }, ...store.state.scanHistory].slice(
    0,
    6,
  );
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleClear(): void {
  if (clearTimer !== null) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    store.state.scanResult = null;
    clearTimer = null;
  }, 2000);
}

// ── Real scan callback ─────────────────────────────────────────────────────
async function onScanResult(result: { data: string }): Promise<void> {
  const party = store.activeParty();
  if (!party) return;

  const payload = await verifyTicket(result.data);

  if (payload && payload.partyId === party.id) {
    const accepted = party.invites.filter((i) => i.status === 'accepted');
    const invite =
      accepted.find((i) => i.id === payload.ticketId && !i.used) ??
      accepted.find((i) => i.name === payload.guestName && !i.used);

    if (invite) {
      const time = nowHHMM();
      store.checkInGuest(invite.id, time);
      store.state.scanResult = { ok: true, name: invite.name };
      pushHistory(invite.name, nowHHMMSS());
      scheduleClear();
      return;
    }
  }

  store.state.scanResult = {
    ok: false,
    name: payload?.guestName ?? 'Invalid or already used',
  };
  scheduleClear();
}

// ── Simulate scan ──────────────────────────────────────────────────────────
function onSimScan(): void {
  const party = store.activeParty();
  if (!party) return;

  const pending = party.invites
    .filter((i) => i.status === 'accepted')
    .find((i) => !i.used);

  const time = nowHHMMSS();

  if (pending) {
    store.checkInGuest(pending.id, time.slice(0, 5));
    store.state.scanResult = { ok: true, name: pending.name };
    pushHistory(pending.name, time);
  } else {
    store.state.scanResult = { ok: false, name: 'Everyone’s in' };
  }

  scheduleClear();
}

// ── Camera lifecycle ───────────────────────────────────────────────────────
async function startScanner(): Promise<void> {
  if (!videoRef.value) return;
  try {
    scanner = new QrScanner(videoRef.value, onScanResult, {
      highlightScanRegion: true,
      returnDetailedScanResult: true,
    });
    await scanner.start();
  } catch {
    // Camera denied or unavailable — degrade gracefully, show frame only
    scanner = null;
  }
}

function stopScanner(): void {
  if (scanner) {
    scanner.stop();
    scanner.destroy();
    scanner = null;
  }
}

watch(
  () => store.state.doorOpen,
  (open) => {
    if (open) {
      // Wait one tick for <video> to mount inside Teleport
      setTimeout(startScanner, 80);
    } else {
      stopScanner();
    }
  },
);

onUnmounted(stopScanner);

// ── Derived stats ──────────────────────────────────────────────────────────
function accepted() {
  return (store.activeParty()?.invites ?? []).filter(
    (i) => i.status === 'accepted',
  );
}

function checkedIn() {
  return accepted().filter((i) => i.used).length;
}

function doorStats() {
  const acc = accepted();
  return `${checkedIn()}/${acc.length} inside`;
}

function partyName() {
  return store.activeParty()?.name ?? '';
}

function recentHistory() {
  return store.state.scanHistory.slice(0, 4);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="store.state.doorOpen"
      style="
        position: fixed;
        inset: 0;
        z-index: 60;
        background: #07090e;
        color: #f2f5fa;
        display: flex;
        flex-direction: column;
        animation: bcPop 0.2s ease both;
      "
    >
      <!-- Header -->
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
        "
      >
        <div>
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 700;
              font-size: 17px;
            "
          >
            Door scanner
          </div>
          <div style="font-size: 11px; color: #8b96ab">
            {{ partyName() }} &middot; {{ doorStats() }}
          </div>
        </div>
        <button
          @click="
            () => {
              store.closeDoor();
              stopScanner();
            }
          "
          style="
            cursor: pointer;
            display: flex;
            width: 38px;
            height: 38px;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            border: 1px solid rgba(255, 255, 255, 0.18);
            background: transparent;
            color: #f2f5fa;
          "
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

      <!-- Main content -->
      <div
        style="
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          padding: 20px;
        "
      >
        <!-- Scan frame -->
        <div
          style="
            position: relative;
            width: min(240px, 60vw);
            aspect-ratio: 1;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            overflow: hidden;
          "
        >
          <!-- Video element for real camera -->
          <video
            ref="videoRef"
            style="
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              object-fit: cover;
              border-radius: 18px;
            "
            muted
            playsinline
          />

          <!-- Corner brackets (rendered on top of video) -->
          <div
            style="
              position: absolute;
              top: -2px;
              left: -2px;
              width: 34px;
              height: 34px;
              border-top: 3px solid var(--accent);
              border-left: 3px solid var(--accent);
              border-top-left-radius: 18px;
              pointer-events: none;
              z-index: 2;
            "
          />
          <div
            style="
              position: absolute;
              top: -2px;
              right: -2px;
              width: 34px;
              height: 34px;
              border-top: 3px solid var(--accent);
              border-right: 3px solid var(--accent);
              border-top-right-radius: 18px;
              pointer-events: none;
              z-index: 2;
            "
          />
          <div
            style="
              position: absolute;
              bottom: -2px;
              left: -2px;
              width: 34px;
              height: 34px;
              border-bottom: 3px solid var(--accent);
              border-left: 3px solid var(--accent);
              border-bottom-left-radius: 18px;
              pointer-events: none;
              z-index: 2;
            "
          />
          <div
            style="
              position: absolute;
              bottom: -2px;
              right: -2px;
              width: 34px;
              height: 34px;
              border-bottom: 3px solid var(--accent);
              border-right: 3px solid var(--accent);
              border-bottom-right-radius: 18px;
              pointer-events: none;
              z-index: 2;
            "
          />

          <!-- Animated scan line -->
          <div
            style="
              position: absolute;
              left: 8%;
              right: 8%;
              height: 2px;
              background: var(--accent);
              box-shadow: 0 0 14px var(--accent);
              animation: bcScan 2.6s ease-in-out infinite;
              pointer-events: none;
              z-index: 3;
            "
          />
        </div>

        <!-- Scan result: OK -->
        <div
          v-if="store.state.scanResult?.ok === true"
          style="
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(52, 211, 153, 0.12);
            border: 1px solid rgba(52, 211, 153, 0.4);
            border-radius: 14px;
            padding: 14px 20px;
            animation: bcPop 0.25s ease both;
          "
        >
          <span
            style="
              display: flex;
              width: 34px;
              height: 34px;
              flex-shrink: 0;
              border-radius: 50%;
              background: #34d399;
              color: #06281a;
              align-items: center;
              justify-content: center;
            "
          >
            <Icon name="check" :size="16" />
          </span>
          <div>
            <div style="font-weight: 700; font-size: 15px">
              {{ store.state.scanResult.name }}
            </div>
            <div style="font-size: 12px; color: #7fcbaa">
              Ticket valid &mdash; welcome in
            </div>
          </div>
        </div>

        <!-- Scan result: FAIL -->
        <div
          v-else-if="store.state.scanResult?.ok === false"
          style="
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(248, 113, 113, 0.12);
            border: 1px solid rgba(248, 113, 113, 0.4);
            border-radius: 14px;
            padding: 14px 20px;
            animation: bcPop 0.25s ease both;
          "
        >
          <span
            style="
              display: flex;
              width: 34px;
              height: 34px;
              flex-shrink: 0;
              border-radius: 50%;
              background: #f87171;
              color: #2b0808;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 18px;
            "
          >
            !
          </span>
          <div>
            <div style="font-weight: 700; font-size: 15px">
              {{ store.state.scanResult.name }}
            </div>
            <div style="font-size: 12px; color: #e89b9b">
              No pending ticket found
            </div>
          </div>
        </div>

        <!-- Simulate scan button -->
        <button
          @click="onSimScan"
          style="
            cursor: pointer;
            font-size: 14px;
            font-weight: 700;
            padding: 14px 30px;
            border-radius: 999px;
            border: none;
            background: var(--accent);
            color: var(--on-accent);
            min-height: 48px;
          "
        >
          Simulate scan
        </button>
      </div>

      <!-- Recent check-ins -->
      <div style="padding: 0 20px 22px 20px">
        <div
          style="
            font-size: 10px;
            color: #5b6a8a;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 700;
            margin-bottom: 8px;
          "
        >
          Recent check-ins
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px">
          <div
            v-for="h in recentHistory()"
            :key="h.name + h.time"
            style="
              display: flex;
              justify-content: space-between;
              font-size: 13px;
            "
          >
            <span style="color: #c9d3e6">{{ h.name }}</span>
            <span style="color: #5b6a8a; font-size: 12px">{{ h.time }}</span>
          </div>
          <div
            v-if="recentHistory().length === 0"
            style="font-size: 13px; color: #5b6a8a"
          >
            No check-ins yet
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
