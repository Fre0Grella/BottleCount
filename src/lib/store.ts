import { reactive } from 'vue';
import type { Party, Catalog, CalculationResult, Invite } from './types';
import { db } from './db';
import { loadCatalog, defaultExtras } from './catalog';
import { calculate } from './core';
import { rebalance, menuErrorKeys } from './menu';
import settingsData from '../data/settings.json';

// ── Constants ──────────────────────────────────────────────────────────────

export const COVERS: { grad: string; emoji: string; label: string }[] = [
  {
    grad: 'linear-gradient(135deg,#FF7A3D,#FF3D77)',
    emoji: '🌇',
    label: 'Sunset',
  },
  {
    grad: 'linear-gradient(135deg,#7C3AED,#22D3EE)',
    emoji: '🪩',
    label: 'Neon',
  },
  {
    grad: 'linear-gradient(135deg,#0EA5E9,#22D3EE)',
    emoji: '🏖️',
    label: 'Pool',
  },
  {
    grad: 'linear-gradient(135deg,#16A34A,#84CC16)',
    emoji: '🌿',
    label: 'Garden',
  },
  {
    grad: 'linear-gradient(135deg,#1E293B,#6366F1)',
    emoji: '🌙',
    label: 'Midnight',
  },
  {
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)',
    emoji: '✨',
    label: 'Gold',
  },
];

export const VIBES: {
  ml: number;
  label: string;
  emoji: string;
  sub: string;
}[] = [
  { ml: 25, emoji: '🌿', label: 'Soft', sub: 'soft / barely-there' },
  { ml: 50, emoji: '🍹', label: 'Aperitivo', sub: 'chill / social' },
  { ml: 75, emoji: '🎉', label: 'Party', sub: 'classic / spirited' },
  { ml: 100, emoji: '🔥', label: 'Hardcore', sub: 'intense / open bar' },
];

export const BUFFERS: { v: number; label: string }[] = [
  { v: 1.0, label: 'Exact' },
  { v: 1.1, label: '+10%' },
  { v: 1.2, label: '+20%' },
];

export const SIMPLE: string[] = ['Beer', 'Wine'];

// ── State shape ────────────────────────────────────────────────────────────

interface StoreState {
  ready: boolean;
  route: 'home' | 'party';
  activeId: number | null;
  tab: 'plan' | 'menu' | 'shop' | 'guests';
  theme: 'dark' | 'light';
  device: 'desktop' | 'phone';
  parties: Party[];
  catalog: Catalog | null;
  // modal context flags
  bottleFor: string | null;
  cocktailFor: { cat: string; spirit: string } | null;
  ingMgrOpen: boolean;
  shareOpen: boolean;
  ticketFor: string | null;
  sendTicketFor: string | null;
  doorOpen: boolean;
  scanResult: { ok: boolean; name: string } | null;
  scanHistory: { name: string; time: string }[];
  // ui
  expandedCat: string | null;
  expandedSpirit: string | null;
}

// ── Store implementation ───────────────────────────────────────────────────

const state = reactive<StoreState>({
  ready: false,
  route: 'home',
  activeId: null,
  tab: 'plan',
  theme: 'dark',
  device: 'desktop',
  parties: [],
  catalog: null,
  bottleFor: null,
  cocktailFor: null,
  ingMgrOpen: false,
  shareOpen: false,
  ticketFor: null,
  sendTicketFor: null,
  doorOpen: false,
  scanResult: null,
  scanHistory: [],
  expandedCat: null,
  expandedSpirit: null,
});

function applyTheme(t: 'dark' | 'light'): void {
  document.documentElement.dataset['theme'] = t;
}

function setTheme(t: 'dark' | 'light'): void {
  state.theme = t;
  applyTheme(t);
  localStorage.setItem('bc-theme', t);
}

function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function activeParty(): Party | undefined {
  return state.parties.find((p) => p.id === state.activeId);
}

async function persistActive(): Promise<void> {
  const p = activeParty();
  if (p) await db.parties.put(p);
}

function update(mutator: (p: Party) => void): void {
  const p = activeParty();
  if (!p) return;
  mutator(p);
  void persistActive();
}

async function load(): Promise<void> {
  state.catalog = await loadCatalog();
  state.parties = await db.parties.toArray();

  const savedTheme = localStorage.getItem('bc-theme');
  const theme: 'dark' | 'light' = savedTheme === 'light' ? 'light' : 'dark';
  state.theme = theme;
  applyTheme(theme);

  state.device = window.innerWidth < 700 ? 'phone' : 'desktop';

  window.addEventListener('resize', () => {
    state.device = window.innerWidth < 700 ? 'phone' : 'desktop';
  });

  state.ready = true;
}

async function createParty(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const defaultMenu = structuredClone(
    (settingsData as { menu: Party['menu'] }).menu,
  );
  const newParty: Party = {
    name: 'New party',
    date: today,
    createdAt: nowIso,
    cover: 0,
    venue: { place: '', city: '', time: '21:00' },
    settings: {
      guests: 40,
      ticket_price: 15,
      venue_cost: 0,
      equipment_cost: 0,
      alcohol_ml_per_person: 50,
      buffer: 1.1,
    },
    menu: defaultMenu,
    locks: {},
    checked: {},
    allowForward: true,
    invites: [],
  };
  const newId = await db.parties.add(newParty);
  newParty.id = newId as number;
  state.parties.push(newParty);
  openParty(newId as number);
}

function openParty(id: number): void {
  state.activeId = id;
  state.route = 'party';
  state.tab = 'plan';
}

function closeParty(): void {
  state.route = 'home';
  state.activeId = null;
}

async function deleteParty(id: number): Promise<void> {
  await db.parties.delete(id);
  const idx = state.parties.findIndex((p) => p.id === id);
  if (idx !== -1) state.parties.splice(idx, 1);
}

function setTab(tab: 'plan' | 'menu' | 'shop' | 'guests'): void {
  state.tab = tab;
}

// ── Menu actions ───────────────────────────────────────────────────────────

function rebalanceCategory(cat: string, val: number): void {
  update((p) => {
    const entries: Record<string, { pct: number }> = {};
    for (const [k, v] of Object.entries(p.menu)) {
      entries[k] = { pct: v.macro_pct };
    }
    const locked = new Set<string>(
      Object.keys(p.locks)
        .filter((k) => k.startsWith('m:') && p.locks[k])
        .map((k) => k.slice(2)),
    );
    rebalance(entries, cat, val, locked);
    for (const [k, v] of Object.entries(entries)) {
      if (p.menu[k]) p.menu[k].macro_pct = v.pct;
    }
  });
}

function rebalanceSpirit(cat: string, spirit: string, val: number): void {
  update((p) => {
    const catEntry = p.menu[cat];
    if (!catEntry) return;
    const entries = catEntry.spirits as Record<string, { pct: number }>;
    const locked = new Set<string>(
      Object.keys(p.locks)
        .filter((k) => k.startsWith(`s:${cat}:`) && p.locks[k])
        .map((k) => k.slice(`s:${cat}:`.length)),
    );
    rebalance(entries, spirit, val, locked);
  });
}

function rebalanceDrink(
  cat: string,
  spirit: string,
  drink: string,
  val: number,
): void {
  update((p) => {
    const drinks = p.menu[cat]?.spirits[spirit]?.drinks;
    if (!drinks) return;
    const entries: Record<string, { pct: number }> = {};
    for (const [k, v] of Object.entries(drinks)) {
      entries[k] = { pct: v };
    }
    rebalance(entries, drink, val, new Set());
    for (const [k, v] of Object.entries(entries)) {
      drinks[k] = v.pct;
    }
  });
}

function toggleLock(key: string): void {
  update((p) => {
    p.locks[key] = !p.locks[key];
  });
}

function addBottle(cat: string, ingredientName: string): void {
  update((p) => {
    const catEntry = p.menu[cat];
    if (!catEntry) return;
    if (catEntry.spirits[ingredientName]) return;
    catEntry.spirits[ingredientName] = { pct: 0, drinks: {} };
    const entries = catEntry.spirits as Record<string, { pct: number }>;
    const count = Object.keys(entries).length;
    rebalance(entries, ingredientName, 1 / count, new Set());
  });
}

function removeBottle(cat: string, spirit: string): void {
  update((p) => {
    const catEntry = p.menu[cat];
    if (!catEntry || !catEntry.spirits[spirit]) return;
    delete catEntry.spirits[spirit];
    const entries = catEntry.spirits as Record<string, { pct: number }>;
    const remaining = Object.keys(entries);
    if (remaining.length > 0) {
      const share = 1 / remaining.length;
      for (const k of remaining) entries[k].pct = share;
    }
  });
}

function addCocktail(cat: string, spirit: string, name: string): void {
  update((p) => {
    const spiritEntry = p.menu[cat]?.spirits[spirit];
    if (!spiritEntry) return;
    if (!spiritEntry.drinks) spiritEntry.drinks = {};
    if (spiritEntry.drinks[name] !== undefined) return;
    spiritEntry.drinks[name] = 0;
    const entries: Record<string, { pct: number }> = {};
    for (const [k, v] of Object.entries(spiritEntry.drinks)) {
      entries[k] = { pct: v };
    }
    const count = Object.keys(entries).length;
    rebalance(entries, name, 1 / count, new Set());
    for (const [k, v] of Object.entries(entries)) {
      spiritEntry.drinks![k] = v.pct;
    }
  });
}

function removeCocktail(cat: string, spirit: string, drink: string): void {
  update((p) => {
    const drinks = p.menu[cat]?.spirits[spirit]?.drinks;
    if (!drinks || drinks[drink] === undefined) return;
    delete drinks[drink];
    const remaining = Object.keys(drinks);
    if (remaining.length > 0) {
      const share = 1 / remaining.length;
      for (const k of remaining) drinks[k] = share;
    }
  });
}

// ── Calculation ────────────────────────────────────────────────────────────

const ZERO_RESULT: CalculationResult = {
  shopping_list: [],
  total_min: 0,
  total_max: 0,
  fixed_costs: 0,
  revenue: 0,
  profit_min: 0,
  profit_max: 0,
  break_even: null,
};

function calc(): CalculationResult {
  const p = activeParty();
  if (!p || !state.catalog) return ZERO_RESULT;
  const settings = {
    ...p.settings,
    extras: defaultExtras(),
    menu: p.menu,
  };
  return calculate(settings, state.catalog);
}

function calcForParty(p: Party): CalculationResult {
  if (!state.catalog) return ZERO_RESULT;
  const settings = {
    ...p.settings,
    extras: defaultExtras(),
    menu: p.menu,
  };
  return calculate(settings, state.catalog);
}

function menuErrors(): string[] {
  const p = activeParty();
  if (!p) return [];
  return menuErrorKeys(p.menu);
}

async function reloadCatalog(): Promise<void> {
  state.catalog = await loadCatalog();
}

// ── Invites ────────────────────────────────────────────────────────────────

function addInvite(name: string): void {
  update((p) => {
    const maxId =
      p.invites.length > 0 ? Math.max(...p.invites.map((i) => i.id)) : 0;
    p.invites.unshift({
      id: maxId + 1,
      name,
      status: 'accepted',
      depth: 0,
      referrer: null,
      used: false,
    });
  });
}

function setInviteStatus(id: number, status: Invite['status']): void {
  update((p) => {
    const invite = p.invites.find((i) => i.id === id);
    if (invite) {
      invite.status = status;
      if (status !== 'accepted') {
        invite.used = false;
        invite.usedAt = undefined;
      }
    }
  });
}

function simulateSpread(): void {
  const FRIENDS = [
    'Alex',
    'Sam',
    'Jordan',
    'Mika',
    'Robin',
    'Teo',
    'Lia',
    'Noa',
    'Vale',
    'Kai',
    'Remy',
    'Sole',
    'Gio',
    'Bea',
  ];
  update((p) => {
    const accepted = p.invites.filter(
      (i) => i.status === 'accepted' && i.depth < 2,
    );
    let nid =
      p.invites.length > 0 ? Math.max(...p.invites.map((i) => i.id)) + 1 : 1;
    const senders = accepted.sort(() => Math.random() - 0.5).slice(0, 2);
    for (const src of senders) {
      const nm =
        FRIENDS[Math.floor(Math.random() * FRIENDS.length)] +
        ' ' +
        String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
        '.';
      p.invites.unshift({
        id: nid++,
        name: nm,
        status: 'pending',
        depth: Math.min(2, src.depth + 1),
        referrer: src.name,
        used: false,
      });
    }
    const pending = p.invites.filter((i) => i.status === 'pending');
    if (pending.length > 0) {
      pending[Math.floor(Math.random() * pending.length)].status = 'accepted';
    }
  });
}

function checkInGuest(id: number, time: string): void {
  update((p) => {
    const invite = p.invites.find((i) => i.id === id);
    if (invite) {
      invite.used = true;
      invite.usedAt = time;
    }
  });
}

// ── Shopping ───────────────────────────────────────────────────────────────

function toggleChecked(name: string): void {
  update((p) => {
    p.checked[name] = !p.checked[name];
  });
}

// ── Modal openers/closers ──────────────────────────────────────────────────

function openBottle(cat: string): void {
  state.bottleFor = cat;
}
function closeBottle(): void {
  state.bottleFor = null;
}

function openCocktail(cat: string, spirit: string): void {
  state.cocktailFor = { cat, spirit };
}
function closeCocktail(): void {
  state.cocktailFor = null;
}

function openIngMgr(): void {
  state.ingMgrOpen = true;
}
function closeIngMgr(): void {
  state.ingMgrOpen = false;
}

function openShare(): void {
  state.shareOpen = true;
}
function closeShare(): void {
  state.shareOpen = false;
}

function openTicket(name: string): void {
  state.ticketFor = name;
}
function closeTicket(): void {
  state.ticketFor = null;
}

function openSendTicket(name: string): void {
  state.sendTicketFor = name;
}
function closeSendTicket(): void {
  state.sendTicketFor = null;
}

function openDoor(): void {
  state.doorOpen = true;
}
function closeDoor(): void {
  state.doorOpen = false;
  state.scanResult = null;
}

// ── Singleton store ────────────────────────────────────────────────────────

export const store = {
  state,
  // theme
  setTheme,
  toggleTheme,
  // party lifecycle
  activeParty,
  createParty,
  openParty,
  closeParty,
  deleteParty,
  // tab
  setTab,
  // persistence
  persistActive,
  update,
  // menu
  rebalanceCategory,
  rebalanceSpirit,
  rebalanceDrink,
  toggleLock,
  addBottle,
  removeBottle,
  addCocktail,
  removeCocktail,
  // calculation
  calc,
  calcForParty,
  menuErrors,
  reloadCatalog,
  // loader
  load,
  // invites
  addInvite,
  setInviteStatus,
  simulateSpread,
  checkInGuest,
  // shopping
  toggleChecked,
  // modals
  openBottle,
  closeBottle,
  openCocktail,
  closeCocktail,
  openIngMgr,
  closeIngMgr,
  openShare,
  closeShare,
  openTicket,
  closeTicket,
  openSendTicket,
  closeSendTicket,
  openDoor,
  closeDoor,
};

export function useStore(): typeof store {
  return store;
}
