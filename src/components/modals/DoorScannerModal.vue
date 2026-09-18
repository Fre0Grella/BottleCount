<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import QrScanner from 'qr-scanner';
import { useStore } from '../../lib/store';
import { verifyTicket } from '../../lib/crypto';
import { ticketPartyId } from '../../lib/ticket';
import { isTicketCode, normaliseTicketCode } from '../../../shared/tickets';
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

// ── Admitting a guest ──────────────────────────────────────────────────────

/**
 * Resolves a ticket to a guest and lets them in, or says why not.
 *
 * Shared by the camera and the typed-code path, because they are the same
 * question asked two ways — and a scanner with a dead camera should not take a
 * different route through the rules than one that works.
 */
async function admit(
  invite: Invite | undefined,
  fallbackName: string,
): Promise<void> {
  if (!invite) {
    reject(fallbackName, 'Not found on the confirmed guest list');
    return;
  }

  if (invite.status !== 'confirmed') {
    reject(invite.name, "They haven't confirmed they're coming");
    return;
  }

  if (invite.used) {
    reject(
      invite.name,
      `Already scanned at ${formatSeen(invite.usedAt)} — do not let in again`,
    );
    return;
  }

  const time = nowHHMM();
  const result = await store.checkInGuest(invite.id, time);

  if (!result.ok) {
    // The other phone on the door got there first. This is the case a
    // device-local tally could never catch.
    reject(
      invite.name,
      `Already scanned at ${formatSeen(result.alreadyAt)} — do not let in again`,
    );
    return;
  }

  store.state.scanResult = { ok: true, name: invite.name };
  pushHistory(invite.name, nowHHMMSS());
  navigator.vibrate?.([90, 40, 90]);
  scheduleClear();
}

function reject(name: string, sub: string): void {
  store.state.scanResult = { ok: false, name, sub };
  navigator.vibrate?.(300);
  scheduleClear();
}

/** Check-in times are ISO from the server and HH:MM from this device. */
function formatSeen(value: string | null | undefined): string {
  if (!value) return '?';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** Finds the guest a ticket names, by its code and then by name. */
function findByCode(code: string, name?: string): Invite | undefined {
  const party = store.activeParty();
  if (!party) return undefined;
  return (
    party.invites.find((i) => i.ticketCode === code) ??
    (name ? party.invites.find((i) => i.name === name) : undefined)
  );
}

// ── Real scan callback ─────────────────────────────────────────────────────
async function onScanResult(result: { data: string }): Promise<void> {
  const now = Date.now();
  if (now - lastScanTime < 2000) return;
  lastScanTime = now;

  const party = store.activeParty();
  if (!party) return;

  const check = await verifyTicket(party, result.data);

  if (!check.ok) {
    reject(
      'Forged or invalid ticket',
      check.reason === 'malformed'
        ? "That QR isn't a BottleCount ticket"
        : 'Signature check failed — this ticket may be counterfeit',
    );
    return;
  }

  const { payload } = check;

  if (payload.partyId !== ticketPartyId(party)) {
    reject(payload.guestName || 'Unknown guest', 'Ticket is for another party');
    return;
  }

  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    reject(payload.guestName || 'Unknown guest', 'This ticket has expired');
    return;
  }

  await admit(findByCode(payload.code, payload.guestName), payload.guestName);
}

// ── Typed code ─────────────────────────────────────────────────────────────

const manualCode = ref('');
const manualName = ref('');
const manualBusy = ref(false);

/**
 * Checking a ticket by hand, when the QR will not scan or a guest has only the
 * code from their message.
 *
 * The code alone is not enough: five characters are short, and a guest who
 * over-hears another's could walk in on it. Requiring the name as well means
 * the person at the door is checking something the code does not carry.
 */
async function verifyManually(): Promise<void> {
  const code = normaliseTicketCode(manualCode.value);
  const name = manualName.value.trim();

  if (!isTicketCode(code)) {
    reject('Invalid code', 'A ticket code is five letters and numbers');
    return;
  }
  if (!name) {
    reject('Name needed', "Type the guest's name as well as the code");
    return;
  }

  manualBusy.value = true;
  const invite = findByCode(code);

  if (!invite) {
    reject('Unknown code', 'No ticket on this party has that code');
  } else if (invite.name.trim().toLowerCase() !== name.toLowerCase()) {
    // The code resolved, but to somebody else. Say so without naming them —
    // that would hand a stranger a real guest's name.
    reject('Name does not match', 'That code belongs to a different guest');
  } else {
    await admit(invite, name);
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
