<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import QrScanner from 'qr-scanner';
import { useStore } from '../../store/store';
import { verifyTicket } from './crypto';
import { checkTicket } from './ticket';
import { doorTally, rejection } from './door';
import type { DoorEntry, DoorVerdict } from './ticket';
import Icon from '../../components/ui/Icon.vue';
import ModalShell from '../../components/ui/ModalShell.vue';

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

  store.showScanResult({ ok: true, name: invite.name });
  store.recordCheckIn(invite.name, nowHHMMSS());
  navigator.vibrate?.([90, 40, 90]);
  return verdict;
}

function reject(
  entry: DoorEntry,
  verdict: Extract<DoorVerdict, { ok: false }>,
): void {
  store.showScanResult({ ok: false, ...rejection(entry, verdict) });
  navigator.vibrate?.(300);
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
      // Wait one tick for <video> to mount inside the dialog
      setTimeout(startScanner, 80);
    } else {
      stopScanner();
    }
  },
);

onUnmounted(stopScanner);

function closeDoor(): void {
  store.closeDoor();
  stopScanner();
}

// ── Derived stats ──────────────────────────────────────────────────────────
const tally = computed(() => doorTally(store.activeParty()));
const partyName = computed(() => store.activeParty()?.name ?? '');
const recentHistory = computed(() => store.state.scanHistory.slice(0, 4));
const canCheck = computed(
  () =>
    !manualBusy.value && !!manualCode.value.trim() && !!manualName.value.trim(),
);
</script>

<template>
  <ModalShell
    v-slot="{ titleId }"
    :open="store.state.doorOpen"
    variant="full"
    @close="closeDoor"
  >
    <!-- Always dark: `bc-door` brings its own palette (theme.css). -->
    <div class="bc-door door">
      <!-- Header -->
      <div class="door__head">
        <div>
          <div :id="titleId" class="door__title">Door scanner</div>
          <div class="door__stats">
            {{ partyName }} &middot; {{ tally.inside }}/{{ tally.confirmed }}
            inside
          </div>
        </div>
        <button
          class="door__close"
          aria-label="Close door scanner"
          @click="closeDoor"
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

      <!-- Main content -->
      <div class="door__main">
        <!-- Scan frame -->
        <div class="door__frame">
          <!-- Video element for real camera -->
          <video ref="videoRef" class="door__video" muted playsinline />

          <!-- Corner brackets (rendered on top of video) -->
          <div class="door__corner door__corner--tl" />
          <div class="door__corner door__corner--tr" />
          <div class="door__corner door__corner--bl" />
          <div class="door__corner door__corner--br" />

          <!-- Animated scan line -->
          <div class="door__scanline" />
        </div>

        <!-- Scan result: OK -->
        <div
          v-if="store.state.scanResult?.ok === true"
          class="door__result door__result--ok"
        >
          <span class="door__badge">
            <Icon name="check" :size="16" />
          </span>
          <div>
            <div class="door__result-name">
              {{ store.state.scanResult.name }}
            </div>
            <div class="door__result-sub">Ticket valid &mdash; welcome in</div>
          </div>
        </div>

        <!-- Scan result: FAIL -->
        <div
          v-else-if="store.state.scanResult?.ok === false"
          class="door__result door__result--bad"
        >
          <span class="door__badge">!</span>
          <div>
            <div class="door__result-name">
              {{ store.state.scanResult.name }}
            </div>
            <div class="door__result-sub">
              {{ store.state.scanResult.sub ?? 'No pending ticket found' }}
            </div>
          </div>
        </div>

        <!-- Scanning hint -->
        <div v-if="!store.state.scanResult" class="door__hint">
          <Icon name="scan" :size="16" />
          Point a guest's ticket QR at the camera
        </div>
      </div>

      <!-- Recent check-ins -->
      <div class="door__recent">
        <div class="door__label door__label--recent">Recent check-ins</div>
        <div class="door__history">
          <div
            v-for="h in recentHistory"
            :key="h.name + h.time"
            class="door__history-row"
          >
            <span class="door__history-name">{{ h.name }}</span>
            <span class="door__history-time">{{ h.time }}</span>
          </div>
          <div v-if="recentHistory.length === 0" class="door__empty">
            No check-ins yet
          </div>
        </div>
      </div>

      <!-- Check a ticket by hand -->
      <div class="door__manual">
        <div class="door__label">Check by code</div>
        <div class="door__manual-hint">
          When the QR won't scan. Both the code and the name have to match.
        </div>

        <div class="door__fields">
          <input
            v-model="manualCode"
            type="text"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="7"
            placeholder="AB23C"
            aria-label="Ticket code"
            class="door__field door__field--code"
          />
          <input
            v-model="manualName"
            type="text"
            placeholder="Guest's name"
            aria-label="Guest's name"
            class="door__field door__field--name"
            @keyup.enter="verifyManually"
          />
        </div>

        <button
          :disabled="!canCheck"
          class="door__check"
          @click="verifyManually"
        >
          <Icon name="check" :size="15" />
          {{ manualBusy ? 'Checking…' : 'Let them in' }}
        </button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.door {
  flex: 1;
  background: var(--door-bg);
  color: var(--door-text);
  display: flex;
  flex-direction: column;
}

.door__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.door__title {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 17px;
}

.door__stats {
  font-size: 11px;
  color: var(--door-dim);
}

.door__close {
  cursor: pointer;
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--door-close-line);
  background: transparent;
  color: var(--door-text);
}

.door__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 20px;
}

.door__frame {
  position: relative;
  width: min(240px, 60vw);
  aspect-ratio: 1;
  border-radius: 18px;
  background: var(--door-frame-bg);
  border: 1px solid var(--door-frame);
  overflow: hidden;
}

.door__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 18px;
}

/* The brackets and the scan line take the Theme's accent, as they always
   have; the button below is the door's own orange. */
.door__corner {
  position: absolute;
  width: 34px;
  height: 34px;
  border: 0 solid var(--accent);
  pointer-events: none;
  z-index: 2;
}
.door__corner--tl {
  top: -2px;
  left: -2px;
  border-top-width: 3px;
  border-left-width: 3px;
  border-top-left-radius: 18px;
}
.door__corner--tr {
  top: -2px;
  right: -2px;
  border-top-width: 3px;
  border-right-width: 3px;
  border-top-right-radius: 18px;
}
.door__corner--bl {
  bottom: -2px;
  left: -2px;
  border-bottom-width: 3px;
  border-left-width: 3px;
  border-bottom-left-radius: 18px;
}
.door__corner--br {
  bottom: -2px;
  right: -2px;
  border-bottom-width: 3px;
  border-right-width: 3px;
  border-bottom-right-radius: 18px;
}

.door__scanline {
  position: absolute;
  left: 8%;
  right: 8%;
  height: 2px;
  background: var(--accent);
  box-shadow: 0 0 14px var(--accent);
  animation: bcScan 2.6s ease-in-out infinite;
  pointer-events: none;
  z-index: 3;
}

.door__result {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 14px;
  padding: 14px 20px;
  animation: bcPop 0.25s ease both;
}
.door__result--ok {
  background: var(--door-good-soft);
  border: 1px solid var(--door-good-line);
}
.door__result--bad {
  background: var(--door-bad-soft);
  border: 1px solid var(--door-bad-line);
}

.door__badge {
  display: flex;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
}
.door__result--ok .door__badge {
  background: var(--door-good);
  color: var(--door-on-good);
}
.door__result--bad .door__badge {
  background: var(--door-bad);
  color: var(--door-on-bad);
  font-weight: 800;
  font-size: 18px;
}

.door__result-name {
  font-weight: 700;
  font-size: 15px;
}

.door__result-sub {
  font-size: 12px;
}
.door__result--ok .door__result-sub {
  color: var(--door-good-text);
}
.door__result--bad .door__result-sub {
  color: var(--door-bad-text);
}

.door__hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--door-dim);
}

.door__recent {
  padding: 0 20px 22px 20px;
}

.door__label {
  font-size: 10px;
  color: var(--door-faint);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  margin-bottom: 4px;
}
.door__label--recent {
  margin-bottom: 8px;
}

.door__history {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.door__history-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.door__history-name {
  color: var(--door-name);
}

.door__history-time {
  color: var(--door-faint);
  font-size: 12px;
}

.door__empty {
  font-size: 13px;
  color: var(--door-faint);
}

.door__manual {
  padding: 14px 20px 18px 20px;
  border-top: 1px solid var(--door-line);
}

.door__manual-hint {
  font-size: 12px;
  color: var(--door-faint);
  margin-bottom: 9px;
}

.door__fields {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.door__field {
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--door-field-line);
  background: var(--door-field);
  color: var(--door-text);
  outline: none;
}
.door__field--code {
  width: 40%;
  font-size: 15px;
  font-family: monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.door__field--name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.door__check {
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
  background: var(--door-accent);
  color: var(--door-on-accent);
  min-height: 44px;
}
.door__check:disabled {
  opacity: 0.5;
}
</style>
