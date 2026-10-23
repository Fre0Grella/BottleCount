<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import QrScanner from 'qr-scanner';
import { useStore } from '../../store/store';
import { verifyTicket } from './crypto';
import { checkTicket } from './ticket';
import { formatClockTime } from '../../lib/dates';
import type { DoorEntry, DoorVerdict } from './ticket';
import Icon from '../../components/ui/Icon.vue';

const store = useStore();

// ── QR scanner instance ───────────────────────────────────────────────────
const videoRef = ref<HTMLVideoElement | null>(null);
let scanner: QrScanner | null = null;
let lastScanTime = 0;

// ── Helpers ───────────────────────────────────────────────────────────────
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

// ── Admitting a guest ──────────────────────────────────────────────────────

/**
 * Asks the ticket rules (`checkTicket`) and lets the guest in, or says why
 * not. Shared by the camera and the typed-code path.
 */
async function admit(entry: DoorEntry): Promise<DoorVerdict | null> {
  const party = store.activeParty();
  if (!party) return null;

  const verdict = checkTicket(party, entry);
  if (!verdict.ok) {
    reject(entry, verdict);
    return verdict;
  }

  const { invite } = verdict;
  // ISO, like the server's: `formatClockTime` prints it, and the merge with
  // the funnel compares like with like.
  const result = await store.checkInGuest(invite.id, new Date().toISOString());
  if (!result.ok) {
    // The other phone on the door got there first. This is the case a
    // device-local tally could never catch.
    reject(entry, {
      ok: false,
      reason: 'already_used',
      invite: { ...invite, usedAt: result.alreadyAt ?? undefined },
    });
    return verdict;
  }

  store.state.scanResult = { ok: true, name: invite.name };
  pushHistory(invite.name, nowHHMMSS());
  navigator.vibrate?.([90, 40, 90]);
  scheduleClear();
  return verdict;
}

/** What the door screen says for each way a ticket is refused. */
function rejection(
  entry: DoorEntry,
  verdict: Extract<DoorVerdict, { ok: false }>,
): { name: string; sub: string } {
  const who = verdict.invite?.name ?? (verdict.guestName || 'Unknown guest');
  switch (verdict.reason) {
    case 'malformed':
      return entry.kind === 'scan'
        ? {
            name: 'Forged or invalid ticket',
            sub: "That QR isn't a BottleCount ticket",
          }
        : {
            name: 'Invalid code',
            sub: 'A ticket code is five letters and numbers',
          };
    case 'bad_signature':
      return {
        name: 'Forged or invalid ticket',
        sub: 'Signature check failed — this ticket may be counterfeit',
      };
    case 'wrong_party':
      return { name: who, sub: 'Ticket is for another party' };
    case 'expired':
      return { name: who, sub: 'This ticket has expired' };
    case 'unknown_code':
      return entry.kind === 'scan'
        ? { name: who, sub: 'Not found on the confirmed guest list' }
        : {
            name: 'Unknown code',
            sub: 'No ticket on this party has that code',
          };
    case 'name_missing':
      return {
        name: 'Name needed',
        sub: "Type the guest's name as well as the code",
      };
    case 'name_mismatch':
      // Without naming them — that would hand a stranger a real guest's name.
      return {
        name: 'Name does not match',
        sub: 'That code belongs to a different guest',
      };
    case 'not_coming':
      return { name: who, sub: "They haven't confirmed they're coming" };
    case 'unpaid':
      return {
        name: who,
        sub: "Hasn't paid yet — mark them paid, then check again",
      };
    case 'already_used':
      return {
        name: who,
        sub: `Already scanned at ${formatClockTime(verdict.invite?.usedAt) || '?'} — do not let in again`,
      };
  }
}

function reject(
  entry: DoorEntry,
  verdict: Extract<DoorVerdict, { ok: false }>,
): void {
  store.state.scanResult = { ok: false, ...rejection(entry, verdict) };
  navigator.vibrate?.(300);
  scheduleClear();
}

// ── Real scan callback ─────────────────────────────────────────────────────
async function onScanResult(result: { data: string }): Promise<void> {
  const now = Date.now();
  if (now - lastScanTime < 2000) return;
  lastScanTime = now;

  const party = store.activeParty();
  if (!party) return;

  await admit({ kind: 'scan', check: await verifyTicket(party, result.data) });
}

// ── Typed code ─────────────────────────────────────────────────────────────

/**
 * Checking a ticket by hand, when the QR will not scan or a guest has only the
 * code from their message. The code and the guest's name, both.
 */
const manualCode = ref('');
const manualName = ref('');
const manualBusy = ref(false);

async function verifyManually(): Promise<void> {
  manualBusy.value = true;
  const verdict = await admit({
    kind: 'typed',
    code: manualCode.value,
    name: manualName.value,
  });
  // Cleared once the ticket named a guest, whatever the door then said.
  if (verdict && (verdict.ok || verdict.invite)) {
    manualCode.value = '';
    manualName.value = '';
  }
  manualBusy.value = false;
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
    (i) => i.status === 'confirmed',
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

      <!-- Check a ticket by hand -->
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
            margin-bottom: 4px;
          "
        >
          Check by code
        </div>
        <div style="font-size: 12px; color: #5b6a8a; margin-bottom: 9px">
          When the QR won't scan. Both the code and the name have to match.
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 8px">
          <input
            v-model="manualCode"
            type="text"
            inputmode="latin"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="7"
            placeholder="AB23C"
            style="
              width: 40%;
              box-sizing: border-box;
              padding: 10px 12px;
              border-radius: 10px;
              border: 1px solid rgba(255, 255, 255, 0.16);
              background: rgba(255, 255, 255, 0.06);
              color: #f2f5fa;
              font-size: 15px;
              font-family: monospace;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              outline: none;
            "
          />
          <input
            v-model="manualName"
            type="text"
            placeholder="Guest's name"
            style="
              flex: 1;
              min-width: 0;
              box-sizing: border-box;
              padding: 10px 12px;
              border-radius: 10px;
              border: 1px solid rgba(255, 255, 255, 0.16);
              background: rgba(255, 255, 255, 0.06);
              color: #f2f5fa;
              font-size: 14px;
              outline: none;
            "
            @keyup.enter="verifyManually"
          />
        </div>

        <button
          :disabled="manualBusy || !manualCode.trim() || !manualName.trim()"
          style="
            width: 100%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 14px;
            font-weight: 700;
            padding: 12px 16px;
            border-radius: 999px;
            border: none;
            background: #ff7a3d;
            color: #17202e;
            min-height: 44px;
          "
          :style="{
            opacity:
              manualBusy || !manualCode.trim() || !manualName.trim() ? 0.5 : 1,
          }"
          @click="verifyManually"
        >
          <Icon name="check" :size="15" />
          {{ manualBusy ? 'Checking…' : 'Let them in' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
