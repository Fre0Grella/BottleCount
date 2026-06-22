<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import QrScanner from 'qr-scanner';
import { useStore } from '../../lib/store';
import { verifyTicket, signTicket } from '../../lib/crypto';
import { ticketPayload } from '../../lib/ticket';
import type { Invite } from '../../lib/types';
import Icon from '../Icon.vue';

const store = useStore();

// ── QR scanner instance ───────────────────────────────────────────────────
const videoRef = ref<HTMLVideoElement | null>(null);
let scanner: QrScanner | null = null;
let lastScanTime = 0;

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
  const now = Date.now();
  if (now - lastScanTime < 2000) return;
  lastScanTime = now;

  const party = store.activeParty();
  if (!party) return;

  const payload = await verifyTicket(result.data);

  if (!payload) {
    store.state.scanResult = {
      ok: false,
      name: 'Forged or invalid ticket',
      sub: 'Signature verification failed — this ticket may be counterfeit',
    };
    navigator.vibrate?.(300);
    scheduleClear();
    return;
  }

  if (payload.partyId !== party.id) {
    store.state.scanResult = {
      ok: false,
      name: payload.guestName ?? 'Unknown guest',
      sub: 'Ticket belongs to a different party',
    };
    navigator.vibrate?.(300);
    scheduleClear();
    return;
  }

  const accepted = party.invites.filter((i) => i.status === 'accepted');

  const alreadyUsed = accepted.find(
    (i) =>
      (i.id === payload.ticketId || i.name === payload.guestName) && i.used,
  );
  if (alreadyUsed) {
    store.state.scanResult = {
      ok: false,
      name: alreadyUsed.name,
      sub: `Already scanned at ${alreadyUsed.usedAt ?? '?'} — do not let in again`,
    };
    navigator.vibrate?.(300);
    scheduleClear();
    return;
  }

  const invite =
    accepted.find((i) => i.id === payload.ticketId && !i.used) ??
    accepted.find((i) => i.name === payload.guestName && !i.used);

  if (invite) {
    const time = nowHHMM();
    store.checkInGuest(invite.id, time);
    store.state.scanResult = { ok: true, name: invite.name };
    pushHistory(invite.name, nowHHMMSS());
    navigator.vibrate?.([90, 40, 90]);
    scheduleClear();
    return;
  }

  store.state.scanResult = {
    ok: false,
    name: payload.guestName ?? 'Unknown guest',
    sub: 'Not found on the accepted guest list',
  };
  navigator.vibrate?.(300);
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

// ── Manual lookup (fallback for visual verification) ───────────────────────
const manualName = ref('');
const manualResult = ref<{ invite: Invite; qrCode: string } | null>(null);
let manualTimer: ReturnType<typeof setTimeout> | null = null;

watch(manualName, (value) => {
  if (manualTimer !== null) clearTimeout(manualTimer);
  const query = value.trim().toLowerCase();
  if (!query) {
    manualResult.value = null;
    return;
  }
  manualTimer = setTimeout(async () => {
    const party = store.activeParty();
    if (!party) {
      manualResult.value = null;
      return;
    }
    const acc = accepted();
    // Best match: exact name first, otherwise closest case-insensitive include.
    const invite =
      acc.find((i) => i.name.toLowerCase() === query) ??
      acc.find((i) => i.name.toLowerCase().includes(query));
    if (!invite) {
      manualResult.value = null;
      return;
    }
    const qrCode = await signTicket(ticketPayload(party, invite.name));
    // Guard against a stale resolve if the input changed meanwhile.
    if (manualName.value.trim().toLowerCase() === query) {
      manualResult.value = { invite, qrCode };
    }
  }, 300);
});

function validateManual(): void {
  const result = manualResult.value;
  if (!result) return;

  // Re-check the live invite — it may have been checked in since the lookup.
  const live = accepted().find((i) => i.id === result.invite.id);
  if (live?.used) {
    store.state.scanResult = {
      ok: false,
      name: live.name,
      sub: `Already scanned at ${live.usedAt ?? '?'} — do not let in again`,
    };
    navigator.vibrate?.(300);
    scheduleClear();
    return;
  }

  const time = nowHHMM();
  store.checkInGuest(result.invite.id, time);
  store.state.scanResult = { ok: true, name: result.invite.name };
  pushHistory(result.invite.name, nowHHMMSS());
  navigator.vibrate?.([90, 40, 90]);
  scheduleClear();
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
          @click="
            () => {
              store.closeDoor();
              stopScanner();
            }
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
              {{ store.state.scanResult.sub ?? 'No pending ticket found' }}
            </div>
          </div>
        </div>

        <!-- Scanning hint -->
        <div
          v-if="!store.state.scanResult"
          style="
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: #8b96ab;
          "
        >
          <Icon name="scan" :size="16" />
          Point a guest's ticket QR at the camera
        </div>
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

      <!-- Manual lookup (fallback) -->
      <div
        style="
          padding: 14px 20px 18px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        "
      >
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
          Manual lookup
        </div>
        <input
          v-model="manualName"
          type="text"
          placeholder="Type a guest's name…"
          style="
            width: 100%;
            box-sizing: border-box;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: rgba(255, 255, 255, 0.06);
            color: #f2f5fa;
            font-size: 14px;
            outline: none;
          "
        />

        <!-- Match found -->
        <div
          v-if="manualResult"
          style="
            margin-top: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          "
        >
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
            "
          >
            <span style="font-weight: 700; font-size: 14px">
              {{ manualResult.invite.name }}
            </span>
            <button
              style="
                cursor: pointer;
                flex-shrink: 0;
                padding: 8px 16px;
                border-radius: 10px;
                border: none;
                background: #34d399;
                color: #06281a;
                font-weight: 700;
                font-size: 13px;
              "
              @click="validateManual"
            >
              Validate
            </button>
          </div>
          <div
            style="
              font-size: 10px;
              color: #5b6a8a;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              font-weight: 700;
            "
          >
            Ticket code (compare with guest's screen)
          </div>
          <pre
            style="
              margin: 0;
              padding: 10px 12px;
              border-radius: 10px;
              background: #03050a;
              border: 1px solid rgba(255, 255, 255, 0.1);
              color: #9fb2d6;
              font-size: 10px;
              line-height: 1.4;
              white-space: pre-wrap;
              word-break: break-all;
              max-height: 120px;
              overflow: auto;
            "
            >{{ manualResult.qrCode }}</pre
          >
        </div>

        <!-- No match -->
        <div
          v-else-if="manualName.trim()"
          style="margin-top: 10px; font-size: 12px; color: #5b6a8a"
        >
          No accepted guest matches that name
        </div>
      </div>
    </div>
  </Teleport>
</template>
