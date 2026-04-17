<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { db, getKey, setKey } from '../lib/db';
import { verifyTicket } from '../lib/crypto';
import { validateWithSheet, getSheetsConfig } from '../lib/sheets';
import type { ValidationResult, SheetsConfig } from '../lib/types';

// ── State ──────────────────────────────────────────────────────────────────
const scanning    = ref(false);
const lastResult  = ref<{ ok: boolean; message: string; guestName?: string } | null>(null);
const scanHistory = ref<{ ok: boolean; guestName: string; time: string }[]>([]);
const sheetsCfg   = ref<SheetsConfig>({ url: '', token: '' });
const showConfig  = ref(false);
const savingCfg   = ref(false);
const videoEl     = ref<HTMLVideoElement | null>(null);
const ready       = ref(false);

let scanner: any = null;

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  const cfg = await getSheetsConfig();
  if (cfg) sheetsCfg.value = cfg;
  ready.value = true;
});

onUnmounted(() => stopScanner());

// ── Scanner ────────────────────────────────────────────────────────────────
async function startScanner() {
  if (scanning.value) return;
  scanning.value = true;
  lastResult.value = null;

  try {
    // Dynamic import — only loaded on scanner page
    const { default: QrScanner } = await import('qr-scanner');

    if (!videoEl.value) return;
    scanner = new QrScanner(videoEl.value, async (result: { data: string }) => {
      await handleScan(result.data);
    }, {
      highlightScanRegion: true,
      highlightCodeOutline: true,
    });
    await scanner.start();
  } catch (err: any) {
    scanning.value = false;
    lastResult.value = { ok: false, message: `Camera error: ${err?.message ?? err}` };
  }
}

function stopScanner() {
  scanner?.stop();
  scanner?.destroy();
  scanner = null;
  scanning.value = false;
}

// ── 3-layer validation ─────────────────────────────────────────────────────
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

  // Layer 3a: Local DB check
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

  // Layer 3b: Google Sheets (if configured)
  if (sheetsCfg.value.url) {
    const sheetsResult: ValidationResult = await validateWithSheet(payload.ticketId).catch(() => ({ ok: false, reason: 'unauthorized' as const }));
    if (!sheetsResult.ok) {
      const reasonMsg: Record<string, string> = {
        already_used:   `🔁 Already scanned (Sheet): ${sheetsResult.usedAt ?? ''}`,
        unknown_ticket: '❓ Not found in Sheet',
        unauthorized:   '🔒 Sheet auth failed',
      };
      setResult(false, reasonMsg[sheetsResult.reason ?? ''] ?? '❌ Sheet validation failed', payload.guestName);
      scanner?.start();
      return;
    }
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
  // Vibrate if supported
  if (ok) navigator.vibrate?.([100, 50, 100]);
  else    navigator.vibrate?.([500]);
}

// ── Config ─────────────────────────────────────────────────────────────────
async function saveConfig() {
  savingCfg.value = true;
  await setKey('sheets_config', { ...sheetsCfg.value });
  savingCfg.value = false;
  showConfig.value = false;
}
</script>

<template>
  <div v-if="!ready" style="text-align:center;padding:60px;color:var(--muted);">Loading…</div>
  <div v-else>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h1 style="font-size:1.1rem;font-weight:800;margin:0;">📷 Door Scanner</h1>
      <button class="btn btn-ghost btn-sm" @click="showConfig=!showConfig">⚙️ Sheet config</button>
    </div>

    <!-- Google Sheets config -->
    <div v-if="showConfig" class="card card-pad" style="margin-bottom:16px;">
      <div class="section-label">Google Sheets sync (optional)</div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:10px;">
        For multi-scanner validation. See <a href="docs" style="color:var(--indigo);">Docs</a> for setup instructions.
      </p>
      <div style="margin-bottom:8px;"><label>Apps Script URL</label>
        <input type="text" v-model="sheetsCfg.url" placeholder="https://script.google.com/macros/s/…/exec" />
      </div>
      <div style="margin-bottom:12px;"><label>Secret token</label>
        <input type="text" v-model="sheetsCfg.token" placeholder="your-secret-token" />
      </div>
      <button class="btn btn-success btn-sm" @click="saveConfig">{{ savingCfg ? 'Saving…' : '💾 Save' }}</button>
    </div>

    <!-- Camera viewport -->
    <div class="card" style="overflow:hidden;margin-bottom:16px;position:relative;">
      <video ref="videoEl" style="width:100%;display:block;aspect-ratio:4/3;background:#000;object-fit:cover;" playsinline muted />
      <!-- Overlay result -->
      <div v-if="lastResult" :style="`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:${lastResult.ok?'rgba(34,197,94,.85)':'rgba(239,68,68,.85)'};`">
        <div style="text-align:center;padding:20px;">
          <div style="font-size:3rem;">{{ lastResult.ok ? '✅' : '❌' }}</div>
          <div style="font-weight:800;font-size:1.1rem;color:#fff;margin-top:8px;">{{ lastResult.message }}</div>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div style="display:flex;gap:10px;margin-bottom:20px;">
      <button v-if="!scanning" class="btn btn-primary btn-full" @click="startScanner">📷 Start scanning</button>
      <button v-else           class="btn btn-danger btn-full"  @click="stopScanner">⏹ Stop</button>
    </div>

    <!-- Manual entry fallback -->
    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="section-label">Manual QR code entry</div>
      <div style="display:flex;gap:8px;">
        <input type="text" id="manual-qr" placeholder="Paste QR string here…" style="flex:1;" @keyup.enter="handleScan((document.getElementById('manual-qr') as HTMLInputElement).value)" />
        <button class="btn btn-primary btn-sm" @click="handleScan((document.getElementById('manual-qr') as HTMLInputElement).value)">Validate</button>
      </div>
    </div>

    <!-- Scan history -->
    <div v-if="scanHistory.length" class="card">
      <div style="padding:12px 16px;font-weight:700;font-size:.9rem;border-bottom:1px solid var(--border);">Recent scans</div>
      <div v-for="(h, i) in scanHistory" :key="i" class="shop-row">
        <span style="font-size:1.1rem;">{{ h.ok ? '✅' : '❌' }}</span>
        <span style="flex:1;font-weight:500;">{{ h.guestName }}</span>
        <span style="font-size:.75rem;color:var(--muted);">{{ h.time }}</span>
      </div>
    </div>

    <div v-else style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">
      Start scanning to see results here.
    </div>
  </div>
</template>
