import { reactive, toRaw } from 'vue';
import type { SessionDTO } from '../../shared/session';
import { canUse, type Feature } from '../../shared/tiers';
import { db } from '../lib/db';
import type { Device } from '../lib/device';
import {
  PartySession,
  type SessionStatus,
} from '../features/sync/partySession';
import { ANONYMOUS_SESSION } from '../features/account/session';
import type { Catalog, Party } from '../lib/types';

/**
 * The store's state and the one way to change a party.
 *
 * Its own module so the store's parts (sharing, the guest list) can share it
 * without importing the store, which imports them. Components never import
 * this: they go through `store.ts`.
 */

/**
 * Everything the screens read. The sync fields (`members`, `syncPending`, the
 * funnel's) are the open party's session's, which reports into it.
 */
export interface StoreState extends SessionStatus {
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
  device: Device;
  parties: Party[];
  catalog: Catalog | null;
  // modal context flags
  bottleFor: string | null;
  cocktailFor: { cat: string; spirit: string } | null;
  ingMgrOpen: boolean;
  shareOpen: boolean;
  /** The invite id whose ticket is open, if any. */
  ticketFor: number | null;
  /** The invite id whose Send sheet is open, if any. */
  sendTicketFor: number | null;
  addGuestOpen: boolean;
  /** The guest whose email and phone the add-guest sheet is editing, if any. */
  contactFor: number | null;
  doorOpen: boolean;
  scanResult: { ok: boolean; name: string; sub?: string } | null;
  scanHistory: { name: string; time: string }[];
  /** The feature whose upgrade prompt is open, or null. */
  upgradeFor: Feature | null;
  /** True while a publish/republish is in flight. */
  publishing: boolean;
  /** The co-organisers sheet. */
  membersOpen: boolean;
  publishError: string | null;
  // ui
  expandedCat: string | null;
  expandedSpirit: string | null;
}

export const state = reactive<StoreState>({
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
  contactFor: null,
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

export function activeParty(): Party | undefined {
  return state.parties.find((p) => p.id === state.activeId);
}

/** Whether the phone layout is on (lib/device.ts says when). */
export function isPhone(): boolean {
  return state.device === 'phone';
}

/** Writes a party to IndexedDB. */
async function persist(p: Party): Promise<void> {
  // `p` is a Vue reactive Proxy; IndexedDB's structured-clone step throws
  // DataCloneError on a Proxy, so hand Dexie the plain underlying object.
  await db.parties.put(structuredClone(toRaw(p)));
}

/**
 * Changes a party and saves it. Not sent to the server: for a change that came
 * from there, or one to a field that does not travel. Edits go through
 * `update`.
 */
export function save(party: Party, change: (p: Party) => void): void {
  change(party);
  void persist(party).catch((err) => {
    console.error('Failed to persist party changes', err);
  });
}

/**
 * The open shared party's sync: the push of local edits and the pulls of the
 * party and its funnel. Started and stopped with the party (`store.ts`).
 */
export const session = new PartySession({
  status: state,
  party: (id) => state.parties.find((p) => p.id === id),
  save,
});

/** Edits the open party: saves it and tells the sync engine. */
export function update(mutator: (p: Party) => void): void {
  const p = activeParty();
  if (!p) return;
  save(p, mutator);
  // Every edit goes through here, so this is the one place that has to tell the
  // sync engine something changed. It diffs against what the server is believed
  // to hold and sends only that, debounced — see features/sync/sync.ts.
  session.record(p);
}

/**
 * Whether the current session may use a paid feature.
 *
 * Every gate in the UI goes through here rather than reading `tier` directly,
 * so that self-hosting and a future third tier stay a change to
 * `shared/tiers.ts` instead of a hunt through components.
 */
export function can(feature: Feature): boolean {
  // The open party's features first — a free co-organiser of a Pro party gets
  // its Pro features — then the viewer's own. The rule lives in shared/tiers.ts.
  return canUse(
    feature,
    state.session.features,
    activeParty()?.publication?.features,
  );
}

/** Opens the "this needs BottleCount Pro" prompt for a locked feature. */
export function requestUpgrade(feature: Feature): void {
  state.upgradeFor = feature;
}
