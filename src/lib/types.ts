import type { InviteStatus } from '../../shared/invites';
import type { TicketQRPayload } from '../../shared/tickets';

/**
 * Re-exported so components import their types from one place. The states
 * themselves are the server's — see shared/invites.ts — because a guest's
 * answer is what sets them.
 */
export type { InviteStatus, TicketQRPayload };

// ── Catalog ────────────────────────────────────────────────────────────────

export type IngredientType =
  | 'spirit'
  | 'beer'
  | 'wine'
  | 'mixer'
  | 'extra'
  | 'snack';

export interface Ingredient {
  type: IngredientType;
  abv: number;
  volume_ml?: number;
  price_min: number;
  price_max: number;
  unit?: string;
  custom?: boolean;
}

export interface CocktailRecipeItem {
  quantity: number;
  unit?: string;
}

export interface Cocktail {
  main_spirit: string;
  category?: string;
  recipe: Record<string, CocktailRecipeItem>;
  custom?: boolean;
}

export interface Catalog {
  ingredients: Record<string, Ingredient>;
  cocktails: Record<string, Cocktail>;
}

// ── Settings ───────────────────────────────────────────────────────────────

export interface ExtraItem {
  qty_per_person: number;
  min_qty?: number;
}

export interface DrinkEntry {
  pct: number;
  drinks?: Record<string, number>;
}

export interface CategoryEntry {
  macro_pct: number;
  spirits: Record<string, DrinkEntry>;
}

export interface Settings {
  guests: number;
  ticket_price: number;
  venue_cost: number;
  equipment_cost: number;
  alcohol_ml_per_person: number;
  buffer: number;
  extras: Record<string, ExtraItem>;
  menu: Record<string, CategoryEntry>;
}

/** Per-party overrideable settings (guests, ticket price, venue, equipment) */
export interface PartySettings {
  guests: number;
  ticket_price: number;
  venue_cost: number;
  equipment_cost: number;
  alcohol_ml_per_person: number;
  buffer: number;
  /** Optional hard headcount cap. `null` when disabled. */
  max_capacity: number | null;
}

// ── Calculation output ─────────────────────────────────────────────────────

export interface ShoppingItem {
  name: string;
  type: string;
  quantity: number;
  unit: string;
  cost_min: number;
  cost_max: number;
}

export interface CalculationResult {
  shopping_list: ShoppingItem[];
  total_min: number;
  total_max: number;
  fixed_costs: number;
  revenue: number;
  profit_min: number;
  profit_max: number;
  break_even: number | null;
}

// ── Venue & Invites ────────────────────────────────────────────────────────

export interface Venue {
  place: string;
  city: string;
  time: string;
}

export interface Invite {
  /**
   * Stable within this browser. Server-backed invites keep the id they were
   * first merged under (see `remoteId`), so avatar colours and list keys do not
   * shuffle every time the funnel refreshes.
   */
  id: number;
  /** Empty until they answer — opening a link says nothing about who they are. */
  name: string;
  status: InviteStatus;
  /** 0 for the host's own link or a hand-typed guest, +1 per forward. */
  depth: number;
  /** The referrer's display name, or null at depth 0. */
  referrer: string | null;
  used: boolean;
  usedAt?: string;
  /**
   * Present only on invites that came from the link. Its absence is what marks
   * a guest the host typed in themselves, which is a free-tier feature and must
   * survive a funnel refresh.
   */
  remoteId?: string;
  /** This guest's own forward link token, once they have confirmed. */
  forwardToken?: string;
  /** The five characters on their ticket, when the party has a server. */
  ticketCode?: string;
  /** Whether an organiser typed them in rather than them RSVPing. */
  source?: 'link' | 'manual';
  openedAt?: string;
  answeredAt?: string;
}

// ── Tickets ────────────────────────────────────────────────────────────────

/** Drink menu stored per party — same shape as Settings['menu'] */
export type PartyMenu = Record<string, CategoryEntry>;

export interface Party {
  id?: number;
  name: string;
  date: string;
  createdAt: string;
  cover: number; // 0..5 index into COVERS
  venue: Venue;
  settings: PartySettings; // existing interface
  menu: PartyMenu; // existing type (Record<string, CategoryEntry>)
  locks: Record<string, boolean>; // keys 'm:Cat' and 's:Cat:Spirit'
  checked: Record<string, boolean>; // shopping check-off
  allowForward: boolean;
  includeSnacks: boolean; // include snack items in shopping/costs
  invites: Invite[];
  /**
   * Set once the host turns the invite link on. Holds what the browser needs to
   * build links and fetch the funnel; `null` (or absent, on a party saved
   * before this existed) means the party is local-only.
   */
  publication?: PartyPublication | null;
}

/**
 * Set once a party is stored server-side, which is what makes co-organisers
 * and the invite link possible. Its absence means the party is local-only.
 */
export interface PartyPublication {
  /** The party's id on the server. */
  remoteId: string;
  /** The document version this browser's copy was built from. */
  version: number;
  /**
   * The guest-facing link, or null when it has never been opened or has been
   * closed. Storing a party is not the same act as opening it to RSVPs, so
   * these are null for a party shared only with a co-organiser.
   */
  slug: string | null;
  /** The host's own link token. Guests who use it land at depth 0. */
  rootToken: string | null;
  /**
   * The party's ticket-signing key. Every organiser holds the same one, which
   * is what lets a second phone on the door verify a ticket the first issued.
   */
  ticketKey?: JsonWebKey | null;
  publishedAt: string;
}

export interface Ticket {
  id?: number;
  partyId: number;
  guestName: string;
  used: boolean;
  usedAt?: string;
  expiresAt: string;
}

// ── IndexedDB userdata keys ────────────────────────────────────────────────

export type UserDataKey =
  | 'personal_ingredients'
  | 'personal_cocktails'
  | 'hidden_ingredients'
  | 'hidden_cocktails'
  | 'price_overrides'
  | 'settings'
  | 'theme'
  | 'hmac_key';
