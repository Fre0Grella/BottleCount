<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { db } from '../lib/db';
import { signTicket } from '../lib/crypto';
import type { Party, Ticket, TicketQRPayload } from '../lib/types';
import QRCode from 'qrcode';

// ── State ──────────────────────────────────────────────────────────────────
const parties  = ref<Party[]>([]);
const tickets  = ref<Ticket[]>([]);
const selected = ref<Party | null>(null);
const ready    = ref(false);

// Forms
const partyForm  = ref({ name: '', date: '' });
const guestForm  = ref({ name: '', expiresAt: '' });
const showPartyForm = ref(false);
const showGuestForm = ref(false);

// QR image map: ticketId → data URL
const qrImages = ref<Record<number, string>>({});

// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();
  parties.value = await db.parties.toArray();
  if (parties.value.length) await selectParty(parties.value[0]);
  // Default expiry = tomorrow midnight
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59);
  guestForm.value.expiresAt = d.toISOString().slice(0, 16);
  ready.value = true;
});

// ── Party helpers ──────────────────────────────────────────────────────────
async function createParty() {
  if (!partyForm.value.name.trim()) { alert('Party name required'); return; }
  const p: Party = {
    name:      partyForm.value.name.trim(),
    date:      partyForm.value.date,
    createdAt: new Date().toISOString(),
  };
  const id = await db.parties.add(p);
  p.id = id;
  parties.value.push(p);
  partyForm.value = { name: '', date: '' };
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
  // Generate QR codes
  for (const t of tickets.value) await ensureQR(t);
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
  qrImages.value[t.id] = await QRCode.toDataURL(signed, { width: 300, margin: 2, color: { dark: '#000', light: '#fff' } });
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
        <div class="grid-2" style="margin-bottom:8px;">
          <div><label>Party name</label><input type="text" v-model="partyForm.name" placeholder="e.g. Summer Bash 2025" /></div>
          <div><label>Date</label><input type="date" v-model="partyForm.date" /></div>
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

    <!-- ── Tickets for selected party ── -->
    <template v-if="selected">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <h2 style="font-size:1rem;font-weight:700;margin:0;">🎟️ {{ selected.name }}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" @click="printTickets" :disabled="!tickets.length">🖨️ Print all</button>
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
          <button class="btn btn-danger btn-sm" @click="deleteTicket(t)">✖</button>
        </div>
      </div>
    </template>

    <div v-else style="color:var(--muted);font-size:.875rem;text-align:center;padding:40px;">
      Select or create a party to manage tickets.
    </div>
  </div>
</template>
