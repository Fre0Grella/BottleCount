<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { db, getKey, setKey } from '../lib/db';
import {
  adoptRemoteKey,
  exportLocalKeyJwk,
  signTicket,
  verifyTicket,
} from '../lib/crypto';
import {
  connectSheet,
  getAccessToken,
  markTicketUsed,
  pullAll,
  pushParties,
  pushTickets,
  startOAuth,
  syncHmacKey,
} from '../lib/google';
import type { Party, Ticket, TicketQRPayload } from '../lib/types';
import QRCode from 'qrcode';
import defaultSettings from '../data/settings.json';

// ── Tab ──────────────────────────────────────────────────────────────────────
const activeTab = ref<'tickets' | 'scanner'>('tickets');

// ── Shared state ─────────────────────────────────────────────────────────────
const parties = ref<Party[]>([]);
const tickets = ref<Ticket[]>([]);
const selected = ref<Party | null>(null);
const ready = ref(false);

// ── Sync state ───────────────────────────────────────────────────────────────
const syncConfig = ref<string | null>(null);
const syncStatus = ref<'idle' | 'connecting' | 'syncing' | 'ok' | 'error'>(
  'idle',
);
const syncError = ref('');
const lastSyncedAt = ref<Date | null>(null);

// ── Ticket creator state ─────────────────────────────────────────────────────
const partyForm = ref({
  name: '',
  date: '',
  menuTemplate: 'default' as 'default' | 'empty',
});
const guestForm = ref({ name: '', expiresAt: '' });
const showPartyForm = ref(false);
const showGuestForm = ref(false);
const qrImages = ref<Record<number, string>>({});
const shareTicket = ref<Ticket | null>(null);
const shareImg = ref('');
const shareWorking = ref(false);

// ── Scanner state ─────────────────────────────────────────────────────────────
const scanning = ref(false);
const lastResult = ref<{ ok: boolean; message: string } | null>(null);
const scanHistory = ref<{ ok: boolean; guestName: string; time: string }[]>([]);
const videoEl = ref<HTMLVideoElement | null>(null);
const manualQrInput = ref<HTMLInputElement | null>(null);
let scanner: any = null;

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();
  parties.value = await db.parties.toArray();
  if (parties.value.length) await selectParty(parties.value[0]);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59);
  guestForm.value.expiresAt = d.toISOString().slice(0, 16);
  syncConfig.value = await getKey<string | null>('google_sync_config', null);
  ready.value = true;
});
onUnmounted(() => stopScanner());

// ── Stats ─────────────────────────────────────────────────────────────────────
const expiredCount = computed(
  () => tickets.value.filter((t) => new Date(t.expiresAt) < new Date()).length,
);
const usedCount = computed(() => tickets.value.filter((t) => t.used).length);

// ── Party CRUD ────────────────────────────────────────────────────────────────
function buildMenu(template: 'default' | 'empty') {
  if (template === 'empty')
    return {
      Beer: { macro_pct: 0.2, spirits: {} },
      Spirits: { macro_pct: 0.6, spirits: {} },
      Wine: { macro_pct: 0.2, spirits: {} },
    };
  return JSON.parse(JSON.stringify(defaultSettings.menu));
}

async function createParty() {
  if (!partyForm.value.name.trim()) {
    alert('Party name required');
    return;
  }
  const p: Party = {
    name: partyForm.value.name.trim(),
    date: partyForm.value.date,
    createdAt: new Date().toISOString(),
    partyMenu: buildMenu(partyForm.value.menuTemplate),
  };
  p.id = await db.parties.add(p);
  parties.value.push(p);
  partyForm.value = { name: '', date: '', menuTemplate: 'default' };
  showPartyForm.value = false;
  await selectParty(p);
  const token = getAccessToken();
  if (token && syncConfig.value)
    pushParties(token, syncConfig.value, [p]).catch(() => {});
}

async function deleteParty(p: Party) {
  if (!confirm(`Delete party "${p.name}" and ALL its tickets?`)) return;
  await db.tickets.where('partyId').equals(p.id!).delete();
  await db.parties.delete(p.id!);
  parties.value = parties.value.filter((x) => x.id !== p.id);
  if (selected.value?.id === p.id) {
    selected.value = null;
    tickets.value = [];
  }
}

async function selectParty(p: Party) {
  selected.value = p;
  tickets.value = await db.tickets.where('partyId').equals(p.id!).toArray();
  for (const t of tickets.value) await ensureQR(t);
}

// ── Ticket CRUD ───────────────────────────────────────────────────────────────
async function addTicket() {
  if (!selected.value) return;
  const guestName = guestForm.value.name.trim();
  if (!guestName) {
    alert('Guest name required');
    return;
  }
  const t: Ticket = {
    partyId: selected.value.id!,
    guestName,
    used: false,
    expiresAt: new Date(guestForm.value.expiresAt).toISOString(),
  };
  t.id = await db.tickets.add(t);
  tickets.value.push(t);
  guestForm.value.name = '';
  await ensureQR(t);
  const token = getAccessToken();
  if (token && syncConfig.value)
    pushTickets(token, syncConfig.value, [t]).catch(() => {});
}

async function deleteTicket(t: Ticket) {
  if (!confirm(`Delete ticket for ${t.guestName}?`)) return;
  await db.tickets.delete(t.id!);
  tickets.value = tickets.value.filter((x) => x.id !== t.id);
  delete qrImages.value[t.id!];
}

async function ensureQR(t: Ticket) {
  console.log('ensureQR called for ticket', t.id);
  if (!t.id || qrImages.value[t.id]) {
    console.log('ensureQR early return', {
      id: t.id,
      hasImage: !!qrImages.value[t.id!],
    });
    return;
  }
  const payload: TicketQRPayload = {
    ticketId: t.id,
    partyId: t.partyId,
    guestName: t.guestName,
    expiresAt: t.expiresAt,
  };
  const signed = await signTicket(payload);

  // Render QR to an offscreen canvas
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, signed, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'H', // ← must be H for logo overlay
    color: { dark: '#0f1117', light: '#f6f7fa' },
  });
  // Overlay the logo
  await overlayLogo(canvas);
  qrImages.value[t.id] = canvas.toDataURL('image/png');
}

async function overlayLogo(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d')!;
    const logo = new Image();
    logo.onload = () => {
      const size = canvas.width * 0.18;
      const x = (canvas.width - size) / 2;
      const y = (canvas.height - size) / 2;

      ctx.fillStyle = '#f6f7fa';
      ctx.beginPath();
      ctx.roundRect(x - 6, y - 6, size + 12, size + 12, 6);
      ctx.fill();

      ctx.drawImage(logo, x, y, size, size);
      resolve();
    };
    logo.onerror = () => {
      console.error('logo failed to load', logo.src);
      resolve();
    };
    logo.src = `${import.meta.env.BASE_URL}logoLight.svg`;
  });
}

// ── Google Sync ───────────────────────────────────────────────────────────────
async function connectGoogle() {
  syncStatus.value = 'connecting';
  syncError.value = '';
  try {
    const token = await startOAuth();
    const sheetId = await connectSheet(token);
    syncConfig.value = sheetId;
    await setKey('google_sync_config', { sheetId });
    await doSync(token, sheetId);
  } catch (e: any) {
    syncStatus.value = 'error';
    syncError.value = e.message ?? 'Connection failed';
  }
}

async function syncNow() {
  const token = getAccessToken();
  if (!token || !syncConfig.value) {
    await connectGoogle();
    return;
  }
  await doSync(token, syncConfig.value);
}

async function doSync(token: string, sheetId: string) {
  syncStatus.value = 'syncing';
  syncError.value = '';
  try {
    // ── 1. Sync HMAC key first so all devices share the same signing secret ──
    const localJwk = await exportLocalKeyJwk();
    const sharedJwk = await syncHmacKey(token, sheetId, localJwk);
    await adoptRemoteKey(sharedJwk);
    // Regenerate QR codes if the key changed (new key means old QRs are invalid)
    qrImages.value = {};

    // ── 2. Push local data ───────────────────────────────────────────────────
    const allParties = await db.parties.toArray();
    const allTickets = await db.tickets.toArray();
    await pushParties(token, sheetId, allParties);
    await pushTickets(token, sheetId, allTickets);

    // ── 3. Pull remote data ──────────────────────────────────────────────────
    const remote = await pullAll(token, sheetId);
    for (const rp of remote.parties) {
      const id = Number(rp.id);
      if (!id) continue;
      if (!(await db.parties.get(id))) {
        await db.parties.put({
          id,
          name: rp.name,
          date: rp.date ?? '',
          createdAt: rp.createdAt,
        });
      }
    }
    for (const rt of remote.tickets) {
      const id = Number(rt.id);
      if (!id) continue;
      const local = await db.tickets.get(id);
      const remoteUsed = rt.used === 'TRUE' || rt.used === 'true';
      if (!local) {
        await db.tickets.put({
          id,
          partyId: Number(rt.partyId),
          guestName: rt.guestName,
          used: remoteUsed,
          usedAt: rt.usedAt || undefined,
          expiresAt: rt.expiresAt,
        });
      } else if (!local.used && remoteUsed) {
        await db.tickets.update(id, {
          used: true,
          usedAt: rt.usedAt || new Date().toISOString(),
        });
      }
    }

    // ── 4. Refresh UI ────────────────────────────────────────────────────────
    parties.value = await db.parties.toArray();
    if (selected.value) {
      const refreshed = parties.value.find((p) => p.id === selected.value!.id);
      if (refreshed) await selectParty(refreshed);
    } else if (parties.value.length) {
      await selectParty(parties.value[0]);
    }

    syncStatus.value = 'ok';
    lastSyncedAt.value = new Date();
  } catch (e: any) {
    syncStatus.value = 'error';
    syncError.value = e.message ?? 'Sync failed';
  }
}

async function disconnectGoogle() {
  if (!confirm('Disconnect Google? Your local data stays on this device.'))
    return;
  syncConfig.value = null;
  await setKey('google_sync_config', null);
  syncStatus.value = 'idle';
}

const syncLabel = computed(() => {
  if (syncStatus.value === 'connecting') return '⏳ Connecting…';
  if (syncStatus.value === 'syncing') return '⏳ Syncing…';
  if (syncStatus.value === 'ok' && lastSyncedAt.value)
    return `✅ Synced at ${lastSyncedAt.value.toLocaleTimeString()}`;
  if (syncStatus.value === 'error') return `❌ ${syncError.value}`;
  if (syncConfig.value) return '☁️ Google connected — tap Sync to refresh';
  return '';
});

// ── Scanner ───────────────────────────────────────────────────────────────────
async function startScanner() {
  if (scanning.value) return;
  scanning.value = true;
  lastResult.value = null;
  try {
    const { default: QrScanner } = await import('qr-scanner');
    if (!videoEl.value) return;
    scanner = new QrScanner(
      videoEl.value,
      async (result: { data: string }) => {
        await handleScan(result.data);
      },
      { highlightScanRegion: true, highlightCodeOutline: true },
    );
    await scanner.start();
  } catch (err: any) {
    scanning.value = false;
    lastResult.value = {
      ok: false,
      message: `Camera error: ${err?.message ?? err}`,
    };
  }
}

function stopScanner() {
  scanner?.stop();
  scanner?.destroy();
  scanner = null;
  scanning.value = false;
}

async function handleScan(qrString: string) {
  scanner?.stop();
  const payload = await verifyTicket(qrString);
  if (!payload) {
    setResult(false, '⛔ Forged or invalid ticket', '');
    scanner?.start();
    return;
  }
  if (new Date(payload.expiresAt) < new Date()) {
    setResult(
      false,
      `⏰ Expired (${new Date(payload.expiresAt).toLocaleDateString()})`,
      payload.guestName,
    );
    scanner?.start();
    return;
  }
  const ticket = await db.tickets.get(payload.ticketId);
  if (!ticket) {
    setResult(
      false,
      '❓ Unknown ticket — try syncing first',
      payload.guestName,
    );
    scanner?.start();
    return;
  }
  if (ticket.used) {
    setResult(
      false,
      `🔁 Already used at ${ticket.usedAt ? new Date(ticket.usedAt).toLocaleTimeString() : '?'}`,
      payload.guestName,
    );
    scanner?.start();
    return;
  }

  const usedAt = new Date().toISOString();
  await db.tickets.update(payload.ticketId, { used: true, usedAt });
  const token = getAccessToken();
  if (token && syncConfig.value)
    markTicketUsed(token, syncConfig.value, payload.ticketId, usedAt).catch(
      () => {},
    );
  setResult(true, `✅ Welcome, ${payload.guestName}!`, payload.guestName);
  setTimeout(() => scanner?.start(), 3000);
}

function setResult(ok: boolean, message: string, guestName: string) {
  lastResult.value = { ok, message };
  if (guestName) {
    scanHistory.value.unshift({
      ok,
      guestName,
      time: new Date().toLocaleTimeString(),
    });
    if (scanHistory.value.length > 20) scanHistory.value.pop();
  }
  if (ok) navigator.vibrate?.([100, 50, 100]);
  else navigator.vibrate?.([500]);
}

// ── Print ─────────────────────────────────────────────────────────────────────
function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printTickets() {
  if (!selected.value || !tickets.value.length) return;
  const party = selected.value;
  const cards = tickets.value
    .map((t) => {
      const qr = qrImages.value[t.id!] ?? '';
      const dateStr = party.date
        ? new Date(party.date).toLocaleDateString('it-IT', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : '';
      const expStr = new Date(t.expiresAt).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      return `<div class="ticket"><div class="ticket-header"><div class="party-name">${escHtml(party.name)}</div>${dateStr ? `<div class="party-date">${dateStr}</div>` : ''}</div><div class="ticket-body">${qr ? `<img class="qr" src="${qr}" alt="QR" />` : '<div class="qr-missing">QR N/A</div>'}</div><div class="ticket-footer"><div class="guest-name">${escHtml(t.guestName)}</div><div class="valid-until">Valid until ${expStr}</div><div class="ticket-id">#${t.id}</div></div></div>`;
    })
    .join('\n');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Tickets — ${escHtml(party.name)}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f8fafc}.tickets-wrap{display:flex;flex-wrap:wrap;gap:16px;padding:20px}@media print{@page{margin:10mm;size:A4}}</style></head><body><div class="tickets-wrap">${cards}</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const win = window.open(URL.createObjectURL(blob), '_blank');
  if (!win) alert('Pop-up blocked — please allow pop-ups for this site.');
}

// ── Share ─────────────────────────────────────────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function buildTicketBlob(t: Ticket): Promise<Blob> {
  const party = selected.value!;
  const qrSrc = qrImages.value[t.id!];
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 560;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f0f1a';
  roundRect(ctx, 0, 0, 400, 560, 20);
  ctx.fill();
  ctx.strokeStyle = '#1b263b';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, 392, 552, 18);
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 26px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(party.name, 200, 52);
  if (party.date) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px system-ui,sans-serif';
    ctx.fillText(new Date(party.date).toLocaleDateString(), 200, 78);
  }
  ctx.strokeStyle = '#2d2d44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 94);
  ctx.lineTo(370, 94);
  ctx.stroke();
  if (qrSrc) {
    const img = new Image();
    await new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
      img.src = qrSrc;
      if (img.complete && img.naturalWidth > 0) res();
    });
    if (img.naturalWidth > 0) ctx.drawImage(img, 75, 106, 250, 250);
  }
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px system-ui,sans-serif';
  ctx.fillText(t.guestName, 200, 392);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px system-ui,sans-serif';
  ctx.fillText(
    `Valid until ${new Date(t.expiresAt).toLocaleDateString()}`,
    200,
    420,
  );
  ctx.fillStyle = '#475569';
  ctx.font = '12px monospace';
  ctx.fillText(`Ticket #${t.id}`, 200, 444);
  ctx.fillStyle = '#1b263b';
  ctx.font = 'bold 14px system-ui,sans-serif';
  ctx.fillText('🎫 BottleCount', 200, 506);
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error('canvas toBlob failed'))),
      'image/png',
    ),
  );
}

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function getShareFile(t: Ticket): Promise<File> {
  const blob = await buildTicketBlob(t);
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
  return new File(
    [blob],
    `ticket_${safe(t.guestName)}_${safe(selected.value!.name)}.png`,
    { type: 'image/png' },
  );
}

async function openShare(t: Ticket) {
  shareTicket.value = t;
  shareImg.value = qrImages.value[t.id!] ?? '';
}

function closeShare() {
  shareTicket.value = null;
  shareImg.value = '';
}

async function shareNative() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file = await getShareFile(shareTicket.value);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `Ticket — ${selected.value.name}`,
        text: `🎫 ${shareTicket.value.guestName} · ${selected.value.name}`,
        files: [file],
      });
    } else {
      triggerDownload(file);
    }
  } catch {
    /* cancelled */
  } finally {
    shareWorking.value = false;
    closeShare();
  }
}

async function downloadImage() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file = await getShareFile(shareTicket.value);
    triggerDownload(file);
  } finally {
    shareWorking.value = false;
    closeShare();
  }
}
</script>

<template>
  <div v-if="!ready" class="em-loading">Loading…</div>
  <div v-else>
    <!-- ── Google Sync Banner ── -->
    <div class="em-sync-banner">
      <div v-if="!syncConfig" class="card card-pad em-sync-connect">
        <div class="em-sync-connect__text">
          <div class="em-sync-connect__title">🔗 Sync across devices</div>
          <div class="em-sync-connect__sub">
            Connect Google to share parties &amp; tickets between phones
          </div>
        </div>
        <button
          class="btn btn-primary btn-sm"
          @click="connectGoogle"
          :disabled="syncStatus === 'connecting'"
        >
          {{
            syncStatus === 'connecting' ? '⏳ Connecting…' : '🔗 Connect Google'
          }}
        </button>
      </div>
      <div v-else class="card card-pad em-sync-status">
        <span
          class="em-sync-status__label"
          :class="{
            ok: syncStatus === 'ok',
            err: syncStatus === 'error',
            warn: syncStatus === 'syncing' || syncStatus === 'connecting',
          }"
        >
          {{ syncLabel }}
        </span>
        <div class="em-sync-status__actions">
          <button
            class="btn btn-ghost btn-sm"
            @click="syncNow"
            :disabled="syncStatus === 'syncing'"
          >
            ↻ Sync now
          </button>
          <button
            class="btn btn-ghost btn-sm em-sync-status__disconnect"
            @click="disconnectGoogle"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>

    <!-- ── Party selector ── -->
    <div class="card card-pad em-party-selector">
      <div class="em-section-header">
        <div class="section-label">Your Parties</div>
        <button
          class="btn btn-primary btn-sm"
          @click="showPartyForm = !showPartyForm"
        >
          {{ showPartyForm ? '✕' : '+ New party' }}
        </button>
      </div>

      <div v-if="showPartyForm" class="em-party-form">
        <div class="grid-2 em-party-form__fields">
          <div>
            <label>Party name</label
            ><input
              type="text"
              v-model="partyForm.name"
              placeholder="e.g. Summer Bash"
            />
          </div>
          <div>
            <label>Date</label><input type="date" v-model="partyForm.date" />
          </div>
        </div>
        <div class="em-party-form__menu-section">
          <div class="section-label">Drink menu</div>
          <div class="em-menu-options">
            <label
              v-for="opt in [
                {
                  v: 'default',
                  e: '🍹',
                  t: 'Default menu',
                  d: 'Beer 20% · Spirits 60% · Wine 20%',
                },
                {
                  v: 'empty',
                  e: '✏️',
                  t: 'From scratch',
                  d: 'Empty categories',
                },
              ]"
              :key="opt.v"
              class="em-menu-option"
              :class="{
                'em-menu-option--active': partyForm.menuTemplate === opt.v,
              }"
            >
              <input
                type="radio"
                v-model="partyForm.menuTemplate"
                :value="opt.v"
                class="em-menu-option__radio"
              />
              <span class="em-menu-option__text">
                <span class="em-menu-option__title"
                  >{{ opt.e }} {{ opt.t }}</span
                >
                <span class="em-menu-option__sub">{{ opt.d }}</span>
              </span>
            </label>
          </div>
        </div>
        <button class="btn btn-success btn-full" @click="createParty">
          ✅ Create party
        </button>
      </div>

      <div v-if="!parties.length" class="em-empty">No parties yet.</div>
      <div
        v-for="p in parties"
        :key="p.id"
        class="em-party-row"
        :class="{ 'em-party-row--active': selected?.id === p.id }"
        @click="selectParty(p)"
      >
        <div class="em-party-row__info">
          <div class="em-party-row__name">{{ p.name }}</div>
          <div class="em-party-row__date">
            {{ p.date ? new Date(p.date).toLocaleDateString() : 'No date' }}
          </div>
        </div>
        <button class="btn btn-danger btn-sm" @click.stop="deleteParty(p)">
          ✖
        </button>
      </div>
    </div>

    <!-- ── Tabs ── -->
    <div v-if="selected">
      <div class="em-tabs">
        <button
          v-for="tab in [
            { k: 'tickets', l: '🎟 Tickets' },
            { k: 'scanner', l: '📷 Scanner' },
          ]"
          :key="tab.k"
          class="em-tab"
          :class="{ 'em-tab--active': activeTab === tab.k }"
          @click="activeTab = tab.k as any"
        >
          {{ tab.l }}
        </button>
      </div>

      <!-- ══ TICKETS TAB ══ -->
      <div v-show="activeTab === 'tickets'">
        <div class="em-section-header em-tickets-header">
          <h2 class="em-tickets-header__title">🎟️ {{ selected.name }}</h2>
          <div class="em-tickets-header__actions">
            <button
              class="btn btn-ghost btn-sm"
              @click="printTickets"
              :disabled="!tickets.length"
            >
              🖨️ Print all
            </button>
            <button
              class="btn btn-primary btn-sm"
              @click="showGuestForm = !showGuestForm"
            >
              {{ showGuestForm ? '✕' : '+ Add guest' }}
            </button>
          </div>
        </div>

        <div class="grid-3 em-stats">
          <div class="card card-pad em-stat">
            <div class="em-stat__value em-stat__value--green">
              {{ tickets.length }}
            </div>
            <div class="em-stat__label">Total</div>
          </div>
          <div class="card card-pad em-stat">
            <div class="em-stat__value em-stat__value--indigo">
              {{ usedCount }}
            </div>
            <div class="em-stat__label">Used</div>
          </div>
          <div class="card card-pad em-stat">
            <div class="em-stat__value em-stat__value--red">
              {{ expiredCount }}
            </div>
            <div class="em-stat__label">Expired</div>
          </div>
        </div>

        <div v-if="showGuestForm" class="card card-pad em-guest-form">
          <div class="grid-2 em-guest-form__fields">
            <div>
              <label>Guest name</label
              ><input
                type="text"
                v-model="guestForm.name"
                placeholder="e.g. Mario Rossi"
                @keyup.enter="addTicket"
              />
            </div>
            <div>
              <label>Valid until</label
              ><input type="datetime-local" v-model="guestForm.expiresAt" />
            </div>
          </div>
          <button class="btn btn-success btn-full" @click="addTicket">
            🎫 Generate ticket
          </button>
        </div>

        <div v-if="!tickets.length" class="em-empty">No tickets yet.</div>
        <div v-for="t in tickets" :key="t.id" class="em-ticket-row card">
          <img
            v-if="qrImages[t.id!]"
            :src="qrImages[t.id!]"
            class="em-ticket-row__qr"
            alt="QR code"
          />
          <div v-else class="em-ticket-row__qr em-ticket-row__qr--placeholder">
            …
          </div>
          <div class="em-ticket-row__info">
            <div class="em-ticket-row__name">{{ t.guestName }}</div>
            <div class="em-ticket-row__expiry">
              Valid until {{ new Date(t.expiresAt).toLocaleDateString() }}
            </div>
            <div class="em-ticket-row__badges">
              <span v-if="t.used" class="badge em-badge--used">✓ Used</span>
              <span
                v-else-if="new Date(t.expiresAt) < new Date()"
                class="badge em-badge--expired"
                >Expired</span
              >
              <span v-else class="badge em-badge--valid">Valid</span>
              <span class="em-ticket-row__id">#{{ t.id }}</span>
            </div>
          </div>
          <div class="em-ticket-row__actions">
            <button class="btn btn-primary btn-sm" @click="openShare(t)">
              📤
            </button>
            <button class="btn btn-danger btn-sm" @click="deleteTicket(t)">
              ✖
            </button>
          </div>
        </div>
      </div>

      <!-- ══ SCANNER TAB ══ -->
      <div v-show="activeTab === 'scanner'">
        <div class="em-scanner-viewport card">
          <video ref="videoEl" class="em-scanner-video" playsinline muted />
          <div
            v-if="lastResult"
            class="em-scan-result"
            :class="
              lastResult.ok ? 'em-scan-result--ok' : 'em-scan-result--err'
            "
          >
            <div class="em-scan-result__icon">
              {{ lastResult.ok ? '✅' : '❌' }}
            </div>
            <div class="em-scan-result__message">{{ lastResult.message }}</div>
          </div>
        </div>

        <div class="em-scanner-controls">
          <button
            v-if="!scanning"
            class="btn btn-primary btn-full"
            @click="startScanner"
          >
            📷 Start scanning
          </button>
          <button v-else class="btn btn-danger btn-full" @click="stopScanner">
            ⏹ Stop
          </button>
        </div>

        <div class="card card-pad em-manual-entry">
          <div class="section-label">Manual entry</div>
          <div class="em-manual-entry__row">
            <input
              type="text"
              id="manual-qr"
              placeholder="Paste QR string here…"
              ref="manualQrInput"
              @keyup.enter="handleScan(manualQrInput?.value ?? '')"
            />
            <button
              class="btn btn-primary btn-sm"
              @click="handleScan(manualQrInput?.value ?? '')"
            >
              Validate
            </button>
          </div>
        </div>

        <div v-if="scanHistory.length" class="card em-scan-history">
          <div class="em-scan-history__header">Recent scans</div>
          <div v-for="(h, i) in scanHistory" :key="i" class="shop-row">
            <span class="em-scan-history__icon">{{ h.ok ? '✅' : '❌' }}</span>
            <span class="em-scan-history__name">{{ h.guestName }}</span>
            <span class="em-scan-history__time">{{ h.time }}</span>
          </div>
        </div>
        <div v-else class="em-empty">Start scanning to see results.</div>
      </div>
    </div>

    <div v-else class="em-empty">Select or create a party above.</div>

    <!-- ══ SHARE OVERLAY ══ -->
    <div v-if="shareTicket" class="em-overlay" @click.self="closeShare">
      <div class="em-share-modal card">
        <div class="em-share-modal__header">
          <div class="em-share-modal__title">📤 Share ticket</div>
          <button
            class="btn btn-ghost btn-sm"
            @click="closeShare"
            :disabled="shareWorking"
          >
            ✕
          </button>
        </div>
        <div class="em-share-modal__preview">
          <img
            v-if="shareImg"
            :src="shareImg"
            class="em-share-modal__qr"
            alt="QR preview"
          />
          <div class="em-share-modal__guest">{{ shareTicket.guestName }}</div>
          <div class="em-share-modal__party">{{ selected?.name }}</div>
          <div class="em-share-modal__hint">
            A PNG ticket image will be generated
          </div>
        </div>
        <div v-if="shareWorking" class="em-share-modal__working">
          ⏳ Generating image…
        </div>
        <div v-else class="em-share-modal__actions">
          <button class="btn btn-primary btn-full" @click="shareNative">
            📱 Share via…
          </button>
          <button
            class="btn btn-ghost btn-full em-share-modal__download"
            @click="downloadImage"
          >
            🖼️ Download as Image
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Loading ───────────────────────────────────────────── */
.em-loading {
  text-align: center;
  padding: 60px;
  color: var(--muted);
}

/* ── Sync banner ───────────────────────────────────────── */
.em-sync-banner {
  margin-bottom: 16px;
}

.em-sync-connect {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: var(--surface-3);
}

.em-sync-connect__title {
  font-weight: 700;
  font-size: 0.9rem;
}

.em-sync-connect__sub {
  font-size: 0.78rem;
  color: var(--muted);
  margin-top: 2px;
}

.em-sync-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.em-sync-status__label {
  font-size: 0.85rem;
}

.em-sync-status__actions {
  display: flex;
  gap: 8px;
}

.em-sync-status__disconnect {
  font-size: 0.75rem;
  color: var(--muted);
}

/* ── Shared section header ──────────────────────────────── */
.em-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.em-section-header .section-label {
  margin: 0;
}

/* ── Party selector ────────────────────────────────────── */
.em-party-selector {
  margin-bottom: 16px;
}

.em-party-form {
  background: var(--surface-3);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}

.em-party-form__fields {
  margin-bottom: 10px;
}

.em-party-form__menu-section {
  margin-bottom: 12px;
}

.em-menu-option__text {
  display: flex;
  flex-direction: column;
}
.em-menu-option__title {
  font-weight: 700;
  font-size: 0.9rem;
}
.em-menu-option__sub {
  font-size: 0.75rem;
  color: var(--muted);
}

.em-menu-options {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.em-menu-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex: 1;
  min-width: 140px;
  background: var(--surface-3);
  border-radius: 12px;
  padding: 10px 14px;
  transition:
    background 0.15s,
    color 0.15s;
}

.em-menu-option--active {
  background: var(--surface-4);
}

.em-menu-option--active .em-menu-option__title {
  color: var(--accent);
}

.em-menu-option__radio {
  width: auto;
  display: inline;
}

.em-menu-option__title {
  font-weight: 700;
  font-size: 0.9rem;
}

.em-menu-option__sub {
  font-size: 0.75rem;
  color: var(--muted);
}

.em-party-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 4px;
  background: var(--surface-2);
  transition:
    background 0.15s,
    color 0.15s;
}

.em-party-row:hover {
  background: var(--surface-3);
}

.em-party-row--active {
  background: var(--surface-4);
}

.em-party-row__info {
  flex: 1;
  min-width: 0;
}

.em-party-row__name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.em-party-row__date {
  font-size: 0.75rem;
  color: var(--muted);
}

/* ── Tabs ──────────────────────────────────────────────── */
.em-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--surface-2);
  border-radius: 12px;
  padding: 4px;
}

.em-tab {
  flex: 1;
  padding: 8px;
  border-radius: 9px;
  font-weight: 700;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--muted);
  transition:
    background 0.15s,
    color 0.15s;
}

.em-tab--active {
  background: var(--primary);
  color: oklch(96% 0.01 255);
}

/* ── Tickets tab ─────────────────────────────────────────── */
.em-tickets-header {
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.em-tickets-header__title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
}

.em-tickets-header__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.em-stats {
  margin-bottom: 16px;
}

.em-stat {
  text-align: center;
}

.em-stat__value {
  font-size: 1.5rem;
  font-weight: 900;
}

.em-stat__label {
  font-size: 0.75rem;
  color: var(--muted);
}

.em-stat__value--green {
  color: var(--success);
}

.em-stat__value--indigo {
  color: var(--primary-strong);
}

.em-stat__value--red {
  color: var(--danger);
}

.em-guest-form {
  margin-bottom: 12px;
}

.em-guest-form__fields {
  margin-bottom: 8px;
}

/* ── Ticket rows ───────────────────────────────────────── */
.em-ticket-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
}

.em-ticket-row__qr {
  width: 80px;
  height: 80px;
  border-radius: 6px;
  flex-shrink: 0;
  background: oklch(96% 0.01 255);
}

.em-ticket-row__qr--placeholder {
  background: var(--surface-3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: var(--muted);
}

.em-ticket-row__info {
  flex: 1;
  min-width: 0;
}

.em-ticket-row__name {
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 2px;
}

.em-ticket-row__expiry {
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 6px;
}

.em-ticket-row__badges {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.em-ticket-row__id {
  font-size: 0.7rem;
  color: var(--muted);
}

.em-ticket-row__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.em-badge--used {
  background: oklch(28% 0.08 150);
  color: oklch(82% 0.12 150);
}

.em-badge--expired {
  background: oklch(28% 0.08 25);
  color: oklch(78% 0.16 25);
}

.em-badge--valid {
  background: oklch(28% 0.08 200);
  color: oklch(80% 0.12 200);
}

/* ── Scanner ───────────────────────────────────────────── */
.em-scanner-viewport {
  overflow: hidden;
  margin-bottom: 16px;
  position: relative;
}

.em-scanner-video {
  width: 100%;
  display: block;
  aspect-ratio: 4/3;
  background: var(--bg);
  object-fit: cover;
}

.em-scanner-controls {
  margin-bottom: 16px;
}

.em-scan-result {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.em-scan-result--ok {
  background: color-mix(in oklch, var(--success) 78%, transparent);
}

.em-scan-result--err {
  background: color-mix(in oklch, var(--danger) 78%, transparent);
}

.em-scan-result__icon {
  font-size: 3rem;
}

.em-scan-result__message {
  font-weight: 800;
  font-size: 1.1rem;
  color: oklch(96% 0.01 255);
  margin-top: 8px;
  text-align: center;
  padding: 0 16px;
}

/* ── Manual entry ──────────────────────────────────────── */
.em-manual-entry {
  margin-bottom: 16px;
}

.em-manual-entry__row {
  display: flex;
  gap: 8px;
}

/* ── Scan history ──────────────────────────────────────── */
.em-scan-history__header {
  padding: 12px 16px;
  font-weight: 700;
  font-size: 0.9rem;
}

.em-scan-history__icon {
  font-size: 1.1rem;
}

.em-scan-history__name {
  flex: 1;
  font-weight: 500;
}

.em-scan-history__time {
  font-size: 0.75rem;
  color: var(--muted);
}

/* ── Empty state ───────────────────────────────────────── */
.em-empty {
  color: var(--muted);
  font-size: 0.875rem;
  text-align: center;
  padding: 40px;
}

/* ── Share overlay ─────────────────────────────────────── */
.em-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in oklch, var(--bg) 82%, transparent);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.em-share-modal {
  padding: 24px;
  width: 100%;
  max-width: 380px;
}

.em-share-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.em-share-modal__title {
  font-weight: 800;
  font-size: 1rem;
}

.em-share-modal__preview {
  text-align: center;
  margin-bottom: 16px;
}

.em-share-modal__qr {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  background: oklch(96% 0.01 255);
}

.em-share-modal__guest {
  font-weight: 700;
  margin-top: 8px;
}

.em-share-modal__party {
  font-size: 0.8rem;
  color: var(--muted);
}

.em-share-modal__hint {
  font-size: 0.72rem;
  color: var(--muted);
  margin-top: 6px;
}

.em-share-modal__working {
  text-align: center;
  padding: 20px;
  color: var(--muted);
}

.em-share-modal__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.em-share-modal__download {
  background: var(--surface-3);
}
</style>
