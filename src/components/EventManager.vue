<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { db, getKey, setKey } from '../lib/db';
import { signTicket, verifyTicket } from '../lib/crypto';
import {
  startOAuth, connectSheet, pullAll,
  pushParties, pushTickets, markTicketUsed,
  isConnected, getAccessToken,
} from '../lib/google';
import type { Party, Ticket, TicketQRPayload, GoogleSyncConfig } from '../lib/types';
import QRCode from 'qrcode';
import defaultSettings from '../data/settings.json';

// ── Tab ────────────────────────────────────────────────────────────────────
const activeTab = ref<'tickets' | 'scanner'>('tickets');

// ── Shared state ───────────────────────────────────────────────────────────
const parties  = ref<Party[]>([]);
const tickets  = ref<Ticket[]>([]);
const selected = ref<Party | null>(null);
const ready    = ref(false);

// ── Sync state ─────────────────────────────────────────────────────────────
const syncConfig   = ref<GoogleSyncConfig | null>(null);
const syncStatus   = ref<'idle' | 'connecting' | 'syncing' | 'ok' | 'error'>('idle');
const syncError    = ref('');
const lastSyncedAt = ref<Date | null>(null);

// ── Ticket creator state ───────────────────────────────────────────────────
const partyForm     = ref({ name: '', date: '', menuTemplate: 'default' as 'default' | 'empty' });
const guestForm     = ref({ name: '', expiresAt: '' });
const showPartyForm = ref(false);
const showGuestForm = ref(false);
const qrImages      = ref<Record<number, string>>({});
const shareTicket   = ref<Ticket | null>(null);
const shareImg      = ref('');
const shareWorking  = ref(false);

// ── Scanner state ──────────────────────────────────────────────────────────
const scanning    = ref(false);
const lastResult  = ref<{ ok: boolean; message: string } | null>(null);
const scanHistory = ref<{ ok: boolean; guestName: string; time: string }[]>([]);
const videoEl     = ref<HTMLVideoElement | null>(null);
let scanner: any  = null;

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();
  parties.value = await db.parties.toArray();
  if (parties.value.length) await selectParty(parties.value[0]);
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59);
  guestForm.value.expiresAt = d.toISOString().slice(0, 16);
  syncConfig.value = await getKey<GoogleSyncConfig | null>('google_sync_config', null);
  ready.value = true;
});
onUnmounted(() => stopScanner());

// ── Stats ──────────────────────────────────────────────────────────────────
const expiredCount = computed(() => tickets.value.filter(t => new Date(t.expiresAt) < new Date()).length);
const usedCount    = computed(() => tickets.value.filter(t => t.used).length);

// ── Party CRUD ─────────────────────────────────────────────────────────────
function buildMenu(template: 'default' | 'empty') {
  if (template === 'empty') return { Beer: { macro_pct: 0.2, spirits: {} }, Spirits: { macro_pct: 0.6, spirits: {} }, Wine: { macro_pct: 0.2, spirits: {} } };
  return JSON.parse(JSON.stringify(defaultSettings.menu));
}

async function createParty() {
  if (!partyForm.value.name.trim()) { alert('Party name required'); return; }
  const p: Party = {
    name: partyForm.value.name.trim(),
    date: partyForm.value.date,
    createdAt: new Date().toISOString(),
    partyMenu: buildMenu(partyForm.value.menuTemplate),
  };
  const id = await db.parties.add(p); p.id = id;
  parties.value.push(p);
  partyForm.value = { name: '', date: '', menuTemplate: 'default' };
  showPartyForm.value = false;
  await selectParty(p);
  const token = getAccessToken();
  if (token && syncConfig.value) {
    pushParties(token, syncConfig.value.sheetId, [p]).catch(() => {});
  }
}

async function deleteParty(p: Party) {
  if (!confirm(`Delete party "${p.name}" and ALL its tickets?`)) return;
  await db.tickets.where('partyId').equals(p.id!).delete();
  await db.parties.delete(p.id!);
  parties.value = parties.value.filter(x => x.id !== p.id);
  if (selected.value?.id === p.id) { selected.value = null; tickets.value = []; }
}

async function selectParty(p: Party) {
  selected.value = p;
  tickets.value  = await db.tickets.where('partyId').equals(p.id!).toArray();
  for (const t of tickets.value) await ensureQR(t);
}

// ── Ticket CRUD ────────────────────────────────────────────────────────────
async function addTicket() {
  if (!selected.value) return;
  const guestName = guestForm.value.name.trim();
  if (!guestName) { alert('Guest name required'); return; }
  const t: Ticket = {
    partyId:   selected.value.id!,
    guestName,
    used:      false,
    expiresAt: new Date(guestForm.value.expiresAt).toISOString(),
  };
  const id = await db.tickets.add(t); t.id = id;
  tickets.value.push(t);
  guestForm.value.name = '';
  await ensureQR(t);
  const token = getAccessToken();
  if (token && syncConfig.value) {
    pushTickets(token, syncConfig.value.sheetId, [t]).catch(() => {});
  }
}

async function deleteTicket(t: Ticket) {
  if (!confirm(`Delete ticket for ${t.guestName}?`)) return;
  await db.tickets.delete(t.id!);
  tickets.value = tickets.value.filter(x => x.id !== t.id);
  delete qrImages.value[t.id!];
}

async function ensureQR(t: Ticket) {
  if (!t.id || qrImages.value[t.id]) return;
  const payload: TicketQRPayload = { ticketId: t.id, partyId: t.partyId, guestName: t.guestName, expiresAt: t.expiresAt };
  const signed = await signTicket(payload);
  qrImages.value[t.id] = await QRCode.toDataURL(signed, {
    width: 320, margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ── Google Sync ────────────────────────────────────────────────────────────
async function connectGoogle() {
  syncStatus.value = 'connecting';
  syncError.value  = '';
  try {
    const token   = await startOAuth();
    const sheetId = await connectSheet(token);
    syncConfig.value = { sheetId };
    await setKey('google_sync_config', { sheetId });
    await doSync(token, sheetId);
  } catch (e: any) {
    syncStatus.value = 'error';
    syncError.value  = e.message ?? 'Connection failed';
  }
}

async function syncNow() {
  const token = getAccessToken();
  if (!token || !syncConfig.value) {
    // Token expired — re-auth silently
    await connectGoogle();
    return;
  }
  await doSync(token, syncConfig.value.sheetId);
}

async function doSync(token: string, sheetId: string) {
  syncStatus.value = 'syncing';
  syncError.value  = '';
  try {
    // 1. Push all local data first
    const allParties = await db.parties.toArray();
    const allTickets = await db.tickets.toArray();
    await pushParties(token, sheetId, allParties);
    await pushTickets(token, sheetId, allTickets);

    // 2. Pull remote and upsert locally
    const remote = await pullAll(token, sheetId);

    for (const rp of remote.parties) {
      const id = Number(rp.id);
      if (!id) continue;
      const exists = await db.parties.get(id);
      if (!exists) {
        await db.parties.put({
          id,
          name:      rp.name,
          date:      rp.date ?? '',
          createdAt: rp.createdAt,
        });
      }
    }

    for (const rt of remote.tickets) {
      const id = Number(rt.id);
      if (!id) continue;
      const local      = await db.tickets.get(id);
      const remoteUsed = rt.used === 'TRUE' || rt.used === 'true';
      if (!local) {
        await db.tickets.put({
          id,
          partyId:   Number(rt.partyId),
          guestName: rt.guestName,
          used:      remoteUsed,
          usedAt:    rt.usedAt || undefined,
          expiresAt: rt.expiresAt,
        });
      } else if (!local.used && remoteUsed) {
        // OR logic: if remote says used, mark local too
        await db.tickets.update(id, { used: true, usedAt: rt.usedAt || new Date().toISOString() });
      }
    }

    // 3. Refresh UI
    parties.value = await db.parties.toArray();
    if (selected.value) {
      const refreshed = parties.value.find(p => p.id === selected.value!.id);
      if (refreshed) await selectParty(refreshed);
    } else if (parties.value.length) {
      await selectParty(parties.value[0]);
    }

    syncStatus.value = 'ok';
    lastSyncedAt.value = new Date();
  } catch (e: any) {
    syncStatus.value = 'error';
    syncError.value  = e.message ?? 'Sync failed';
  }
}

async function disconnectGoogle() {
  if (!confirm('Disconnect Google? Your local data stays on this device.')) return;
  syncConfig.value = null;
  await setKey('google_sync_config', null);
  syncStatus.value = 'idle';
}

const syncLabel = computed(() => {
  if (syncStatus.value === 'connecting') return '⏳ Connecting…';
  if (syncStatus.value === 'syncing')    return '⏳ Syncing…';
  if (syncStatus.value === 'ok' && lastSyncedAt.value)
    return `✅ Synced at ${lastSyncedAt.value.toLocaleTimeString()}`;
  if (syncStatus.value === 'error')      return `❌ ${syncError.value}`;
  if (syncConfig.value)                  return '☁️ Google connected — tap Sync to refresh';
  return '';
});

// ── Scanner ────────────────────────────────────────────────────────────────
async function startScanner() {
  if (scanning.value) return;
  scanning.value  = true;
  lastResult.value = null;
  try {
    const { default: QrScanner } = await import('qr-scanner');
    if (!videoEl.value) return;
    scanner = new QrScanner(
      videoEl.value,
      async (result: { data: string }) => { await handleScan(result.data); },
      { highlightScanRegion: true, highlightCodeOutline: true }
    );
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

async function handleScan(qrString: string) {
  scanner?.stop();

  // Layer 1: HMAC signature
  const payload = await verifyTicket(qrString);
  if (!payload) {
    setResult(false, '⛔ Forged or invalid ticket', '');
    scanner?.start(); return;
  }

  // Layer 2: Expiry
  if (new Date(payload.expiresAt) < new Date()) {
    setResult(false, `⏰ Expired (${new Date(payload.expiresAt).toLocaleDateString()})`, payload.guestName);
    scanner?.start(); return;
  }

  // Layer 3: Local DB
  const ticket = await db.tickets.get(payload.ticketId);
  if (!ticket) {
    setResult(false, '❓ Unknown ticket — try syncing first', payload.guestName);
    scanner?.start(); return;
  }
  if (ticket.used) {
    setResult(false, `🔁 Already used at ${ticket.usedAt ? new Date(ticket.usedAt).toLocaleTimeString() : '?'}`, payload.guestName);
    scanner?.start(); return;
  }

  // ✅ Valid — mark used locally
  const usedAt = new Date().toISOString();
  await db.tickets.update(payload.ticketId, { used: true, usedAt });

  // Also mark in Sheets if connected
  const token = getAccessToken();
  if (token && syncConfig.value) {
    markTicketUsed(token, syncConfig.value.sheetId, payload.ticketId, usedAt).catch(() => {});
  }

  setResult(true, `✅ Welcome, ${payload.guestName}!`, payload.guestName);
  setTimeout(() => scanner?.start(), 3000);
}

function setResult(ok: boolean, message: string, guestName: string) {
  lastResult.value = { ok, message };
  if (guestName) {
    scanHistory.value.unshift({ ok, guestName, time: new Date().toLocaleTimeString() });
    if (scanHistory.value.length > 20) scanHistory.value.pop();
  }
  if (ok) navigator.vibrate?.([100, 50, 100]);
  else    navigator.vibrate?.([500]);
}

// ── Print ──────────────────────────────────────────────────────────────────
function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function printTickets() {
  if (!selected.value || !tickets.value.length) return;
  const party = selected.value;
  const cards = tickets.value.map(t => {
    const qr      = qrImages.value[t.id!] ?? '';
    const dateStr = party.date ? new Date(party.date).toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' }) : '';
    const expStr  = new Date(t.expiresAt).toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' });
    return `<div class="ticket"><div class="ticket-header"><div class="party-name">${escHtml(party.name)}</div>${dateStr?`<div class="party-date">${dateStr}</div>`:''}</div><div class="ticket-body">${qr?`<img class="qr" src="${qr}" alt="QR" />`:'<div class="qr-missing">QR N/A</div>'}</div><div class="ticket-footer"><div class="guest-name">${escHtml(t.guestName)}</div><div class="valid-until">Valid until ${expStr}</div><div class="ticket-id">#${t.id}</div></div></div>`;
  }).join('\n');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tickets — ${escHtml(party.name)}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f8fafc}.tickets-wrap{display:flex;flex-wrap:wrap;gap:16px;padding:20px}.ticket{width:240px;border:2px solid #334155;border-radius:14px;overflow:hidden;background:#fff;page-break-inside:avoid;break-inside:avoid}.ticket-header{background:#1e293b;color:#f1f5f9;padding:14px 16px;text-align:center}.party-name{font-size:1rem;font-weight:900}.party-date{font-size:.72rem;color:#94a3b8;margin-top:4px}.ticket-body{padding:12px;display:flex;justify-content:center}.qr{width:192px;height:192px;border-radius:6px}.ticket-footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:10px 16px;text-align:center}.guest-name{font-weight:800}.valid-until,.ticket-id{font-size:.75rem;color:#64748b}@media print{@page{margin:10mm;size:A4}}</style></head><body><div class="tickets-wrap">${cards}</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const win  = window.open(URL.createObjectURL(blob), '_blank');
  if (!win) alert('Pop-up blocked — please allow pop-ups for this site.');
}

// ── Share ──────────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

async function buildTicketBlob(t: Ticket): Promise<Blob> {
  const party = selected.value!; const qrSrc = qrImages.value[t.id!];
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 560;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f0f1a'; roundRect(ctx,0,0,400,560,20); ctx.fill();
  ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 3; roundRect(ctx,4,4,392,552,18); ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 26px system-ui,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(party.name, 200, 52);
  if (party.date) { ctx.fillStyle = '#94a3b8'; ctx.font = '15px system-ui,sans-serif'; ctx.fillText(new Date(party.date).toLocaleDateString(), 200, 78); }
  ctx.strokeStyle = '#2d2d44'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(30,94); ctx.lineTo(370,94); ctx.stroke();
  if (qrSrc) {
    const img = new Image();
    await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = qrSrc; if (img.complete && img.naturalWidth > 0) res(); });
    if (img.naturalWidth > 0) ctx.drawImage(img, 75, 106, 250, 250);
  }
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.fillText(t.guestName, 200, 392);
  ctx.fillStyle = '#94a3b8'; ctx.font = '14px system-ui,sans-serif'; ctx.fillText(`Valid until ${new Date(t.expiresAt).toLocaleDateString()}`, 200, 420);
  ctx.fillStyle = '#475569'; ctx.font = '12px monospace'; ctx.fillText(`Ticket #${t.id}`, 200, 444);
  ctx.fillStyle = '#6366f1'; ctx.font = 'bold 14px system-ui,sans-serif'; ctx.fillText('🎫 BottleCount', 200, 506);
  return new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('canvas toBlob failed')), 'image/png'));
}

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function getShareFile(t: Ticket): Promise<File> {
  const blob = await buildTicketBlob(t);
  const safe = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
  return new File([blob], `ticket_${safe(t.guestName)}_${safe(selected.value!.name)}.png`, { type: 'image/png' });
}

async function openShare(t: Ticket) { shareTicket.value = t; shareImg.value = qrImages.value[t.id!] ?? ''; }
function closeShare() { shareTicket.value = null; shareImg.value = ''; }

async function shareNative() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file = await getShareFile(shareTicket.value);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `Ticket — ${selected.value.name}`, text: `🎫 ${shareTicket.value.guestName} · ${selected.value.name}`, files: [file] });
    } else { triggerDownload(file); }
  } catch { /* cancelled */ } finally { shareWorking.value = false; closeShare(); }
}

async function downloadImage() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try { const file = await getShareFile(shareTicket.value); triggerDownload(file); }
  finally { shareWorking.value = false; closeShare(); }
}
</script>

<template>
  <div v-if="!ready" style="text-align:center;padding:60px;color:var(--muted);">Loading…</div>
  <div v-else>

    <!-- ── Google Sync Banner ── -->
    <div style="margin-bottom:16px;">
      <div v-if="!syncConfig"
        style="background:var(--surface);border:1px dashed var(--border2);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;font-size:.9rem;">🔗 Sync across devices</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:2px;">Connect Google to share parties &amp; tickets between phones</div>
        </div>
        <button class="btn btn-primary btn-sm" @click="connectGoogle" :disabled="syncStatus==='connecting'">
          {{ syncStatus==='connecting' ? '⏳ Connecting…' : '🔗 Connect Google' }}
        </button>
      </div>

      <div v-else
        style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="font-size:.85rem;">
          <span v-if="syncStatus==='syncing'">⏳ Syncing…</span>
          <span v-else-if="syncStatus==='ok'" style="color:#4ade80;">{{ syncLabel }}</span>
          <span v-else-if="syncStatus==='error'" style="color:#f87171;" :title="syncError">❌ {{ syncError }}</span>
          <span v-else style="color:var(--muted);">{{ syncLabel }}</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" @click="syncNow" :disabled="syncStatus==='syncing'">↻ Sync now</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--muted);font-size:.75rem;" @click="disconnectGoogle">Disconnect</button>
        </div>
      </div>
    </div>

    <!-- ── Party selector ── -->
    <div class="card card-pad" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="section-label" style="margin:0;">Your Parties</div>
        <button class="btn btn-primary btn-sm" @click="showPartyForm=!showPartyForm">
          {{ showPartyForm ? '✕' : '+ New party' }}
        </button>
      </div>

      <div v-if="showPartyForm" style="background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:12px;">
        <div class="grid-2" style="margin-bottom:10px;">
          <div><label>Party name</label><input type="text" v-model="partyForm.name" placeholder="e.g. Summer Bash" /></div>
          <div><label>Date</label><input type="date" v-model="partyForm.date" /></div>
        </div>
        <div style="margin-bottom:12px;">
          <div class="section-label">Drink menu</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <label v-for="opt in [{v:'default',e:'🍹',t:'Default menu',d:'Beer 20% · Spirits 60% · Wine 20%'},{v:'empty',e:'✏️',t:'From scratch',d:'Empty categories'}]" :key="opt.v"
              style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:140px;background:var(--surface);border:2px solid;border-radius:10px;padding:10px 14px;transition:border-color .15s;"
              :style="{borderColor:partyForm.menuTemplate===opt.v?'var(--indigo)':'var(--border2)'}">
              <input type="radio" v-model="partyForm.menuTemplate" :value="opt.v" style="width:auto;display:inline;" />
              <div><div style="font-weight:700;font-size:.9rem;">{{ opt.e }} {{ opt.t }}</div><div style="font-size:.75rem;color:var(--muted);">{{ opt.d }}</div></div>
            </label>
          </div>
        </div>
        <button class="btn btn-success btn-full" @click="createParty">✅ Create party</button>
      </div>

      <div v-if="!parties.length" style="color:var(--muted);font-size:.875rem;text-align:center;padding:20px;">No parties yet.</div>
      <div v-for="p in parties" :key="p.id"
        :style="`display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:4px;background:${selected?.id===p.id?'var(--border)':'transparent'};border:1px solid ${selected?.id===p.id?'var(--indigo)':'transparent'}`"
        @click="selectParty(p)">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ p.name }}</div>
          <div style="font-size:.75rem;color:var(--muted);">{{ p.date ? new Date(p.date).toLocaleDateString() : 'No date' }}</div>
        </div>
        <button class="btn btn-danger btn-sm" @click.stop="deleteParty(p)">✖</button>
      </div>
    </div>

    <!-- ── Tabs ── -->
    <div v-if="selected">
      <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:4px;">
        <button
          v-for="tab in [{k:'tickets',l:'🎟 Tickets'},{k:'scanner',l:'📷 Scanner'}]" :key="tab.k"
          @click="activeTab=tab.k as any"
          :style="`flex:1;padding:8px;border-radius:9px;font-weight:700;font-size:.9rem;transition:background .15s,color .15s;border:none;cursor:pointer;background:${activeTab===tab.k?'var(--indigo)':'transparent'};color:${activeTab===tab.k?'#fff':'var(--muted)'}`">
          {{ tab.l }}
        </button>
      </div>

      <!-- ══ TICKETS TAB ══ -->
      <div v-show="activeTab==='tickets'">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <h2 style="font-size:1rem;font-weight:700;margin:0;">🎟️ {{ selected.name }}</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" @click="printTickets" :disabled="!tickets.length">🖨️ Print all</button>
            <button class="btn btn-primary btn-sm" @click="showGuestForm=!showGuestForm">{{ showGuestForm ? '✕' : '+ Add guest' }}</button>
          </div>
        </div>

        <div class="grid-3" style="margin-bottom:16px;">
          <div class="card card-pad" style="text-align:center;"><div style="font-size:1.5rem;font-weight:900;color:#4ade80;">{{ tickets.length }}</div><div style="font-size:.75rem;color:var(--muted);">Total</div></div>
          <div class="card card-pad" style="text-align:center;"><div style="font-size:1.5rem;font-weight:900;color:#818cf8;">{{ usedCount }}</div><div style="font-size:.75rem;color:var(--muted);">Used</div></div>
          <div class="card card-pad" style="text-align:center;"><div style="font-size:1.5rem;font-weight:900;color:#f87171;">{{ expiredCount }}</div><div style="font-size:.75rem;color:var(--muted);">Expired</div></div>
        </div>

        <div v-if="showGuestForm" class="card card-pad" style="margin-bottom:12px;">
          <div class="grid-2" style="margin-bottom:8px;">
            <div><label>Guest name</label><input type="text" v-model="guestForm.name" placeholder="e.g. Mario Rossi" @keyup.enter="addTicket" /></div>
            <div><label>Valid until</label><input type="datetime-local" v-model="guestForm.expiresAt" /></div>
          </div>
          <button class="btn btn-success btn-full" @click="addTicket">🎫 Generate ticket</button>
        </div>

        <div v-if="!tickets.length" style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">No tickets yet.</div>
        <div v-for="t in tickets" :key="t.id" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <img v-if="qrImages[t.id!]" :src="qrImages[t.id!]" style="width:80px;height:80px;border-radius:6px;flex-shrink:0;background:#fff;" />
            <div v-else style="width:80px;height:80px;background:var(--surface2);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--muted);">…</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:1rem;margin-bottom:2px;">{{ t.guestName }}</div>
              <div style="font-size:.75rem;color:var(--muted);margin-bottom:6px;">Valid until {{ new Date(t.expiresAt).toLocaleDateString() }}</div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <span v-if="t.used" style="font-size:.75rem;background:#14532d;color:#86efac;border-radius:20px;padding:2px 8px;font-weight:700;">✓ Used</span>
                <span v-else-if="new Date(t.expiresAt)<new Date()" style="font-size:.75rem;background:#7c2d12;color:#f87171;border-radius:20px;padding:2px 8px;font-weight:700;">Expired</span>
                <span v-else style="font-size:.75rem;background:#0c4a6e;color:#38bdf8;border-radius:20px;padding:2px 8px;font-weight:700;">Valid</span>
                <span style="font-size:.7rem;color:var(--muted);">#{{ t.id }}</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
              <button class="btn btn-primary btn-sm" @click="openShare(t)">📤</button>
              <button class="btn btn-danger btn-sm" @click="deleteTicket(t)">✖</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ SCANNER TAB ══ -->
      <div v-show="activeTab==='scanner'">
        <div class="card" style="overflow:hidden;margin-bottom:16px;position:relative;">
          <video ref="videoEl" style="width:100%;display:block;aspect-ratio:4/3;background:#000;object-fit:cover;" playsinline muted />
          <div v-if="lastResult"
            :style="`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:${lastResult.ok?'rgba(34,197,94,.85)':'rgba(239,68,68,.85)');`">
            <div style="text-align:center;padding:20px;">
              <div style="font-size:3rem;">{{ lastResult.ok ? '✅' : '❌' }}</div>
              <div style="font-weight:800;font-size:1.1rem;color:#fff;margin-top:8px;">{{ lastResult.message }}</div>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:16px;">
          <button v-if="!scanning" class="btn btn-primary btn-full" @click="startScanner">📷 Start scanning</button>
          <button v-else class="btn btn-danger btn-full" @click="stopScanner">⏹ Stop</button>
        </div>

        <div class="card card-pad" style="margin-bottom:16px;">
          <div class="section-label">Manual entry</div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="manual-qr" placeholder="Paste QR string here…" style="flex:1;"
              @keyup.enter="handleScan((document.getElementById('manual-qr') as HTMLInputElement).value)" />
            <button class="btn btn-primary btn-sm"
              @click="handleScan((document.getElementById('manual-qr') as HTMLInputElement).value)">Validate</button>
          </div>
        </div>

        <div v-if="scanHistory.length" class="card">
          <div style="padding:12px 16px;font-weight:700;font-size:.9rem;border-bottom:1px solid var(--border);">Recent scans</div>
          <div v-for="(h,i) in scanHistory" :key="i" class="shop-row">
            <span style="font-size:1.1rem;">{{ h.ok ? '✅' : '❌' }}</span>
            <span style="flex:1;font-weight:500;">{{ h.guestName }}</span>
            <span style="font-size:.75rem;color:var(--muted);">{{ h.time }}</span>
          </div>
        </div>
        <div v-else style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">Start scanning to see results.</div>
      </div>
    </div>

    <div v-else style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">Select or create a party above.</div>

    <!-- ══ SHARE OVERLAY ══ -->
    <div v-if="shareTicket"
      style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;"
      @click.self="closeShare">
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:18px;padding:24px;width:100%;max-width:380px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-weight:800;font-size:1rem;">📤 Share ticket</div>
          <button class="btn btn-ghost btn-sm" @click="closeShare" :disabled="shareWorking">✕</button>
        </div>
        <div style="text-align:center;margin-bottom:16px;">
          <img v-if="shareImg" :src="shareImg" style="width:120px;height:120px;border-radius:8px;border:2px solid var(--border2);background:#fff;" />
          <div style="font-weight:700;margin-top:8px;">{{ shareTicket.guestName }}</div>
          <div style="font-size:.8rem;color:var(--muted);">{{ selected?.name }}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:6px;">A PNG ticket image will be generated</div>
        </div>
        <div v-if="shareWorking" style="text-align:center;padding:20px;color:var(--muted);">⏳ Generating image…</div>
        <div v-else style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-primary btn-full" @click="shareNative">📱 Share via…</button>
          <button class="btn btn-ghost btn-full" style="border:1px solid var(--border2);" @click="downloadImage">🖼️ Download as Image</button>
        </div>
      </div>
    </div>

  </div>
</template>
