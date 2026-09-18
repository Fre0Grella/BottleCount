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
import { fetchFunnel, mergeFunnel, setRemoteInviteStatus } from './invites';
import {
  applyDocument,
  documentOf,
  closeInviteLink,
  createCollaboratorInvite,
  deleteRemoteParty,
  fetchParty,
  listMembers,
  listParties,
  openInviteLink,
  removeMember,
  revokeCollaboratorInvites,
  storeParty,
} from './collab';
import { PartySync } from './sync';
import type { PartyMemberDTO, PartyRole } from '../../shared/collab';
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
  /** The active party's co-organisers, when it is on the server. */
  members: PartyMemberDTO[];
  /** The caller's role on the active party. Null when it is local-only. */
  role: PartyRole | null;
  /** True while local edits are waiting to reach the server. */
  syncPending: boolean;
  /** Set when a sync attempt failed. Cleared by the next success. */
  syncError: string | null;
  /** The co-organisers sheet. */
  membersOpen: boolean;
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
  members: [],
  role: null,
  syncPending: false,
  syncError: null,
  membersOpen: false,
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
  // Every edit goes through here, so this is the one place that has to tell the
  // sync engine something changed. It diffs against what the server is believed
  // to hold and sends only that, debounced — see lib/sync.ts.
  sync?.record(p);
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
  // A co-organiser's first sight of a party is here: they accepted an
  // invitation elsewhere, so it exists for them on the server and nowhere
  // locally. Failures are silent — the local parties still work.
  if (state.session.authenticated) {
    await syncPartyList().catch(() => {});
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

  const party = state.parties.find((p) => p.id === id);
  const publication = party?.publication;
  if (party && publication) {
    startSync(party, publication.version);
    void pull();
  }
}

function closeParty(): void {
  // Flush before tearing down, or the last edit before navigating home is the
  // one that never reaches the other organiser.
  void sync?.flush();
  stopSync();
  state.route = 'home';
  state.activeId = null;
}

async function deleteParty(id: number): Promise<void> {
  const party = state.parties.find((p) => p.id === id);
  // Deleting a shared party has to reach the server, or the co-organisers keep
  // it and it reappears here on the next list sync.
  const remoteId = party?.publication?.remoteId;
  if (remoteId) await deleteRemoteParty(remoteId);
  if (state.activeId === id) stopSync();

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

// ── Cloud sync & co-organisers ─────────────────────────────────────────────

/**
 * The sync engine for whichever party is open, or null.
 *
 * One at a time on purpose: only the open party is being edited, and a poll per
 * party in the list would be a lot of requests to learn nothing.
 */
let sync: PartySync | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;

const PULL_MS = 6000;

function stopSync(): void {
  sync?.stop();
  sync = null;
  if (pullTimer !== null) clearInterval(pullTimer);
  pullTimer = null;
  state.syncPending = false;
  state.members = [];
  state.role = null;
}

/** Applies a document that arrived from the server to the open party. */
function adoptDocument(
  document: Parameters<typeof applyDocument>[1],
  partyId: number,
): void {
  const p = state.parties.find((x) => x.id === partyId);
  if (!p) return;
  applyDocument(p, document);
  void persist(p);
}

async function persist(p: Party): Promise<void> {
  await db.parties.put(structuredClone(toRaw(p)));
}

/**
 * Starts pushing and pulling for the open party.
 *
 * Pulling is a poll rather than a socket: two organisers make a handful of
 * edits a minute between them, and a Durable Object to push those would cost
 * more to run and more to reason about than it saves.
 */
function startSync(party: Party, version: number): void {
  stopSync();
  const publication = party.publication;
  if (!publication || !party.id) return;

  const localId = party.id;
  sync = new PartySync(publication.remoteId, documentOf(party), version, {
    onRemoteDocument: (document) => adoptDocument(document, localId),
    onVersion: (v) => {
      state.syncError = null;
      if (party.publication) party.publication.version = v;
    },
    onError: (error) => {
      state.syncError = error;
    },
    onPendingChanged: (pending) => {
      state.syncPending = pending;
    },
  });

  pullTimer = setInterval(() => void pull(), PULL_MS);
}

/** Pulls the party, so somebody else's edits show up here. */
async function pull(): Promise<void> {
  const p = activeParty();
  const remoteId = p?.publication?.remoteId;
  if (!p || !remoteId || !sync) return;

  // Don't pull over our own unsent work — the push is about to make this
  // version stale anyway, and the merge would be doing it twice.
  if (sync.hasPending) return;

  const result = await fetchParty(remoteId);
  if (!result.ok || !result.value) return;

  const shared = result.value;
  state.members = shared.members;
  state.role = shared.role;
  if (shared.version !== sync.currentVersion) {
    sync.adopt(shared.document, shared.version);
  }
}

/**
 * Puts the active party on the server, which is what makes co-organisers and
 * the invite link possible. Idempotent.
 */
async function shareActiveParty(): Promise<boolean> {
  const p = activeParty();
  if (!p?.id) return false;
  if (!can('cloudSync')) {
    requestUpgrade('cloudSync');
    return false;
  }

  state.publishing = true;
  state.publishError = null;
  try {
    const result = await storeParty(p);
    if (!result.ok || !result.value) {
      state.publishError = result.error ?? 'share_failed';
      return false;
    }
    const shared = result.value;
    update((party) => {
      party.publication = {
        remoteId: shared.id,
        version: shared.version,
        slug: shared.publication?.slug ?? null,
        rootToken: shared.publication?.rootToken ?? null,
        publishedAt: shared.updatedAt,
      };
    });
    state.members = shared.members;
    state.role = shared.role;
    startSync(p, shared.version);
    return true;
  } finally {
    state.publishing = false;
  }
}

/** Opens the guest-facing invite link, storing the party first if need be. */
async function openPartyInviteLink(): Promise<boolean> {
  const p = activeParty();
  if (!p) return false;
  if (!p.publication && !(await shareActiveParty())) return false;

  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;

  state.publishing = true;
  try {
    const result = await openInviteLink(remoteId);
    if (!result.ok || !result.value) {
      state.publishError = result.error ?? 'publish_failed';
      return false;
    }
    update((party) => {
      if (!party.publication) return;
      party.publication.slug = result.value!.slug;
      party.publication.rootToken = result.value!.rootToken;
    });
    return true;
  } finally {
    state.publishing = false;
  }
}

/** Closes the link. Owner only; the server enforces it too. */
async function closePartyInviteLink(): Promise<boolean> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;

  const result = await closeInviteLink(remoteId);
  if (!result.ok) {
    state.publishError = result.error ?? 'unpublish_failed';
    return false;
  }
  update((party) => {
    if (!party.publication) return;
    party.publication.slug = null;
    party.publication.rootToken = null;
  });
  return true;
}

/** Stops sharing entirely: the party, its guests and its co-organisers. */
async function unshareActiveParty(): Promise<boolean> {
  const p = activeParty();
  const remoteId = p?.publication?.remoteId;
  if (!p || !remoteId) return false;

  const result = await deleteRemoteParty(remoteId);
  if (!result.ok) {
    state.publishError = result.error ?? 'unshare_failed';
    return false;
  }
  stopSync();
  update((party) => {
    party.publication = null;
  });
  return true;
}

// ── Co-organisers ──────────────────────────────────────────────────────────

async function refreshMembers(): Promise<void> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return;
  const result = await listMembers(remoteId);
  if (result.ok && result.value) state.members = result.value.members;
}

/** Mints a link that turns whoever opens it into a co-organiser. */
async function inviteCoOrganiser(): Promise<string | null> {
  const p = activeParty();
  if (!p) return null;
  if (!p.publication && !(await shareActiveParty())) return null;

  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return null;

  const result = await createCollaboratorInvite(remoteId);
  if (!result.ok || !result.value) {
    state.publishError = result.error ?? 'invite_failed';
    return null;
  }
  return result.value.token;
}

async function revokeCoOrganiserInvites(): Promise<boolean> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;
  const result = await revokeCollaboratorInvites(remoteId);
  return result.ok;
}

async function removeCoOrganiser(userId: string): Promise<boolean> {
  const remoteId = activeParty()?.publication?.remoteId;
  if (!remoteId) return false;
  const result = await removeMember(remoteId, userId);
  if (result.ok) await refreshMembers();
  return result.ok;
}

function openMembers(): void {
  if (!can('coOrganizers')) {
    requestUpgrade('coOrganizers');
    return;
  }
  state.membersOpen = true;
  void refreshMembers();
}

function closeMembers(): void {
  state.membersOpen = false;
}

/**
 * Pulls in parties shared with this user that this browser has never seen.
 *
 * A co-organiser's first sight of a party is here: they accepted an invitation
 * on another device (or in another tab), so it exists for them on the server
 * and nowhere locally.
 */
async function syncPartyList(): Promise<void> {
  if (!can('cloudSync') && !state.session.authenticated) return;

  const listed = await listParties();
  if (!listed.ok || !listed.value) return;

  for (const summary of listed.value.parties) {
    const known = state.parties.find(
      (p) => p.publication?.remoteId === summary.id,
    );
    if (known) continue;

    const fetched = await fetchParty(summary.id);
    if (!fetched.ok || !fetched.value) continue;

    const shared = fetched.value;
    const party: Party = {
      name: shared.document.name,
      date: shared.document.date,
      createdAt: shared.updatedAt,
      cover: shared.document.cover,
      venue: shared.document.venue,
      settings: shared.document.settings,
      menu: shared.document.menu as Party['menu'],
      locks: shared.document.locks,
      checked: shared.document.checked,
      allowForward: shared.document.allowForward,
      includeSnacks: shared.document.includeSnacks,
      // The guest list is not in the document; it arrives through the funnel.
      invites: [],
      publication: {
        remoteId: shared.id,
        version: shared.version,
        slug: shared.publication?.slug ?? null,
        rootToken: shared.publication?.rootToken ?? null,
        publishedAt: shared.updatedAt,
      },
    };
    const newId = await db.parties.add(party);
    party.id = newId as number;
    state.parties.push(party);
  }
}

// ── The funnel ─────────────────────────────────────────────────────────────

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
 * Silent on failure. This runs on a timer while the guests tab is open, and an
 * organiser whose phone dropped off the network should see the list they
 * already have rather than an error where their party used to be.
 */
async function syncFunnel(): Promise<void> {
  const p = activeParty();
  const remoteId = p?.publication?.remoteId;
  if (!p || !remoteId) return;

  state.funnelSyncing = true;
  try {
    const result = await fetchFunnel(remoteId);
    if (!result.ok || !result.value) return;
    const remote = result.value;

    const merged = mergeFunnel(p.invites, remote);
    // Most polls find nothing new. Committing anyway would write the whole
    // party to IndexedDB and re-render the guest list every few seconds for as
    // long as the tab is open, so only commit a list that actually differs.
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

  const partyRemoteId = party.publication?.remoteId;
  if (remoteId && partyRemoteId) {
    void setRemoteInviteStatus(partyRemoteId, remoteId, status);
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
  // Opening the link here rather than behind a separate button is what keeps
  // the card guests read in step with a party the host has since renamed.
  void openPartyInviteLink();
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
  // sharing, sync & the funnel
  shareActiveParty,
  unshareActiveParty,
  openPartyInviteLink,
  closePartyInviteLink,
  syncPartyList,
  syncFunnel,
  // co-organisers
  openMembers,
  closeMembers,
  refreshMembers,
  inviteCoOrganiser,
  revokeCoOrganiserInvites,
  removeCoOrganiser,
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
