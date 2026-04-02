<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { db } from '../lib/db';
import { signTicket } from '../lib/crypto';
import type { Party, Ticket, TicketQRPayload } from '../lib/types';
import QRCode from 'qrcode';
import defaultSettings from '../data/settings.json';

// ── State ──────────────────────────────────────────────────────────────────
const parties  = ref<Party[]>([]);
const tickets  = ref<Ticket[]>([]);
const selected = ref<Party | null>(null);
const ready    = ref(false);

const partyForm     = ref({ name: '', date: '', menuTemplate: 'default' as 'default' | 'empty' });
const guestForm     = ref({ name: '', expiresAt: '' });
const showPartyForm = ref(false);
const showGuestForm = ref(false);

// QR map: ticketId → data URL (300×300 white-background QR)
const qrImages = ref<Record<number, string>>({});

// Share overlay
const shareTicket  = ref<Ticket | null>(null);
const shareImg     = ref('');
const shareWorking = ref(false);

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();
  parties.value = await db.parties.toArray();
  if (parties.value.length) await selectParty(parties.value[0]);
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59);
  guestForm.value.expiresAt = d.toISOString().slice(0, 16);
  ready.value = true;
});

// ── Menu builder ───────────────────────────────────────────────────────────
function buildMenu(template: 'default' | 'empty') {
  if (template === 'empty') {
    return {
      Beer:    { macro_pct: 0.2, spirits: {} },
      Spirits: { macro_pct: 0.6, spirits: {} },
      Wine:    { macro_pct: 0.2, spirits: {} },
    };
  }
  return JSON.parse(JSON.stringify(defaultSettings.menu));
}

// ── Party CRUD ─────────────────────────────────────────────────────────────
async function createParty() {
  if (!partyForm.value.name.trim()) { alert('Party name required'); return; }
  const p: Party = {
    name:      partyForm.value.name.trim(),
    date:      partyForm.value.date,
    createdAt: new Date().toISOString(),
    partyMenu: buildMenu(partyForm.value.menuTemplate),
  };
  const id = await db.parties.add(p);
  p.id = id;
  parties.value.push(p);
  partyForm.value = { name: '', date: '', menuTemplate: 'default' };
  showPartyForm.value = false;
  await selectParty(p);
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
  const id = await db.tickets.add(t);
  t.id = id;
  tickets.value.push(t);
  guestForm.value.name = '';
  await ensureQR(t);
}

async function deleteTicket(t: Ticket) {
  if (!confirm(`Delete ticket for ${t.guestName}?`)) return;
  await db.tickets.delete(t.id!);
  tickets.value = tickets.value.filter(x => x.id !== t.id);
  delete qrImages.value[t.id!];
}

async function ensureQR(t: Ticket) {
  if (!t.id || qrImages.value[t.id]) return;
  const payload: TicketQRPayload = {
    ticketId:  t.id,
    partyId:   t.partyId,
    guestName: t.guestName,
    expiresAt: t.expiresAt,
  };
  const signed = await signTicket(payload);
  // White background QR — works in both screen and print contexts
  qrImages.value[t.id] = await QRCode.toDataURL(signed, {
    width: 320, margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ── Print ──────────────────────────────────────────────────────────────────
// IMPORTANT: We deliberately avoid canvas here — canvas + await image.onload
// has a race condition with data-URL images (onload fires synchronously or
// not at all, hanging the loop). Instead we build a self-contained HTML page
// using the QR data-URLs we already have in memory and open it as a Blob URL.
// The page has its own "Print" button so the user controls timing.
function printTickets() {
  if (!selected.value || !tickets.value.length) return;
  const party = selected.value;

  // Build one ticket card per ticket — pure HTML, no canvas
  const cards = tickets.value.map(t => {
    const qr      = qrImages.value[t.id!] ?? '';
    const dateStr = party.date ? new Date(party.date).toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' }) : '';
    const expStr  = new Date(t.expiresAt).toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' });
    return `
<div class="ticket">
  <div class="ticket-header">
    <div class="party-name">${escHtml(party.name)}</div>
    ${dateStr ? `<div class="party-date">${dateStr}</div>` : ''}
  </div>
  <div class="ticket-body">
    ${qr ? `<img class="qr" src="${qr}" alt="QR code" />` : '<div class="qr-missing">QR N/A</div>'}
  </div>
  <div class="ticket-footer">
    <div class="guest-name">${escHtml(t.guestName)}</div>
    <div class="valid-until">Valid until ${expStr}</div>
    <div class="ticket-id">#${t.id}</div>
  </div>
</div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Tickets — ${escHtml(party.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #f8fafc;
    color: #0f172a;
  }

  /* Print button — hidden when printing */
  .print-bar {
    position: sticky; top: 0; z-index: 10;
    background: #1e293b; color: #f8fafc;
    padding: 12px 20px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
  }
  .print-bar h1 { font-size: 1rem; font-weight: 700; }
  .print-btn {
    background: #6366f1; color: #fff; border: none; border-radius: 8px;
    padding: 8px 20px; font-size: .9rem; font-weight: 700; cursor: pointer;
  }
  .print-btn:hover { background: #4f46e5; }

  /* Grid of tickets */
  .tickets-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 20px;
    justify-content: flex-start;
  }

  /* Individual ticket */
  .ticket {
    width: 240px;
    border: 2px solid #334155;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .ticket-header {
    background: #1e293b;
    color: #f1f5f9;
    padding: 14px 16px 10px;
    text-align: center;
  }
  .party-name {
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: .01em;
    line-height: 1.2;
  }
  .party-date {
    font-size: .72rem;
    color: #94a3b8;
    margin-top: 4px;
  }
  .ticket-body {
    padding: 12px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qr {
    width: 192px;
    height: 192px;
    display: block;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  .qr-missing {
    width: 192px; height: 192px;
    display: flex; align-items: center; justify-content: center;
    background: #f1f5f9; color: #94a3b8; font-size: .8rem; border-radius: 6px;
  }
  .ticket-footer {
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 10px 16px 12px;
    text-align: center;
  }
  .guest-name {
    font-size: .95rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 3px;
  }
  .valid-until {
    font-size: .68rem;
    color: #64748b;
    margin-bottom: 2px;
  }
  .ticket-id {
    font-size: .62rem;
    color: #94a3b8;
    font-family: monospace;
  }

  /* Print styles */
  @media print {
    .print-bar { display: none !important; }
    body { background: #fff; }
    .tickets-wrap { padding: 0; gap: 12px; }
    @page { margin: 10mm; size: A4; }
  }
</style>
</head>
<body>
<div class="print-bar">
  <h1>🎫 ${escHtml(party.name)} — ${tickets.value.length} ticket${tickets.value.length !== 1 ? 's' : ''}</h1>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
</div>
<div class="tickets-wrap">
${cards}
</div>
</body>
</html>`;

  // Open as a Blob URL — avoids document.write and avoids any base-URL issues
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');

  // Revoke after 60s (plenty of time to load and print)
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (!win) alert('Pop-up was blocked — please allow pop-ups for this site and try again.');
}

/** Minimal HTML entity escaping to avoid XSS in the print window */
function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Share helpers ──────────────────────────────────────────────────────────

/** Build a polished ticket PNG via canvas (only used for sharing, not printing) */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

async function buildTicketBlob(t: Ticket): Promise<Blob> {
  const party = selected.value!;
  const qrSrc = qrImages.value[t.id!];

  const canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 560;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0f0f1a'; roundRect(ctx, 0, 0, 400, 560, 20); ctx.fill();
  // Border
  ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 3; roundRect(ctx, 4, 4, 392, 552, 18); ctx.stroke();

  // Party name
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 26px system-ui,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(party.name, 200, 52);
  if (party.date) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '15px system-ui,sans-serif';
    ctx.fillText(new Date(party.date).toLocaleDateString(), 200, 78);
  }

  // Divider
  ctx.strokeStyle = '#2d2d44'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 94); ctx.lineTo(370, 94); ctx.stroke();

  // QR — we already have a data URL; create an image and draw it.
  // Use a synchronous approach: if the browser already decoded this data URL
  // (which it has, since we display it in the list), we can draw immediately.
  if (qrSrc) {
    // Try synchronous decode first, fall back to onload
    const img = new Image();
    await new Promise<void>(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = qrSrc;
      // If already loaded (data URL often loads synchronously), resolve right away
      if (img.complete && img.naturalWidth > 0) resolve();
    });
    if (img.naturalWidth > 0) ctx.drawImage(img, 75, 106, 250, 250);
  }

  // Guest name + meta
  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 22px system-ui,sans-serif';
  ctx.fillText(t.guestName, 200, 392);
  ctx.fillStyle = '#94a3b8'; ctx.font = '14px system-ui,sans-serif';
  ctx.fillText(`Valid until ${new Date(t.expiresAt).toLocaleDateString()}`, 200, 420);
  ctx.fillStyle = '#475569'; ctx.font = '12px monospace';
  ctx.fillText(`Ticket #${t.id}`, 200, 444);
  ctx.fillStyle = '#6366f1'; ctx.font = 'bold 14px system-ui,sans-serif';
  ctx.fillText('🎫 BottleCount', 200, 506);

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('canvas toBlob failed')), 'image/png')
  );
}

async function getShareFile(t: Ticket): Promise<File> {
  const blob  = await buildTicketBlob(t);
  const safe  = (s: string) => s.replace(/[^a-z0-9]/gi, '_');
  const fname = `ticket_${safe(t.guestName)}_${safe(selected.value!.name)}.png`;
  return new File([blob], fname, { type: 'image/png' });
}

async function openShare(t: Ticket) {
  shareTicket.value = t;
  shareImg.value    = qrImages.value[t.id!] ?? '';
}
function closeShare() { shareTicket.value = null; shareImg.value = ''; }

async function shareNative() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file = await getShareFile(shareTicket.value);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `Ticket — ${selected.value.name}`,
        text:  `🎫 ${shareTicket.value.guestName} · ${selected.value.name}`,
        files: [file],
      });
    } else {
      // Fallback: just download
      triggerDownload(file);
    }
  } catch { /* cancelled */ }
  finally { shareWorking.value = false; closeShare(); }
}

async function shareViaWhatsApp() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file = await getShareFile(shareTicket.value);
    if (navigator.canShare?.({ files: [file] })) {
      // Mobile: OS share sheet → user picks WhatsApp
      await navigator.share({
        title: `Ticket — ${selected.value.name}`,
        text:  `🎫 *${selected.value.name}* — Ticket for *${shareTicket.value.guestName}*\nValid until: ${new Date(shareTicket.value.expiresAt).toLocaleDateString()}\nShow the QR at the entrance. See you there! 🎉`,
        files: [file],
      });
    } else {
      // Desktop: download image + open WhatsApp web with text
      triggerDownload(file);
      const text = encodeURIComponent(
        `🎫 *${selected.value.name}* — Ticket for *${shareTicket.value.guestName}*\n` +
        `Valid until: ${new Date(shareTicket.value.expiresAt).toLocaleDateString()}\n` +
        `Attaching the downloaded image — show the QR at the entrance! 🎉`
      );
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  } catch { /* cancelled */ }
  finally { shareWorking.value = false; closeShare(); }
}

async function shareViaEmail() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file    = await getShareFile(shareTicket.value);
    triggerDownload(file);
    const subject = encodeURIComponent(`Your ticket for ${selected.value.name}`);
    const body    = encodeURIComponent(
      `Hi ${shareTicket.value.guestName},\n\n` +
      `Your ticket for "${selected.value.name}" has been saved to your device as "${file.name}".\n` +
      `Please attach that image to this email before sending.\n\n` +
      `Valid until: ${new Date(shareTicket.value.expiresAt).toLocaleDateString()}\n\n` +
      `Show the QR code at the entrance. See you there! 🎉`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  } finally { shareWorking.value = false; closeShare(); }
}

async function downloadImage() {
  if (!shareTicket.value || !selected.value) return;
  shareWorking.value = true;
  try {
    const file = await getShareFile(shareTicket.value);
    triggerDownload(file);
  } finally { shareWorking.value = false; closeShare(); }
}

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file);
  const a   = document.createElement('a');
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Stats ──────────────────────────────────────────────────────────────────
const expiredCount = computed(() => tickets.value.filter(t => new Date(t.expiresAt) < new Date()).length);
const usedCount    = computed(() => tickets.value.filter(t => t.used).length);
</script>

<template>
  <div v-if="!ready" style="text-align:center;padding:60px;color:var(--muted);">Loading…</div>
  <div v-else>
    <h1 style="font-size:1.1rem;font-weight:800;margin-bottom:16px;">🎫 Ticket Creator</h1>

    <!-- ── Party list ── -->
    <div class="card card-pad" style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div class="section-label" style="margin:0;">Your Parties</div>
        <button class="btn btn-primary btn-sm" @click="showPartyForm=!showPartyForm">
          {{ showPartyForm ? '✕' : '+ New party' }}
        </button>
      </div>

      <!-- New party form -->
      <div v-if="showPartyForm" style="background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:12px;">
        <div class="grid-2" style="margin-bottom:10px;">
          <div><label>Party name</label><input type="text" v-model="partyForm.name" placeholder="e.g. Summer Bash 2025" /></div>
          <div><label>Date</label><input type="date" v-model="partyForm.date" /></div>
        </div>
        <div style="margin-bottom:12px;">
          <div class="section-label">Drink menu starting point</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <label v-for="opt in [
              {v:'default', e:'🍹', t:'Default menu',       d:'Beer 20% · Spirits 60% · Wine 20%'},
              {v:'empty',   e:'✏️', t:'Start from scratch', d:'Empty categories to fill in'},
            ]" :key="opt.v"
              style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:140px;
                background:var(--surface);border:2px solid;border-radius:10px;padding:10px 14px;transition:border-color .15s;"
              :style="{borderColor:partyForm.menuTemplate===opt.v?'var(--indigo)':'var(--border2)'}">
              <input type="radio" v-model="partyForm.menuTemplate" :value="opt.v" style="width:auto;display:inline;" />
              <div>
                <div style="font-weight:700;font-size:.9rem;">{{ opt.e }} {{ opt.t }}</div>
                <div style="font-size:.75rem;color:var(--muted);margin-top:2px;">{{ opt.d }}</div>
              </div>
            </label>
          </div>
        </div>
        <button class="btn btn-success btn-full" @click="createParty">✅ Create party</button>
      </div>

      <!-- Party items -->
      <div v-if="!parties.length" style="color:var(--muted);font-size:.875rem;text-align:center;padding:20px;">
        No parties yet. Create one above.
      </div>
      <div v-for="p in parties" :key="p.id"
        :style="`display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;margin-bottom:4px;
          background:${selected?.id===p.id?'var(--border)':'transparent'};
          border:1px solid ${selected?.id===p.id?'var(--indigo)':'transparent'}`"
        @click="selectParty(p)">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ p.name }}</div>
          <div style="font-size:.75rem;color:var(--muted);">{{ p.date ? new Date(p.date).toLocaleDateString() : 'No date' }}</div>
        </div>
        <button class="btn btn-danger btn-sm" @click.stop="deleteParty(p)">✖</button>
      </div>
    </div>

    <!-- ── Selected party panel ── -->
    <template v-if="selected">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <h2 style="font-size:1rem;font-weight:700;margin:0;">🎟️ {{ selected.name }}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" @click="printTickets" :disabled="!tickets.length">
            🖨️ Print all
          </button>
          <button class="btn btn-primary btn-sm" @click="showGuestForm=!showGuestForm">
            {{ showGuestForm ? '✕' : '+ Add guest' }}
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid-3" style="margin-bottom:16px;">
        <div class="card card-pad" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:900;color:#4ade80;">{{ tickets.length }}</div>
          <div style="font-size:.75rem;color:var(--muted);">Total</div>
        </div>
        <div class="card card-pad" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:900;color:#818cf8;">{{ usedCount }}</div>
          <div style="font-size:.75rem;color:var(--muted);">Used</div>
        </div>
        <div class="card card-pad" style="text-align:center;">
          <div style="font-size:1.5rem;font-weight:900;color:#f87171;">{{ expiredCount }}</div>
          <div style="font-size:.75rem;color:var(--muted);">Expired</div>
        </div>
      </div>

      <!-- Add guest form -->
      <div v-if="showGuestForm" class="card card-pad" style="margin-bottom:12px;">
        <div class="grid-2" style="margin-bottom:8px;">
          <div><label>Guest name</label>
            <input type="text" v-model="guestForm.name" placeholder="e.g. Mario Rossi" @keyup.enter="addTicket" />
          </div>
          <div><label>Valid until</label>
            <input type="datetime-local" v-model="guestForm.expiresAt" />
          </div>
        </div>
        <button class="btn btn-success btn-full" @click="addTicket">🎫 Generate ticket</button>
      </div>

      <!-- Ticket list -->
      <div v-if="!tickets.length" style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">
        No tickets yet.
      </div>
      <div v-for="t in tickets" :key="t.id"
        style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <!-- QR preview -->
          <img v-if="qrImages[t.id!]" :src="qrImages[t.id!]"
            style="width:80px;height:80px;border-radius:6px;flex-shrink:0;background:#fff;" />
          <div v-else style="width:80px;height:80px;background:var(--surface2);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--muted);">…</div>

          <!-- Info -->
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:1rem;margin-bottom:2px;">{{ t.guestName }}</div>
            <div style="font-size:.75rem;color:var(--muted);margin-bottom:6px;">
              Valid until {{ new Date(t.expiresAt).toLocaleDateString() }}
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span v-if="t.used"
                style="font-size:.75rem;background:#14532d;color:#86efac;border-radius:20px;padding:2px 8px;font-weight:700;">✓ Used</span>
              <span v-else-if="new Date(t.expiresAt)<new Date()"
                style="font-size:.75rem;background:#7c2d12;color:#f87171;border-radius:20px;padding:2px 8px;font-weight:700;">Expired</span>
              <span v-else
                style="font-size:.75rem;background:#0c4a6e;color:#38bdf8;border-radius:20px;padding:2px 8px;font-weight:700;">Valid</span>
              <span style="font-size:.7rem;color:var(--muted);">#{{ t.id }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
            <button class="btn btn-primary btn-sm" @click="openShare(t)" title="Share ticket">📤</button>
            <button class="btn btn-danger btn-sm"  @click="deleteTicket(t)" title="Delete">✖</button>
          </div>
        </div>
      </div>
    </template>

    <div v-else style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">
      Select or create a party to manage tickets.
    </div>

    <!-- ══ SHARE OVERLAY ══ -->
    <div v-if="shareTicket"
      style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;
             display:flex;align-items:center;justify-content:center;padding:16px;"
      @click.self="closeShare">
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:18px;
                  padding:24px;width:100%;max-width:380px;">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-weight:800;font-size:1rem;">📤 Share ticket</div>
          <button class="btn btn-ghost btn-sm" @click="closeShare" :disabled="shareWorking">✕</button>
        </div>

        <!-- Preview -->
        <div style="text-align:center;margin-bottom:16px;">
          <img v-if="shareImg" :src="shareImg"
            style="width:120px;height:120px;border-radius:8px;border:2px solid var(--border2);background:#fff;" />
          <div style="font-weight:700;margin-top:8px;">{{ shareTicket.guestName }}</div>
          <div style="font-size:.8rem;color:var(--muted);">{{ selected?.name }}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:6px;">
            A PNG ticket image will be generated and attached
          </div>
        </div>

        <!-- Spinner while generating -->
        <div v-if="shareWorking" style="text-align:center;padding:20px;color:var(--muted);font-size:.9rem;">
          ⏳ Generating image…
        </div>

        <!-- Share buttons -->
        <div v-else style="display:flex;flex-direction:column;gap:10px;">

          <!-- Native OS share sheet (works best on mobile) -->
          <button class="btn btn-primary btn-full" @click="shareNative">
            📱 Share via…
          </button>

          <!-- WhatsApp -->
          <button class="btn btn-full"
            style="background:#25D366;color:#fff;font-weight:700;"
            @click="shareViaWhatsApp">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>

          <!-- Email -->
          <button class="btn btn-ghost btn-full" style="border:1px solid var(--border2);" @click="shareViaEmail">
            ✉️ Send via Email
          </button>

          <!-- Download only -->
          <button class="btn btn-ghost btn-full" style="border:1px solid var(--border2);" @click="downloadImage">
            🖼️ Download as Image
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
