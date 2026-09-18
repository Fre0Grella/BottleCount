import { reactive, toRaw } from 'vue';
import type {
  Party,
  Catalog,
  CalculationResult,
  Invite,
  Settings,
} from './types';
import { db } from './db';
import { fetchSession, ANONYMOUS_SESSION } from './session';
import {
  fetchFunnel,
  mergeFunnel,
  publishParty,
  setRemoteInviteStatus,
  unpublishParty,
} from './invites';
import type { SessionDTO } from '../../shared/session';
import type { Feature } from '../../shared/tiers';
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
  /**
   * Who the browser is and what it may do. Starts anonymous, so the app is
   * usable before — and without — an answer from the server.
   */
  session: SessionDTO;
  /** True while the first /api/session call is in flight. */
  sessionLoading: boolean;
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
  addGuestOpen: boolean;
  doorOpen: boolean;
  scanResult: { ok: boolean; name: string; sub?: string } | null;
  scanHistory: { name: string; time: string }[];
  /** The feature whose upgrade prompt is open, or null. */
  upgradeFor: Feature | null;
  /** True while a publish/republish is in flight. */
  publishing: boolean;
  /** True while the funnel is being pulled. Never blocks the UI. */
  funnelSyncing: boolean;
  funnelSyncedAt: string | null;
  publishError: string | null;
  // ui
  expandedCat: string | null;
  expandedSpirit: string | null;
}

// ── Store implementation ───────────────────────────────────────────────────

const state = reactive<StoreState>({
  ready: false,
  session: ANONYMOUS_SESSION,
  sessionLoading: true,
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
  addGuestOpen: false,
  doorOpen: false,
  scanResult: null,
  scanHistory: [],
  upgradeFor: null,
  publishing: false,
  funnelSyncing: false,
  funnelSyncedAt: null,
  publishError: null,
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
  if (!p) return;
  // `p` is a Vue reactive Proxy; IndexedDB's structured-clone step throws
  // DataCloneError on a Proxy, so hand Dexie the plain underlying object.
  await db.parties.put(structuredClone(toRaw(p)));
}

function update(mutator: (p: Party) => void): void {
  const p = activeParty();
  if (!p) return;
  mutator(p);
  void persistActive().catch((err) => {
    console.error('Failed to persist party changes', err);
  });
}

/**
 * Whether the current session may use a paid feature.
 *
 * Every gate in the UI goes through here rather than reading `tier` directly,
 * so that self-hosting and a future third tier stay a change to
 * `shared/tiers.ts` instead of a hunt through components.
 */
function can(feature: Feature): boolean {
  return state.session.features[feature] === true;
}

/** Opens the "this needs BottleCount Pro" prompt for a locked feature. */
function requestUpgrade(feature: Feature): void {
  state.upgradeFor = feature;
}

function closeUpgrade(): void {
  state.upgradeFor = null;
}

/**
 * Re-reads the session. Called on load, and again after signing in or
 * redeeming a licence, since both change what the app may do.
 */
async function refreshSession(): Promise<void> {
  state.sessionLoading = true;
  try {
    state.session = await fetchSession();
  } finally {
    state.sessionLoading = false;
  }
}

async function load(): Promise<void> {
  state.catalog = await loadCatalog();
  state.parties = await db.parties.toArray();

  // Deliberately not awaited: the planner is local-first and must render
  // without waiting on a network round-trip that may never come back. Paid
  // features stay locked until it does, which is the correct default.
  void refreshSession();

  // Backfill fields added after a party was first saved.
  for (const p of state.parties) {
    if (p.settings.max_capacity === undefined) p.settings.max_capacity = null;
    if (p.includeSnacks === undefined) p.includeSnacks = true;
    if (p.publication === undefined) p.publication = null;

    // Invite statuses were renamed when guests gained the ability to answer for
    // themselves: "accepted" became "confirmed", and "pending" — which used to
    // mean a guest the host had not heard back from — became "opened", which
    // means someone followed the link and stopped there. Parties saved before
    // that still hold the old words, and the funnel counts nothing without this.
    for (const invite of p.invites) {
      const legacy = invite.status as string;
      if (legacy === 'accepted') invite.status = 'confirmed';
      else if (legacy === 'pending') invite.status = 'opened';
    }
  }

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
      max_capacity: null,
    },
    menu: defaultMenu,
    locks: {},
    checked: {},
    allowForward: true,
    includeSnacks: true,
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

function toggleSnacks(): void {
  update((p) => {
    p.includeSnacks = !(p.includeSnacks ?? true);
  });
}

function toggleMaxCapacity(): void {
  update((p) => {
    if (p.settings.max_capacity == null) {
      // Default the cap a little above the expected headcount.
      p.settings.max_capacity = Math.min(
        600,
        Math.max(p.settings.guests + 1, Math.round(p.settings.guests * 1.25)),
      );
    } else {
      p.settings.max_capacity = null;
    }
  });
}

function setMaxCapacity(v: number): void {
  update((p) => {
    p.settings.max_capacity = Math.max(1, Math.min(600, Math.round(v)));
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

/** Rename a cocktail key in the active menu, preserving its share. */
function renameCocktailInMenu(
  cat: string,
  spirit: string,
  oldName: string,
  newName: string,
): void {
  if (oldName === newName) return;
  update((p) => {
    const drinks = p.menu[cat]?.spirits[spirit]?.drinks;
    if (!drinks || drinks[oldName] === undefined) return;
    const pct = drinks[oldName];
    delete drinks[oldName];
    drinks[newName] = pct;
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

/** Extras for a party — snacks are dropped when the party opts out. */
function extrasForParty(p: Party): Settings['extras'] {
  const all = defaultExtras();
  if (p.includeSnacks ?? true) return all;
  const cat = state.catalog;
  const filtered: Settings['extras'] = {};
  for (const [name, cfg] of Object.entries(all)) {
    if (cat?.ingredients[name]?.type === 'snack') continue;
    filtered[name] = cfg;
  }
  return filtered;
}

function calc(): CalculationResult {
  const p = activeParty();
  if (!p || !state.catalog) return ZERO_RESULT;
  const settings = {
    ...p.settings,
    extras: extrasForParty(p),
    menu: p.menu,
  };
  return calculate(settings, state.catalog);
}

function calcForParty(p: Party): CalculationResult {
  if (!state.catalog) return ZERO_RESULT;
  const settings = {
    ...p.settings,
    extras: extrasForParty(p),
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

// ── Publishing & the funnel ────────────────────────────────────────────────

/**
 * Turns the invite link on, or refreshes what guests see.
 *
 * Called every time the share sheet opens, not only the first time: the host
 * may have renamed the party or moved the venue since, and the published card
 * is what guests read. Republishing keeps the slug, so links already sent
 * survive an edit.
 */
async function publishActiveParty(): Promise<boolean> {
  const p = activeParty();
  if (!p?.id) return false;

  state.publishing = true;
  state.publishError = null;
  try {
    const result = await publishParty(p);
    if (!result.ok || !result.value) {
      state.publishError = result.error ?? 'publish_failed';
      return false;
    }
    const { id, slug, rootToken, publishedAt } = result.value;
    update((party) => {
      party.publication = { remoteId: id, slug, rootToken, publishedAt };
    });
    return true;
  } finally {
    state.publishing = false;
  }
}

/**
 * Turns the link off. The server deletes the party and its invites, so anyone
 * holding a link gets a 404 from then on.
 *
 * Guests already merged into the local list are left alone rather than purged:
 * the host still has a party to run, and the people who said yes are still
 * coming. What they lose is the ability to change their answer.
 */
async function unpublishActiveParty(): Promise<boolean> {
  const p = activeParty();
  if (!p?.id) return false;

  const result = await unpublishParty(p.id);
  if (!result.ok) {
    state.publishError = result.error ?? 'unpublish_failed';
    return false;
  }
  update((party) => {
    party.publication = null;
  });
  return true;
}

/**
 * Whether a merge produced anything worth persisting.
 *
 * Compares only the fields the server owns — a local check-in is not a reason
 * to think the funnel moved.
 */
function sameInvites(before: Invite[], after: Invite[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((a, i) => {
    const b = after[i];
    return (
      b !== undefined &&
      a.id === b.id &&
      a.remoteId === b.remoteId &&
      a.name === b.name &&
      a.status === b.status &&
      a.depth === b.depth &&
      a.referrer === b.referrer &&
      a.forwardToken === b.forwardToken
    );
  });
}

/**
 * Pulls the funnel and folds it into the party's guest list.
 *
 * Silent on failure. This runs on a timer while the guests tab is open, and a
 * host whose phone dropped off the network should see the list they already
 * have rather than an error where their party used to be.
 */
async function syncFunnel(): Promise<void> {
  const p = activeParty();
  if (!p?.id || !p.publication) return;

  state.funnelSyncing = true;
  try {
    const result = await fetchFunnel(p.id);
    if (!result.ok || !result.value) return;
    const remote = result.value;

    const merged = mergeFunnel(p.invites, remote);
    // Most polls find nothing new. Committing anyway would write the whole
    // party to IndexedDB and re-render the guest list every twenty seconds for
    // as long as the tab is open, so only commit a list that actually differs.
    if (!sameInvites(p.invites, merged)) {
      update((party) => {
        party.invites = merged;
      });
    }
    state.funnelSyncedAt = new Date().toISOString();
  } finally {
    state.funnelSyncing = false;
  }
}

// ── Invites ────────────────────────────────────────────────────────────────

/**
 * A guest the host types in. Confirmed on the spot — the host would not be
 * typing them in otherwise — and deliberately carries no `remoteId`, which is
 * what keeps a funnel refresh from deleting them.
 */
function addInvite(name: string): void {
  update((p) => {
    const maxId =
      p.invites.length > 0 ? Math.max(...p.invites.map((i) => i.id)) : 0;
    p.invites.unshift({
      id: maxId + 1,
      name,
      status: 'confirmed',
      depth: 0,
      referrer: null,
      used: false,
    });
  });
}

/**
 * The host changing someone's state.
 *
 * Applied locally first so the button responds immediately, then pushed to the
 * server for guests who came through the link. Without that push the next poll
 * would overwrite the host's change with the guest's older answer — the button
 * would appear to work and then quietly undo itself.
 *
 * A failed push is not rolled back: the local list is what the host runs the
 * door from, and reverting a change they deliberately made because the network
 * hiccuped is the worse of the two wrong answers. The next successful sync
 * reconciles it.
 */
function setInviteStatus(id: number, status: Invite['status']): void {
  const party = activeParty();
  const invite = party?.invites.find((i) => i.id === id);
  if (!party || !invite) return;

  const { remoteId } = invite;

  update((p) => {
    const target = p.invites.find((i) => i.id === id);
    if (!target) return;
    target.status = status;
    // Someone who is no longer coming cannot have walked through the door.
    if (status !== 'confirmed') {
      target.used = false;
      target.usedAt = undefined;
    }
  });

  if (remoteId && party.id && party.publication) {
    void setRemoteInviteStatus(party.id, remoteId, status);
  }
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

/**
 * The invite link is the paid feature here, and the share sheet is the only way
 * to reach it — so the gate lives on the opener rather than inside the modal.
 * A second caller added later inherits it for free, which a check in the
 * component would not give us.
 */
function openShare(): void {
  if (!can('inviteLink')) {
    requestUpgrade('inviteLink');
    return;
  }
  state.shareOpen = true;
  // Not awaited: the sheet opens immediately and shows its own pending state.
  // Publishing here rather than behind a button is what keeps the card guests
  // read in step with a party the host has since renamed or moved.
  void publishActiveParty();
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

function openAddGuest(): void {
  state.addGuestOpen = true;
}
function closeAddGuest(): void {
  state.addGuestOpen = false;
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
  toggleSnacks,
  toggleMaxCapacity,
  setMaxCapacity,
  addBottle,
  removeBottle,
  addCocktail,
  removeCocktail,
  renameCocktailInMenu,
  // calculation
  calc,
  calcForParty,
  menuErrors,
  reloadCatalog,
  // loader
  load,
  // session & entitlements
  can,
  refreshSession,
  requestUpgrade,
  closeUpgrade,
  // publishing & funnel
  publishActiveParty,
  unpublishActiveParty,
  syncFunnel,
  // invites
  addInvite,
  setInviteStatus,
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
  openAddGuest,
  closeAddGuest,
  openDoor,
  closeDoor,
};

export function useStore(): typeof store {
  return store;
}
