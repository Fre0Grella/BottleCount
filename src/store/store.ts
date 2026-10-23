import { ticketState } from '../../shared/tickets';
import { deleteRemoteParty } from '../lib/api/parties';
import { defaultExtras, loadCatalog } from '../features/menu/catalog';
import { calculate, planFor, runsBar } from '../features/party/core';
import { db } from '../lib/db';
import { watchDevice } from '../lib/device';
import * as guests from '../features/guests/guestList';
import * as menu from '../features/menu/menu';
import * as partyCatalogs from '../features/menu/partyCatalog';
import { newParty, upgradeParty } from '../features/party/partyDefaults';
import { setMaxCapacity, toggleMaxCapacity } from '../features/party/planEdits';
import { fetchSession } from '../features/account/session';
import * as sharing from '../features/sharing/sharing';
import * as door from '../features/tickets/door';
import {
  activeParty,
  adoptLibrary,
  can,
  isPhone,
  requestUpgrade,
  session,
  state,
  update,
} from './storeState';
import { currentTheme, toggleTheme as switchTheme } from '../lib/theme';
import { findInvite } from '../features/tickets/ticket';
import type { CalculationResult, Catalog, Party, Settings } from '../lib/types';

/**
 * The planner's store: the reactive state every screen reads, and the actions
 * that change it.
 *
 * A facade. The state and the one write path live in `storeState.ts`; what a
 * change means lives with its subject — the menu maths in `menu.ts`, the guest
 * list in `guestList.ts`, sharing and co-organisers in `sharing.ts`, the open
 * party's sync in `partySession.ts`. This file wires them to the screens.
 */

// ── Loading ────────────────────────────────────────────────────────────────

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
    await sharing.syncPartyList().catch(() => {});
  }
}

let stopWatchingDevice: (() => void) | null = null;

async function load(): Promise<void> {
  state.catalog = await loadCatalog();

  // The database upgrade brought every stored party up to date (db.ts). This
  // catches anything it could not: a party it skipped, or one that arrived
  // since in an older shape.
  const parties = await db.parties.toArray();
  for (const party of parties) {
    try {
      const upgraded = upgradeParty(party);
      // A shared party takes its copies when it opens, so they are sent.
      const adopted = !party.publication && adoptLibrary(party);
      if (upgraded || adopted) await db.parties.put(party);
    } catch (err) {
      console.error('Failed to upgrade a stored party', err);
    }
  }
  state.parties = parties;

  // Deliberately not awaited: the planner is local-first and must render
  // without waiting on a network round-trip that may never come back. Paid
  // features stay locked until it does, which is the correct default.
  void refreshSession();

  // Resolved before first paint by the page's head script (src/lib/theme.ts).
  state.theme = currentTheme();

  stopWatchingDevice?.();
  stopWatchingDevice = watchDevice((device) => {
    state.device = device;
  });

  state.ready = true;
}

async function reloadCatalog(): Promise<void> {
  state.catalog = await loadCatalog();
}

/**
 * After an entry was saved to this browser's library from a picker: the open
 * party takes the edited entry too (features/menu/partyCatalog.ts).
 */
async function libraryEdited(kind: keyof Catalog, key: string): Promise<void> {
  await reloadCatalog();
  const library = state.catalog;
  if (library) {
    update((p) => partyCatalogs.takeFromLibrary(p, kind, key, library));
  }
}

/** What the open party's menu and costs read from. */
function partyCatalog(): Catalog | null {
  const p = activeParty();
  return p ? partyCatalogs.partyCatalog(p) : null;
}

/** What the pickers offer: the library, with the open party's copies. */
function pickerCatalog(): Catalog | null {
  return state.catalog
    ? partyCatalogs.pickerCatalog(state.catalog, activeParty())
    : null;
}

/** The snacks the open party buys. */
function snackNames(): string[] {
  const p = activeParty();
  return p ? partyCatalogs.snackNames(p, Object.keys(defaultExtras())) : [];
}

function toggleTheme(): void {
  state.theme = switchTheme();
}

// ── Party lifecycle ────────────────────────────────────────────────────────

async function createParty(): Promise<void> {
  const party = newParty();
  party.id = await db.parties.add(party);
  state.parties.push(party);
  openParty(party.id);
}

function openParty(id: number): void {
  state.activeId = id;
  state.route = 'party';
  state.tab = 'plan';

  // Pushes, pulls and the funnel, while it is open — for a shared party.
  const party = activeParty();
  if (party) session.start(party);
  // Entries only this browser has go into the party now, after the session
  // started, so they are sent like any edit.
  if (party && adoptLibrary(party)) update(() => {});
}

function closeParty(): void {
  // Flush before tearing down, or the last edit before navigating home is the
  // one that never reaches the other organiser.
  void session.flush();
  session.stop();
  state.route = 'home';
  state.activeId = null;
}

async function deleteParty(id: number): Promise<void> {
  const party = state.parties.find((p) => p.id === id);
  // Deleting a shared party has to reach the server, or the co-organisers keep
  // it and it reappears here on the next list sync.
  const remoteId = party?.publication?.remoteId;
  if (remoteId) await deleteRemoteParty(remoteId);
  if (state.activeId === id) session.stop();

  await db.parties.delete(id);
  const idx = state.parties.findIndex((p) => p.id === id);
  if (idx !== -1) state.parties.splice(idx, 1);
}

function setTab(tab: 'plan' | 'menu' | 'shop' | 'guests'): void {
  state.tab = tab;
}

// ── Plan, menu & shopping ──────────────────────────────────────────────────

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

/** The venue runs the bar, or the host does. Every drink screen follows this. */
function toggleBarManaged(): void {
  update((p) => {
    p.barManaged = !runsBar(p);
  });
}

function toggleChecked(name: string): void {
  update((p) => {
    p.checked[name] = !p.checked[name];
  });
}

/** A menu edit (`menu.ts`) as an edit to the open party. */
function onMenu<A extends unknown[]>(
  edit: (p: Party, ...args: A) => void,
): (...args: A) => void {
  return (...args) => update((p) => edit(p, ...args));
}

function menuErrors(): string[] {
  const p = activeParty();
  return p ? menu.menuErrorKeys(p.menu) : [];
}

// ── Calculation ────────────────────────────────────────────────────────────

const ZERO_RESULT: CalculationResult = {
  shopping_list: [],
  total_min: 0,
  total_max: 0,
  fixed_costs: 0,
  venue_fees: 0,
  revenue: 0,
  profit_min: 0,
  profit_max: 0,
  break_even: null,
};

/** Extras for a party — snacks are dropped when the party opts out. */
function extrasForParty(p: Party): Settings['extras'] {
  const all = defaultExtras();
  if (p.includeSnacks ?? true) return all;
  const cat = partyCatalogs.partyCatalog(p);
  const filtered: Settings['extras'] = {};
  for (const [name, cfg] of Object.entries(all)) {
    if (cat.ingredients[name]?.type === 'snack') continue;
    filtered[name] = cfg;
  }
  return filtered;
}

function calc(): CalculationResult {
  const p = activeParty();
  return p ? calcForParty(p) : ZERO_RESULT;
}

function calcForParty(p: Party): CalculationResult {
  const settings = {
    ...p.settings,
    extras: extrasForParty(p),
    menu: p.menu,
  };
  return calculate(
    planFor(settings, runsBar(p)),
    partyCatalogs.partyCatalog(p),
  );
}

// ── Modal openers/closers ──────────────────────────────────────────────────

function openMembers(): void {
  if (!can('coOrganizers')) {
    requestUpgrade('coOrganizers');
    return;
  }
  state.membersOpen = true;
  void sharing.refreshMembers();
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
  void sharing.openPartyInviteLink();
}

/**
 * Whether this guest may have their ticket made yet: they are coming and, on a
 * party guests pay for, an organiser has marked them as paid — checked here
 * rather than only by hiding buttons, so no screen can get round it.
 */
function ticketReady(inviteId: number): boolean {
  const party = activeParty();
  const invite = party && findInvite(party, inviteId);
  return !!invite && ticketState(invite, party) === 'live';
}

function openTicket(inviteId: number): void {
  if (ticketReady(inviteId)) state.ticketFor = inviteId;
}

function openSendTicket(inviteId: number): void {
  if (ticketReady(inviteId)) state.sendTicketFor = inviteId;
}

/** The add-guest sheet: for a new guest, or (`id`) where to send one's ticket. */
function openGuestSheet(id: number | null): void {
  state.contactFor = id;
  state.addGuestOpen = true;
}

// ── Singleton store ────────────────────────────────────────────────────────

export const store = {
  state,
  // theme
  toggleTheme,
  // layout
  isPhone,
  // party lifecycle
  activeParty,
  createParty,
  openParty,
  closeParty,
  deleteParty,
  // tab
  setTab,
  // persistence
  update,
  // menu
  rebalanceCategory: onMenu(menu.rebalanceCategory),
  rebalanceSpirit: onMenu(menu.rebalanceSpirit),
  rebalanceDrink: onMenu(menu.rebalanceDrink),
  toggleLock,
  toggleSnacks,
  toggleBarManaged,
  toggleMaxCapacity,
  setMaxCapacity,
  addBottle: onMenu(menu.addBottle),
  removeBottle: onMenu(menu.removeBottle),
  addCocktail: onMenu(menu.addCocktail),
  removeCocktail: onMenu(menu.removeCocktail),
  renameCocktailInMenu: onMenu(menu.renameCocktail),
  // calculation
  calc,
  calcForParty,
  menuErrors,
  reloadCatalog,
  libraryEdited,
  partyCatalog,
  pickerCatalog,
  snackNames,
  // loader
  load,
  // session & entitlements
  can,
  refreshSession,
  requestUpgrade,
  closeUpgrade(): void {
    state.upgradeFor = null;
  },
  // sharing, sync & the funnel
  shareActiveParty: sharing.shareActiveParty,
  unshareActiveParty: sharing.unshareActiveParty,
  openPartyInviteLink: sharing.openPartyInviteLink,
  closePartyInviteLink: sharing.closePartyInviteLink,
  syncPartyList: sharing.syncPartyList,
  syncFunnel: (): Promise<void> => session.syncFunnel(),
  // co-organisers
  openMembers,
  closeMembers(): void {
    state.membersOpen = false;
  },
  refreshMembers: sharing.refreshMembers,
  inviteCoOrganiser: sharing.inviteCoOrganiser,
  revokeCoOrganiserInvites: sharing.revokeCoOrganiserInvites,
  removeCoOrganiser: sharing.removeCoOrganiser,
  // invites
  addInvite: guests.addInvite,
  setInviteStatus: guests.setInviteStatus,
  setInviteContact: guests.setInviteContact,
  setInvitePaid: guests.setInvitePaid,
  checkInGuest: guests.checkInGuest,
  undoCheckIn: guests.undoCheckIn,
  // shopping
  toggleChecked,
  // modals
  openBottle(cat: string): void {
    state.bottleFor = cat;
  },
  closeBottle(): void {
    state.bottleFor = null;
  },
  openCocktail(cat: string, spirit: string): void {
    state.cocktailFor = { cat, spirit };
  },
  closeCocktail(): void {
    state.cocktailFor = null;
  },
  openIngMgr(): void {
    state.ingMgrOpen = true;
  },
  closeIngMgr(): void {
    state.ingMgrOpen = false;
  },
  openShare,
  closeShare(): void {
    state.shareOpen = false;
  },
  openTicket,
  closeTicket(): void {
    state.ticketFor = null;
  },
  openSendTicket,
  closeSendTicket(): void {
    state.sendTicketFor = null;
  },
  openAddGuest: (): void => openGuestSheet(null),
  openGuestContact: (id: number): void => openGuestSheet(id),
  closeAddGuest(): void {
    state.addGuestOpen = false;
    state.contactFor = null;
  },
  openDoor(): void {
    state.doorOpen = true;
  },
  closeDoor(): void {
    state.doorOpen = false;
    state.scanResult = null;
  },
  showScanResult: door.showScanResult,
  recordCheckIn: door.recordCheckIn,
};

export function useStore(): typeof store {
  return store;
}
