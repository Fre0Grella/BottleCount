<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { db, getKey } from '../lib/db';
import { signTicket } from '../lib/crypto';
import type { Party, Ticket, TicketQRPayload, PartyMenu, CategoryEntry, DrinkEntry, Catalog, Ingredient, Cocktail } from '../lib/types';
import QRCode from 'qrcode';
import defaultSettings from '../data/settings.json';
import defaultCatalog  from '../data/catalog.json';

// ── State ──────────────────────────────────────────────────────────────────
const parties  = ref<Party[]>([]);
const tickets  = ref<Ticket[]>([]);
const selected = ref<Party | null>(null);
const ready    = ref(false);

// View state: 'tickets' | 'menu'
const partyView = ref<'tickets' | 'menu'>('tickets');

// Forms
const partyForm      = ref({ name: '', date: '', menuTemplate: 'default' as 'default' | 'empty' });
const guestForm      = ref({ name: '', expiresAt: '' });
const showPartyForm  = ref(false);
const showGuestForm  = ref(false);

// QR image map: ticketId → data URL
const qrImages = ref<Record<number, string>>({});

// Share overlay
const shareTicket = ref<Ticket | null>(null);
const shareImg    = ref('');

// Party menu editor state
const catalog = ref<Catalog>(JSON.parse(JSON.stringify(defaultCatalog)) as Catalog);
const partyMenuSaving = ref(false);
const menuErrors = ref<string[]>([]);

const SIMPLE = new Set(['Beer', 'Wine']);
const BADGE: Record<string, string> = {
  spirit: 'badge-spirit', beer: 'badge-beer', wine: 'badge-wine',
  mixer: 'badge-mixer', snack: 'badge-snack', extra: 'badge-extra',
};

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();
  parties.value = await db.parties.toArray();
  if (parties.value.length) await selectParty(parties.value[0]);
  // Default expiry = tomorrow midnight
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59);
  guestForm.value.expiresAt = d.toISOString().slice(0, 16);

  // Load merged catalog for menu editor
  await reloadCatalog();
  ready.value = true;
});

async function reloadCatalog() {
  const hiddenIng    = await getKey<string[]>('hidden_ingredients',   []);
  const hiddenCock   = await getKey<string[]>('hidden_cocktails',     []);
  const personalIng  = await getKey<Record<string, Ingredient>>('personal_ingredients', {});
  const personalCock = await getKey<Record<string, Cocktail>>('personal_cocktails',   {});
  const overrides    = await getKey<Record<string, Partial<Ingredient>>>('price_overrides', {});

  const base = JSON.parse(JSON.stringify(defaultCatalog)) as Catalog;
  const ings: Record<string, Ingredient> = Object.fromEntries(
    Object.entries(base.ingredients).filter(([k]) => !hiddenIng.includes(k))
  ) as Record<string, Ingredient>;
  for (const [k, v] of Object.entries(overrides)) {
    if (ings[k]) ings[k] = { ...ings[k], ...v } as Ingredient;
  }
  Object.assign(ings, personalIng);
  const cocks: Record<string, Cocktail> = Object.fromEntries(
    Object.entries(base.cocktails).filter(([k]) => !hiddenCock.includes(k))
  ) as Record<string, Cocktail>;
  Object.assign(cocks, personalCock);
  catalog.value = { ingredients: ings, cocktails: cocks };
}

// ── Party helpers ──────────────────────────────────────────────────────────
function buildEmptyMenu(): PartyMenu {
  return {
    Beer:    { macro_pct: 0.2, spirits: {} },
    Spirits: { macro_pct: 0.6, spirits: {} },
    Wine:    { macro_pct: 0.2, spirits: {} },
  };
}

function buildDefaultMenu(): PartyMenu {
  return JSON.parse(JSON.stringify(defaultSettings.menu)) as PartyMenu;
}

async function createParty() {
  if (!partyForm.value.name.trim()) { alert('Party name required'); return; }
  const partyMenu: PartyMenu = partyForm.value.menuTemplate === 'empty'
    ? buildEmptyMenu()
    : buildDefaultMenu();

  const p: Party = {
    name:      partyForm.value.name.trim(),
    date:      partyForm.value.date,
    createdAt: new Date().toISOString(),
    partyMenu,
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
  partyView.value = 'tickets';
  tickets.value  = await db.tickets.where('partyId').equals(p.id!).toArray();
  for (const t of tickets.value) await ensureQR(t);
  validatePartyMenu();
}

// ── Party Menu persistence ─────────────────────────────────────────────────
async function savePartyMenu() {
  if (!selected.value) return;
  partyMenuSaving.value = true;
  await db.parties.update(selected.value.id!, { partyMenu: selected.value.partyMenu });
  partyMenuSaving.value = false;
}

function validatePartyMenu() {
  if (!selected.value?.partyMenu) { menuErrors.value = []; return; }
  const errs: string[] = [];
  const menu = selected.value.partyMenu;
  const macroSum = Object.values(menu).reduce((s, v) => s + v.macro_pct, 0);
  if (Math.abs(macroSum - 1.0) > 0.01)
    errs.push(`Categories sum = ${(macroSum * 100).toFixed(1)}% (must be 100%)`);
  for (const [cat, catData] of Object.entries(menu)) {
    const spSum = Object.values(catData.spirits).reduce((s, v) => s + v.pct, 0);
    if (Object.keys(catData.spirits).length && Math.abs(spSum - 1.0) > 0.01)
      errs.push(`[${cat}] spirits sum = ${(spSum * 100).toFixed(1)}%`);
    if (!SIMPLE.has(cat)) {
      for (const [sp, spData] of Object.entries(catData.spirits)) {
        const dSum = Object.values(spData.drinks ?? {}).reduce((s, v) => s + v, 0);
        if (Object.keys(spData.drinks ?? {}).length && Math.abs(dSum - 1.0) > 0.01)
          errs.push(`[${cat} → ${sp}] drinks sum = ${(dSum * 100).toFixed(1)}%`);
      }
    }
  }
  menuErrors.value = errs;
}

// Menu editor helpers ── all operate on selected.value.partyMenu
function pmSpiritsSum(cat: string) {
  const m = selected.value?.partyMenu;
  if (!m) return 0;
  return Object.values(m[cat]?.spirits ?? {}).reduce((s, v) => s + v.pct, 0);
}
function pmDrinksSum(cat: string, sp: string) {
  const m = selected.value?.partyMenu;
  if (!m) return 0;
  return Object.values(m[cat]?.spirits?.[sp]?.drinks ?? {}).reduce((s, v) => s + v, 0);
}
function pmMacroSum() {
  const m = selected.value?.partyMenu;
  if (!m) return 0;
  return Object.values(m).reduce((s, v) => s + v.macro_pct, 0);
}
function pctOk(v: number) { return Math.abs(v - 1.0) < 0.01; }

function pmAddSpirit(cat: string, name: string) {
  const m = selected.value?.partyMenu; if (!m || !name) return;
  if (m[cat].spirits[name] !== undefined) return;
  m[cat].spirits[name] = SIMPLE.has(cat) ? { pct: 0 } : { pct: 0, drinks: {} };
  validatePartyMenu();
}
function pmRemoveSpirit(cat: string, name: string) {
  const m = selected.value?.partyMenu; if (!m) return;
  delete m[cat].spirits[name]; validatePartyMenu();
}
function pmAddDrink(cat: string, sp: string, dk: string) {
  const m = selected.value?.partyMenu; if (!m || !dk) return;
  const ck = catalog.value.cocktails[dk];
  if (!ck || ck.main_spirit !== sp) return;
  const drinks = m[cat].spirits[sp].drinks!;
  if (drinks[dk] !== undefined) return;
  drinks[dk] = 0; validatePartyMenu();
}
function pmRemoveDrink(cat: string, sp: string, dk: string) {
  const m = selected.value?.partyMenu; if (!m) return;
  delete m[cat].spirits[sp].drinks![dk]; validatePartyMenu();
}
function cocktailsFor(spiritName: string) {
  return Object.entries(catalog.value.cocktails)
    .filter(([, ck]) => ck.main_spirit === spiritName).map(([n]) => n);
}
function spiritsByType(type: 'spirit' | 'beer' | 'wine') {
  return Object.entries(catalog.value.ingredients)
    .filter(([, ing]) => ing.type === type).map(([n]) => n);
}

// ── Ticket helpers ─────────────────────────────────────────────────────────
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
  qrImages.value[t.id] = await QRCode.toDataURL(signed, {
    width: 300, margin: 2, color: { dark: '#000', light: '#fff' }
  });
}

// ── Print ──────────────────────────────────────────────────────────────────
function printTickets() {
  if (!selected.value) return;
  const party = selected.value;
  const rows = tickets.value.map(t => {
    const qr = qrImages.value[t.id!] ?? '';
    return `
      <div class="ticket">
        <div class="party">${party.name}</div>
        <div class="date">${party.date ? new Date(party.date).toLocaleDateString() : ''}</div>
        <img src="${qr}" class="qr" />
        <div class="guest">${t.guestName}</div>
        <div class="exp">Valid until ${new Date(t.expiresAt).toLocaleDateString()}</div>
      </div>`;
  }).join('');
  const win = window.open('', '_blank')!;
  win.document.write(`<!DOCTYPE html><html><head><title>Tickets — ${party.name}</title>
  <style>
    body{font-family:system-ui;margin:0;background:#fff;color:#000;}
    .wrap{display:flex;flex-wrap:wrap;gap:12px;padding:20px;}
    .ticket{border:2px solid #000;border-radius:12px;padding:20px;width:280px;text-align:center;page-break-inside:avoid;}
    .party{font-size:1.3rem;font-weight:900;margin-bottom:4px;}
    .date{font-size:.85rem;color:#555;margin-bottom:12px;}
    .qr{width:200px;height:200px;display:block;margin:0 auto 12px;}
    .guest{font-size:1.1rem;font-weight:700;margin-bottom:4px;}
    .exp{font-size:.75rem;color:#777;}
    @media print{body{margin:0;}@page{margin:12mm;}}
  </style></head><body><div class="wrap">${rows}</div>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}

// ── Share ──────────────────────────────────────────────────────────────────
async function openShare(t: Ticket) {
  shareTicket.value = t;
  shareImg.value = qrImages.value[t.id!] ?? '';
}
function closeShare() { shareTicket.value = null; shareImg.value = ''; }

function shareViaEmail() {
  if (!shareTicket.value || !selected.value) return;
  const t = shareTicket.value;
  const subject = encodeURIComponent(`Your ticket for ${selected.value.name}`);
  const body = encodeURIComponent(
    `Hi ${t.guestName},\n\nYour ticket for "${selected.value.name}" is attached.\n` +
    `Valid until: ${new Date(t.expiresAt).toLocaleDateString()}\n\n` +
    `Please show the QR code at the entrance.\n\nSee you there! 🎉`
  );
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
}

function shareViaWhatsApp() {
  if (!shareTicket.value || !selected.value) return;
  const t = shareTicket.value;
  const text = encodeURIComponent(
    `🎫 *${selected.value.name}* — Ticket for *${t.guestName}*\n` +
    `Valid until: ${new Date(t.expiresAt).toLocaleDateString()}\n` +
    `Show the QR code at the entrance. See you there! 🎉`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

async function downloadTicketImage(t: Ticket) {
  if (!selected.value) return;
  const qr = qrImages.value[t.id!];
  if (!qr) return;

  // Build a canvas ticket image
  const canvas = document.createElement('canvas');
  canvas.width  = 400;
  canvas.height = 560;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0f0f1a';
  ctx.beginPath();
  roundRect(ctx, 0, 0, 400, 560, 20);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  roundRect(ctx, 4, 4, 392, 552, 18);
  ctx.stroke();

  // Party name
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(selected.value.name, 200, 52);

  // Date
  if (selected.value.date) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(new Date(selected.value.date).toLocaleDateString(), 200, 78);
  }

  // Separator
  ctx.strokeStyle = '#2d2d44';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(30, 94); ctx.lineTo(370, 94); ctx.stroke();

  // QR code
  const img = new Image();
  img.src = qr;
  await new Promise(res => { img.onload = res; });
  ctx.drawImage(img, 75, 106, 250, 250);

  // Guest name
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(t.guestName, 200, 392);

  // Valid until
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Valid until ${new Date(t.expiresAt).toLocaleDateString()}`, 200, 418);

  // Ticket ID
  ctx.fillStyle = '#475569';
  ctx.font = '12px monospace';
  ctx.fillText(`#${t.id}`, 200, 444);

  // Bottom emoji
  ctx.font = '28px system-ui';
  ctx.fillText('🎫', 200, 500);

  // Download
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `ticket_${t.guestName.replace(/\s+/g, '_')}_${selected.value.name.replace(/\s+/g, '_')}.png`;
  a.click();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

async function shareNative(t: Ticket) {
  if (!selected.value) return;
  const qr = qrImages.value[t.id!];
  if (!qr || !navigator.share) return;
  try {
    const res  = await fetch(qr);
    const blob = await res.blob();
    const file = new File([blob], `ticket_${t.id}.png`, { type: 'image/png' });
    await navigator.share({
      title: `Ticket for ${selected.value.name}`,
      text:  `🎫 Ticket for ${t.guestName} — ${selected.value.name}`,
      files: [file],
    });
  } catch { /* user cancelled */ }
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

        <!-- Menu template selector -->
        <div style="margin-bottom:12px;">
          <div class="section-label">Drink menu starting point</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:140px;
              background:var(--surface);border:2px solid;border-radius:10px;padding:10px 14px;
              transition:border-color .15s;"
              :style="{ borderColor: partyForm.menuTemplate==='default' ? 'var(--indigo)' : 'var(--border2)' }">
              <input type="radio" v-model="partyForm.menuTemplate" value="default" style="width:auto;display:inline;" />
              <div>
                <div style="font-weight:700;font-size:.9rem;">🍹 Default menu</div>
                <div style="font-size:.75rem;color:var(--muted);margin-top:2px;">Beer 20% / Spirits 60% / Wine 20%</div>
              </div>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:140px;
              background:var(--surface);border:2px solid;border-radius:10px;padding:10px 14px;
              transition:border-color .15s;"
              :style="{ borderColor: partyForm.menuTemplate==='empty' ? 'var(--indigo)' : 'var(--border2)' }">
              <input type="radio" v-model="partyForm.menuTemplate" value="empty" style="width:auto;display:inline;" />
              <div>
                <div style="font-weight:700;font-size:.9rem;">✏️ Start from scratch</div>
                <div style="font-size:.75rem;color:var(--muted);margin-top:2px;">Empty categories to fill in</div>
              </div>
            </label>
          </div>
        </div>

        <button class="btn btn-success btn-full" @click="createParty">✅ Create party</button>
      </div>

      <!-- Party items -->
      <div v-if="!parties.length" style="color:var(--muted);font-size:.875rem;text-align:center;padding:20px;">No parties yet. Create one above.</div>
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

    <!-- ── Selected party panel ── -->
    <template v-if="selected">
      <!-- Party tab switcher -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <h2 style="font-size:1rem;font-weight:700;margin:0;">{{ selected.name }}</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" :class="partyView==='tickets'?'btn-primary':'btn-ghost'" @click="partyView='tickets'">🎟️ Tickets</button>
          <button class="btn btn-sm" :class="partyView==='menu'?'btn-primary':'btn-ghost'" @click="partyView='menu'">🍹 Drink Menu</button>
        </div>
      </div>

      <!-- ══ TICKETS VIEW ══ -->
      <template v-if="partyView==='tickets'">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="btn btn-ghost btn-sm" @click="printTickets" :disabled="!tickets.length">🖨️ Print all</button>
          <button class="btn btn-primary btn-sm" @click="showGuestForm=!showGuestForm">
            {{ showGuestForm ? '✕' : '+ Add guest' }}
          </button>
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
            <div><label>Guest name</label><input type="text" v-model="guestForm.name" placeholder="e.g. Mario Rossi" @keyup.enter="addTicket" /></div>
            <div><label>Valid until</label><input type="datetime-local" v-model="guestForm.expiresAt" /></div>
          </div>
          <button class="btn btn-success btn-full" @click="addTicket">🎫 Generate ticket</button>
        </div>

        <!-- Ticket list -->
        <div v-if="!tickets.length" style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">No tickets yet.</div>
        <div v-for="t in tickets" :key="t.id"
          style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <!-- QR code -->
            <img v-if="qrImages[t.id!]" :src="qrImages[t.id!]" style="width:80px;height:80px;border-radius:6px;flex-shrink:0;" />
            <div v-else style="width:80px;height:80px;background:var(--surface2);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:var(--muted);">…</div>
            <!-- Info -->
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:1rem;margin-bottom:2px;">{{ t.guestName }}</div>
              <div style="font-size:.75rem;color:var(--muted);margin-bottom:6px;">
                Valid until {{ new Date(t.expiresAt).toLocaleDateString() }}
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <span v-if="t.used" style="font-size:.75rem;background:#14532d;color:#86efac;border-radius:20px;padding:2px 8px;font-weight:700;">✓ Used</span>
                <span v-else-if="new Date(t.expiresAt) < new Date()" style="font-size:.75rem;background:#7c2d12;color:#f87171;border-radius:20px;padding:2px 8px;font-weight:700;">Expired</span>
                <span v-else style="font-size:.75rem;background:#0c4a6e;color:#38bdf8;border-radius:20px;padding:2px 8px;font-weight:700;">Valid</span>
                <span style="font-size:.7rem;color:var(--muted);">#{{ t.id }}</span>
              </div>
            </div>
            <!-- Actions -->
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
              <button class="btn btn-primary btn-sm" @click="openShare(t)" title="Share ticket">📤</button>
              <button class="btn btn-danger btn-sm" @click="deleteTicket(t)" title="Delete">✖</button>
            </div>
          </div>
        </div>
      </template>

      <!-- ══ PARTY MENU VIEW ══ -->
      <template v-if="partyView==='menu' && selected.partyMenu">
        <div class="card card-pad" style="margin-bottom:12px;border-color:#6366f1;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:1rem;">🍹</span>
            <span style="font-weight:700;">{{ selected.name }} — Drink Menu</span>
          </div>
          <p style="font-size:.8rem;color:var(--muted);margin:0;">This menu is unique to this party. Adjust percentages and cocktails, then save.</p>
        </div>

        <!-- Errors -->
        <div v-if="menuErrors.length" class="card card-pad" style="border-color:var(--red);margin-bottom:12px;">
          <p style="color:#f87171;font-weight:700;margin-bottom:6px;">⚠️ Validation errors</p>
          <p v-for="e in menuErrors" :key="e" style="color:#fca5a5;font-size:.85rem;margin-bottom:2px;">• {{ e }}</p>
        </div>

        <!-- Macro split -->
        <div class="card card-pad" style="margin-bottom:12px;">
          <div class="section-label">Category Split (must = 100%)</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:10px;">
            <div v-for="(data, cat) in selected.partyMenu" :key="cat" style="flex:1;min-width:80px;">
              <label>{{ cat }}</label>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" :value="Math.round(data.macro_pct * 1000) / 10"
                  @input="(e) => { data.macro_pct = +((e.target as HTMLInputElement).value) / 100; validatePartyMenu(); }"
                  min="0" max="100" step="1" />
                <span style="color:var(--muted);white-space:nowrap;font-size:.85rem;">%</span>
              </div>
            </div>
          </div>
          <div style="font-size:.85rem;">
            Total: <span :class="pctOk(pmMacroSum()) ? 'ok' : 'err'">{{ (pmMacroSum()*100).toFixed(1) }}%</span>
          </div>
        </div>

        <!-- Per-category cards -->
        <div class="card" v-for="(catData, cat) in selected.partyMenu" :key="cat" style="margin-bottom:12px;">
          <div style="padding:14px 16px;font-weight:700;font-size:1rem;border-bottom:1px solid var(--border);">
            <span class="badge" :class="cat==='Spirits'?'badge-spirit':cat==='Beer'?'badge-beer':'badge-wine'">{{ cat }}</span>
            <span style="font-size:.8rem;color:var(--muted);margin-left:8px;">{{ (catData.macro_pct*100).toFixed(0) }}% of total</span>
          </div>
          <div style="padding:12px 16px;">

            <!-- Beer / Wine (simple) -->
            <template v-if="SIMPLE.has(cat as string)">
              <p style="font-size:.75rem;color:var(--muted);margin-bottom:10px;">Served as-is — set share per variety (must = 100%)</p>
              <div v-for="(spData, spName) in catData.spirits" :key="spName"
                style="background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <span style="font-weight:600;">{{ spName }}</span>
                  <button class="btn btn-danger btn-sm" @click="pmRemoveSpirit(cat as string, spName as string)">✖</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <input type="number" :value="Math.round(spData.pct*1000)/10"
                    @input="(e) => { spData.pct = +((e.target as HTMLInputElement).value)/100; validatePartyMenu(); }"
                    min="0" max="100" step="1" style="max-width:80px;" />
                  <span style="color:var(--muted);font-size:.85rem;">% of {{ cat }}</span>
                </div>
              </div>
              <div style="font-size:.85rem;margin-bottom:10px;">
                Total: <span :class="pctOk(pmSpiritsSum(cat as string)) ? 'ok' : 'err'">{{ (pmSpiritsSum(cat as string)*100).toFixed(1) }}%</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select :id="`pm_sel_${cat}`" style="flex:1;min-width:0;">
                  <option v-for="n in spiritsByType(cat==='Beer'?'beer':'wine')" :key="n" :value="n">{{ n }}</option>
                </select>
                <button class="btn btn-primary btn-sm"
                  @click="pmAddSpirit(cat as string, (document.getElementById(`pm_sel_${cat}`) as HTMLSelectElement)?.value)">
                  + Add
                </button>
              </div>
            </template>

            <!-- Spirits (3-level) -->
            <template v-else>
              <div v-for="(spData, spName) in catData.spirits" :key="spName"
                style="background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                  <span style="font-weight:700;">{{ spName }}</span>
                  <button class="btn btn-danger btn-sm" @click="pmRemoveSpirit(cat as string, spName as string)">✖</button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                  <input type="number" :value="Math.round(spData.pct*1000)/10"
                    @input="(e) => { spData.pct = +((e.target as HTMLInputElement).value)/100; validatePartyMenu(); }"
                    min="0" max="100" step="1" style="max-width:80px;" />
                  <span style="color:var(--muted);font-size:.85rem;">% of Spirits</span>
                </div>
                <div style="border-top:1px solid var(--border);padding-top:10px;">
                  <div class="section-label">Cocktails (must = 100%)</div>
                  <div v-for="(dkPct, dkName) in (spData.drinks ?? {})" :key="dkName"
                    style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                    <span style="flex:1;font-size:.85rem;color:#cbd5e1;min-width:100px;">{{ dkName }}</span>
                    <input type="number" :value="Math.round((dkPct as number)*1000)/10"
                      @input="(e) => { spData.drinks![dkName as string] = +((e.target as HTMLInputElement).value)/100; validatePartyMenu(); }"
                      min="0" max="100" step="1" style="max-width:72px;" />
                    <span style="color:var(--muted);font-size:.85rem;">%</span>
                    <button class="btn btn-danger btn-sm" @click="pmRemoveDrink(cat as string, spName as string, dkName as string)">✖</button>
                  </div>
                  <div style="font-size:.8rem;margin-bottom:8px;">
                    Total: <span :class="pctOk(pmDrinksSum(cat as string, spName as string)) ? 'ok' : 'err'">
                      {{ (pmDrinksSum(cat as string, spName as string)*100).toFixed(1) }}%
                    </span>
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <select :id="`pm_drink_${cat}_${spName}`" style="flex:1;min-width:0;">
                      <option v-for="ck in cocktailsFor(spName as string)" :key="ck" :value="ck">{{ ck }}</option>
                      <option v-if="cocktailsFor(spName as string).length===0" disabled>No cocktails for this spirit</option>
                    </select>
                    <button class="btn btn-primary btn-sm"
                      @click="pmAddDrink(cat as string, spName as string, (document.getElementById(`pm_drink_${cat}_${spName}`) as HTMLSelectElement)?.value)">
                      + Add drink
                    </button>
                  </div>
                </div>
              </div>
              <div style="font-size:.85rem;margin-bottom:10px;">
                Spirits total: <span :class="pctOk(pmSpiritsSum(cat as string)) ? 'ok' : 'err'">{{ (pmSpiritsSum(cat as string)*100).toFixed(1) }}%</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select :id="`pm_sp_${cat}`" style="flex:1;min-width:0;">
                  <option v-for="n in spiritsByType('spirit')" :key="n" :value="n">{{ n }}</option>
                </select>
                <button class="btn btn-primary btn-sm"
                  @click="pmAddSpirit(cat as string, (document.getElementById(`pm_sp_${cat}`) as HTMLSelectElement)?.value)">
                  + Add spirit
                </button>
              </div>
            </template>
          </div>
        </div>

        <button class="btn btn-success btn-full" @click="savePartyMenu" :disabled="partyMenuSaving">
          {{ partyMenuSaving ? 'Saving…' : '💾 Save party menu' }}
        </button>
      </template>
    </template>

    <div v-else-if="!selected" style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">
      Select or create a party to manage tickets.
    </div>

    <!-- ══ SHARE OVERLAY ══ -->
    <div v-if="shareTicket"
      style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;"
      @click.self="closeShare">
      <div style="background:var(--surface);border:1px solid var(--border2);border-radius:18px;padding:24px;width:100%;max-width:380px;">
        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-weight:800;font-size:1rem;">📤 Share ticket</div>
          <button class="btn btn-ghost btn-sm" @click="closeShare">✕</button>
        </div>

        <!-- QR preview -->
        <div style="text-align:center;margin-bottom:16px;">
          <img v-if="shareImg" :src="shareImg" style="width:140px;height:140px;border-radius:10px;border:2px solid var(--border2);" />
          <div style="font-weight:700;margin-top:8px;">{{ shareTicket.guestName }}</div>
          <div style="font-size:.8rem;color:var(--muted);">{{ selected?.name }}</div>
        </div>

        <!-- Share options -->
        <div style="display:flex;flex-direction:column;gap:10px;">
          <!-- Native share (mobile) -->
          <button v-if="typeof navigator !== 'undefined' && 'share' in navigator"
            class="btn btn-primary btn-full"
            @click="shareNative(shareTicket!); closeShare()">
            📱 Share via…
          </button>

          <!-- WhatsApp -->
          <button class="btn btn-full"
            style="background:#25D366;color:#fff;font-weight:700;"
            @click="shareViaWhatsApp(); closeShare()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </button>

          <!-- Email -->
          <button class="btn btn-ghost btn-full"
            style="border:1px solid var(--border2);"
            @click="shareViaEmail(); closeShare()">
            ✉️ Send via Email
          </button>

          <!-- Download image -->
          <button class="btn btn-ghost btn-full"
            style="border:1px solid var(--border2);"
            @click="downloadTicketImage(shareTicket!); closeShare()">
            🖼️ Download as Image
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
