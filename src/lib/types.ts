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
  id: number;
  name: string;
  status: 'accepted' | 'pending' | 'declined';
  depth: number;
  referrer: string | null;
  used: boolean;
  usedAt?: string;
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
  invites: Invite[];
}

export interface Ticket {
  id?: number;
  partyId: number;
  guestName: string;
  used: boolean;
  usedAt?: string;
  expiresAt: string;
}

export interface TicketQRPayload {
  ticketId: number;
  partyId: number;
  guestName: string;
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
