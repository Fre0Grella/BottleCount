<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { db, setKey, getKey } from '../lib/db';
import { verifyTicket } from '../lib/crypto';
import { getAccessToken, isConnected, syncHmacKey } from '../lib/google';
import type { TicketQRPayload } from '../lib/types';
import QrScanner from 'qr-scanner';

// ── State ────────────────────────────────────────────────────────────────
const scanning    = ref(false);
const lastResult  = ref<{ ok: boolean; message: string; guestName?: string } | null>(null);
const scanHistory = ref<{ ok: boolean; guestName: string; time: string }[]>([]);
const videoEl     = ref<HTMLVideoElement | null>(null);
const manualInput = ref<HTMLInputElement | null>(null);
const ready       = ref(false);

let scanner: QrScanner | null = null;

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  if (isConnected()) {
    const sheetId  = await getKey<string>('google_sync_config', '');
    const localJwk = await getKey<JsonWebKey>('hmac_key', {} as JsonWebKey);
    const canonical = await syncHmacKey(getAccessToken()!, sheetId, localJwk);
    await setKey('hmac_key', canonical);
  }
  ready.value = true;
});

onUnmounted(() => stopScanner());

// ── Scanner ────────────────────────────────────────────────────────────────
async function startScanner() {
  if (scanning.value) return;
  scanning.value = true;
  lastResult.value = null;

  try {
    if (!videoEl.value) return;
    scanner = new QrScanner(videoEl.value, async (result: QrScanner.ScanResult) => {
      await handleScan(result.data);
    }, {
      highlightScanRegion: true,
      highlightCodeOutline: true,
    });
    await scanner.start();
  } catch (err: unknown) {
    scanning.value = false;
    const msg = err instanceof Error ? err.message : String(err);
    lastResult.value = { ok: false, message: `Camera error: ${msg}` };
  }
}

function stopScanner() {
  scanner?.stop();
  scanner?.destroy();
  scanner = null;
  scanning.value = false;
}

// ── 2-layer validation ─────────────────────────────────────────────────────
async function handleScan(qrString: string) {
  // Pause scanner while processing
  scanner?.stop();

  // Layer 1: HMAC signature
  const payload = await verifyTicket(qrString);
  if (!payload) {
    setResult(false, '⛔ Forged or invalid ticket', '');
    scanner?.start();
    return;
  }

  // Layer 2: Expiry
  if (new Date(payload.expiresAt) < new Date()) {
    setResult(false, `⏰ Ticket expired (${new Date(payload.expiresAt).toLocaleDateString()})`, payload.guestName);
    scanner?.start();
    return;
  }

  // Layer 3: Local DB check
  const ticket = await db.tickets.get(payload.ticketId);
  if (!ticket) {
    setResult(false, '❓ Unknown ticket ID', payload.guestName);
    scanner?.start();
    return;
  }
  if (ticket.used) {
    setResult(false, `🔁 Already used at ${ticket.usedAt ? new Date(ticket.usedAt).toLocaleTimeString() : '?'}`, payload.guestName);
    scanner?.start();
    return;
  }

  // ✅ Valid — mark as used locally
  await db.tickets.update(payload.ticketId, { used: true, usedAt: new Date().toISOString() });
  setResult(true, `✅ Welcome, ${payload.guestName}!`, payload.guestName);

  // Resume after 3s
  setTimeout(() => scanner?.start(), 3000);
}

function setResult(ok: boolean, message: string, guestName: string) {
  lastResult.value = { ok, message, guestName };
  if (guestName) {
    scanHistory.value.unshift({ ok, guestName, time: new Date().toLocaleTimeString() });
    if (scanHistory.value.length > 20) scanHistory.value.pop();
  }
  if (ok) navigator.vibrate?.([100, 50, 100]);
  else    navigator.vibrate?.([500]);
}
</script>

<template>
  <div v-if="!ready" class="scanner-loading">Loading…</div>
  <div v-else>

    <!-- Header -->
    <div class="scanner-header">
      <h1 class="scanner-title">📷 Door Scanner</h1>
    </div>

    <!-- Camera viewport -->
    <div class="card scanner-viewport">
      <video ref="videoEl" class="scanner-video" playsinline muted />
      <!-- Overlay result -->
      <div
        v-if="lastResult"
        class="scanner-overlay"
        :class="lastResult.ok ? 'scanner-overlay--success' : 'scanner-overlay--error'"
      >
        <div class="scanner-overlay-icon">{{ lastResult.ok ? '✅' : '❌' }}</div>
        <div class="scanner-overlay-message">{{ lastResult.message }}</div>
      </div>
    </div>

    <!-- Controls -->
    <div class="scanner-controls">
      <button v-if="!scanning" class="btn btn-primary btn-full" @click="startScanner">📷 Start scanning</button>
      <button v-else           class="btn btn-danger btn-full"  @click="stopScanner">⏹ Stop</button>
    </div>

    <!-- Manual entry fallback -->
    <div class="card card-pad scanner-manual">
      <div class="section-label">Manual QR code entry</div>
      <div class="scanner-manual-row">
        <input
          ref="manualInput"
          type="text"
          placeholder="Paste QR string here…"
          @keyup.enter="handleScan(manualInput?.value ?? '')"
        />
        <button class="btn btn-primary btn-sm" @click="handleScan(manualInput?.value ?? '')">Validate</button>
      </div>
    </div>

    <!-- Scan history -->
    <div v-if="scanHistory.length" class="card">
      <div class="scanner-history-header">Recent scans</div>
      <div v-for="(h, i) in scanHistory" :key="i" class="shop-row">
        <span class="scanner-history-icon">{{ h.ok ? '✅' : '❌' }}</span>
        <span class="scanner-history-name">{{ h.guestName }}</span>
        <span class="scanner-history-time">{{ h.time }}</span>
      </div>
    </div>

    <div v-else class="scanner-empty">
      Start scanning to see results here.
    </div>

  </div>
</template>

<style scoped>
/* ── Loading ──────────────────────────────────────────────────────────── */
.scanner-loading {
  text-align: center;
  padding: 60px;
  color: var(--muted);
}

/* ── Header ───────────────────────────────────────────────────────────── */
.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.scanner-title {
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0;
}

/* ── Camera viewport ──────────────────────────────────────────────────── */
.scanner-viewport {
  overflow: hidden;
  margin-bottom: 16px;
  position: relative;
}

.scanner-video {
  width: 100%;
  display: block;
  aspect-ratio: 4 / 3;
  background: #000;
  object-fit: cover;
}

/* ── Result overlay ───────────────────────────────────────────────────── */
.scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.scanner-overlay--success { background: rgba(34, 197, 94, 0.85); }
.scanner-overlay--error   { background: rgba(239, 68, 68, 0.85);  }

.scanner-overlay-icon {
  font-size: 3rem;
}

.scanner-overlay-message {
  font-weight: 800;
  font-size: 1.1rem;
  color: #fff;
  margin-top: 8px;
  text-align: center;
}

/* ── Controls ───────────────────────────────────────────────────────────── */
.scanner-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

/* ── Manual entry ──────────────────────────────────────────────────────── */
.scanner-manual {
  margin-bottom: 16px;
}

.scanner-manual-row {
  display: flex;
  gap: 8px;
}

.scanner-manual-row input {
  flex: 1;
}

/* ── Scan history ──────────────────────────────────────────────────────── */
.scanner-history-header {
  padding: 12px 16px;
  font-weight: 700;
  font-size: 0.9rem;
  border-bottom: 1px solid var(--border);
}

.scanner-history-icon {
  font-size: 1.1rem;
}

.scanner-history-name {
  flex: 1;
  font-weight: 500;
}

.scanner-history-time {
  font-size: 0.75rem;
  color: var(--muted);
}

/* ── Empty state ───────────────────────────────────────────────────────── */
.scanner-empty {
  color: var(--muted);
  font-size: 0.875rem;
  text-align: center;
  padding: 40px;
}
</style>
