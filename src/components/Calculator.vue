<script setup lang="ts">
import { ref, computed, watch, onMounted, toRaw } from 'vue';
import { db, getKey, setKey } from '../lib/db';
import { calculate, validateMenu, ALCOHOL_LEVELS } from '../lib/core';
import type {
  Settings,
  Catalog,
  CalculationResult,
  Ingredient,
  Cocktail,
  Party,
  PartyMenu,
  PartySettings,
} from '../lib/types';

import defaultCatalog from '../data/catalog.json';
import defaultSettings from '../data/settings.json';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SIMPLE = new Set(['Beer', 'Wine']);
const BADGE: Record<string, string> = {
  spirit: 'badge-spirit',
  beer: 'badge-beer',
  wine: 'badge-wine',
  mixer: 'badge-mixer',
  snack: 'badge-snack',
  extra: 'badge-extra',
};

// ─────────────────────────────────────────────────────────────────────────────
// Party switcher state
// ─────────────────────────────────────────────────────────────────────────────
const parties = ref<Party[]>([]);
/** null = global/default, number = party id */
const selectedPartyId = ref<number | null>(null);

const selectedParty = computed<Party | null>(
  () => parties.value.find((p) => p.id === selectedPartyId.value) ?? null,
);

// ─────────────────────────────────────────────────────────────────────────────
// Active settings & menu — always the reactive working copy
// ─────────────────────────────────────────────────────────────────────────────
const globalSettings = ref<Settings>(
  JSON.parse(JSON.stringify(defaultSettings)) as Settings,
);

/**
 * What the calculator tabs actually see.
 * When global: points to globalSettings.
 * When party:  points to a merged object (party overrides on top of global).
 */
const settings = ref<Settings>(
  JSON.parse(JSON.stringify(defaultSettings)) as Settings,
);

function makeDefaultPartySettings(): PartySettings {
  return {
    guests: globalSettings.value.guests,
    ticket_price: globalSettings.value.ticket_price,
    venue_cost: globalSettings.value.venue_cost,
    equipment_cost: globalSettings.value.equipment_cost,
    alcohol_ml_per_person: globalSettings.value.alcohol_ml_per_person,
    buffer: globalSettings.value.buffer,
  };
}

/** Called whenever selectedPartyId changes — swaps the working settings/menu */
function syncActiveConfig() {
  const p = selectedParty.value;
  if (!p) {
    // Global mode: use globalSettings directly
    settings.value = globalSettings.value;
    return;
  }
  // Party mode: merge global base with party overrides
  const ps: PartySettings = p.partySettings ?? makeDefaultPartySettings();
  const pm: PartyMenu =
    p.partyMenu ?? JSON.parse(JSON.stringify(defaultSettings.menu));
  settings.value = {
    ...globalSettings.value, // carries extras (snacks etc.)
    guests: ps.guests,
    ticket_price: ps.ticket_price,
    venue_cost: ps.venue_cost,
    equipment_cost: ps.equipment_cost,
    alcohol_ml_per_person: ps.alcohol_ml_per_person,
    buffer: ps.buffer,
    menu: pm,
  };
}

watch(selectedPartyId, syncActiveConfig);

// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────
const catalog = ref<Catalog>(
  JSON.parse(JSON.stringify(defaultCatalog)) as Catalog,
);

// ─────────────────────────────────────────────────────────────────────────────
// UI state
// ─────────────────────────────────────────────────────────────────────────────
const ready = ref(false);
const saving = ref(false);
const activeTab = ref<'settings' | 'menu' | 'catalog'>('settings');

// Catalog sub-state
const catSection = ref<'ingredients' | 'cocktails'>('ingredients');
const showIngForm = ref(false);
const showCkForm = ref(false);
const savingPrice = ref<string | null>(null);
const priceEdits = ref<Record<string, { min: number; max: number }>>({});

const ingForm = ref({
  name: '',
  type: 'spirit',
  abv: 0,
  volume_ml: 700,
  unit: 'ml',
  price_min: 0,
  price_max: 0,
});
const ckForm = ref({ name: '', main_spirit: '', category: 'Spirits' });
const ckRecipe = ref<Record<string, { quantity: number; unit: string }>>({});
const ckIngSel = ref('');
const ckIngQty = ref(50);
const ckIngUnit = ref('ml');

// Party menu validation
const partyMenuErrors = ref<string[]>([]);
const partyMenuSaving = ref(false);

// ─────────────────────────────────────────────────────────────────────────────
// Drink menu select state — replaces document.getElementById pattern
// ─────────────────────────────────────────────────────────────────────────────
/** Selected spirit/variety to add, keyed by category name */
const selSpirit = ref<Record<string, string>>({});
/** Selected cocktail to add, keyed by `${cat}__${spName}` */
const selDrink = ref<Record<string, string>>({});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();
  const saved = await getKey<Settings | null>('settings', null);
  if (saved) globalSettings.value = saved;
  settings.value = globalSettings.value; // start in global mode
  await reloadCatalog();
  parties.value = await db.parties.toArray();
  ready.value = true;
});

async function reloadCatalog() {
  const hiddenIng = await getKey<string[]>('hidden_ingredients', []);
  const hiddenCock = await getKey<string[]>('hidden_cocktails', []);
  const personalIng = await getKey<Record<string, Ingredient>>(
    'personal_ingredients',
    {},
  );
  const personalCock = await getKey<Record<string, Cocktail>>(
    'personal_cocktails',
    {},
  );
  const overrides = await getKey<Record<string, Partial<Ingredient>>>(
    'price_overrides',
    {},
  );

  const base = JSON.parse(JSON.stringify(defaultCatalog)) as Catalog;
  const ings: Record<string, Ingredient> = Object.fromEntries(
    Object.entries(base.ingredients).filter(([k]) => !hiddenIng.includes(k)),
  ) as Record<string, Ingredient>;
  for (const [k, v] of Object.entries(overrides)) {
    if (ings[k]) ings[k] = { ...ings[k], ...v } as Ingredient;
  }
  Object.assign(ings, personalIng);

  const cocks: Record<string, Cocktail> = Object.fromEntries(
    Object.entries(base.cocktails).filter(([k]) => !hiddenCock.includes(k)),
  ) as Record<string, Cocktail>;
  Object.assign(cocks, personalCock);

  catalog.value = { ingredients: ings, cocktails: cocks };

  for (const [name, ing] of Object.entries(ings)) {
    if (!priceEdits.value[name])
      priceEdits.value[name] = { min: ing.price_min, max: ing.price_max };
  }
  const spirits = Object.entries(ings).filter(([, i]) => i.type === 'spirit');
  if (spirits.length && !ckForm.value.main_spirit)
    ckForm.value.main_spirit = spirits[0][0];
  if (Object.keys(ings).length && !ckIngSel.value)
    ckIngSel.value = Object.keys(ings)[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Computed
// ─────────────────────────────────────────────────────────────────────────────
const errors = computed(() => validateMenu(settings.value.menu));
const result = computed<CalculationResult | null>(() =>
  errors.value.length === 0 ? calculate(settings.value, catalog.value) : null,
);
const alcoholLabel = computed(
  () => ALCOHOL_LEVELS[settings.value.alcohol_ml_per_person] ?? '',
);

const isGlobal = computed(() => selectedPartyId.value === null);
const modeLabel = computed(() =>
  isGlobal.value ? 'Global defaults' : (selectedParty.value?.name ?? ''),
);
const saveLabel = computed(() => {
  if (activeTab.value === 'catalog') return null;
  if (activeTab.value === 'settings')
    return isGlobal.value
      ? '💾 Save global settings'
      : `💾 Save ${modeLabel.value}`;
  return isGlobal.value
    ? '💾 Save global menu'
    : `💾 Save ${modeLabel.value} menu`;
});

// ─────────────────────────────────────────────────────────────────────────────
// Save
// ─────────────────────────────────────────────────────────────────────────────
async function handleSave() {
  saving.value = true;
  try {
    if (isGlobal.value) {
      // toRaw() strips the Vue reactive Proxy so IndexedDB can structured-clone it
      await setKey('settings', toRaw(globalSettings.value));
    } else {
      const p = selectedParty.value!;
      // Extract partySettings fields from the working copy and strip proxies
      const ps: PartySettings = toRaw({
        guests: settings.value.guests,
        ticket_price: settings.value.ticket_price,
        venue_cost: settings.value.venue_cost,
        equipment_cost: settings.value.equipment_cost,
        alcohol_ml_per_person: settings.value.alcohol_ml_per_person,
        buffer: settings.value.buffer,
      });
      const pm: PartyMenu = toRaw(settings.value.menu);
      // Update DB and local ref
      await db.parties.update(p.id!, { partySettings: ps, partyMenu: pm });
      // Patch the local party object so it stays in sync
      const idx = parties.value.findIndex((x) => x.id === p.id);
      if (idx >= 0) {
        parties.value[idx] = {
          ...parties.value[idx],
          partySettings: ps,
          partyMenu: pm,
        };
      }
    }
  } finally {
    saving.value = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Party switcher helpers
// ─────────────────────────────────────────────────────────────────────────────
function selectPartyId(id: number | null) {
  selectedPartyId.value = id;
  partyMenuErrors.value = [];
  // Tab goes back to settings when switching context
  if (activeTab.value === 'catalog') return; // keep catalog open if that's what user was viewing
  activeTab.value = 'settings';
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu helpers (operate on settings.value.menu — already the right one)
// ─────────────────────────────────────────────────────────────────────────────
function spiritsSum(cat: string) {
  return Object.values(settings.value.menu[cat]?.spirits ?? {}).reduce(
    (s, v) => s + v.pct,
    0,
  );
}
function drinksSum(cat: string, sp: string) {
  return Object.values(
    settings.value.menu[cat]?.spirits?.[sp]?.drinks ?? {},
  ).reduce((s, v) => s + v, 0);
}
function macroSum() {
  return Object.values(settings.value.menu).reduce(
    (s, v) => s + v.macro_pct,
    0,
  );
}
function pctOk(v: number) {
  return Math.abs(v - 1.0) < 0.01;
}

function addSpirit(cat: string, name: string) {
  if (!name || settings.value.menu[cat]?.spirits[name] !== undefined) return;
  settings.value.menu[cat].spirits[name] = SIMPLE.has(cat)
    ? { pct: 0 }
    : { pct: 0, drinks: {} };
}
function removeSpirit(cat: string, name: string) {
  delete settings.value.menu[cat].spirits[name];
}
function addDrink(cat: string, sp: string, dk: string) {
  if (!dk) return;
  const ck = catalog.value.cocktails[dk];
  if (!ck || ck.main_spirit !== sp) return;
  const d = settings.value.menu[cat].spirits[sp].drinks!;
  if (d[dk] !== undefined) return;
  d[dk] = 0;
}
function removeDrink(cat: string, sp: string, dk: string) {
  delete settings.value.menu[cat].spirits[sp].drinks![dk];
}
function cocktailsFor(sn: string) {
  return Object.entries(catalog.value.cocktails)
    .filter(([, c]) => c.main_spirit === sn)
    .map(([n]) => n);
}
function spiritsByType(t: 'spirit' | 'beer' | 'wine') {
  return Object.entries(catalog.value.ingredients)
    .filter(([, i]) => i.type === t)
    .map(([n]) => n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog CRUD
// ─────────────────────────────────────────────────────────────────────────────
async function addIngredient() {
  const name = ingForm.value.name.trim();
  if (!name || catalog.value.ingredients[name]) {
    alert('Name missing or already exists');
    return;
  }
  const personal = await getKey<Record<string, Ingredient>>(
    'personal_ingredients',
    {},
  );
  const newIng: Ingredient = {
    type: ingForm.value.type as Ingredient['type'],
    abv: ingForm.value.abv,
    volume_ml:
      ingForm.value.volume_ml > 0 ? ingForm.value.volume_ml : undefined,
    unit: ingForm.value.unit,
    price_min: ingForm.value.price_min,
    price_max: ingForm.value.price_max,
  };
  personal[name] = newIng;
  await setKey('personal_ingredients', personal);
  catalog.value.ingredients[name] = newIng;
  priceEdits.value[name] = { min: newIng.price_min, max: newIng.price_max };
  ingForm.value = {
    name: '',
    type: 'spirit',
    abv: 0,
    volume_ml: 700,
    unit: 'ml',
    price_min: 0,
    price_max: 0,
  };
  showIngForm.value = false;
}
async function deleteIngredient(name: string) {
  if (!confirm(`Delete ${name}?`)) return;
  const def = (defaultCatalog as Catalog).ingredients;
  if (def[name]) {
    const h = await getKey<string[]>('hidden_ingredients', []);
    if (!h.includes(name)) h.push(name);
    await setKey('hidden_ingredients', h);
  } else {
    const p = await getKey<Record<string, Ingredient>>(
      'personal_ingredients',
      {},
    );
    delete p[name];
    await setKey('personal_ingredients', p);
  }
  delete catalog.value.ingredients[name];
  delete priceEdits.value[name];
}
async function savePrice(name: string) {
  const { min, max } = priceEdits.value[name];
  if (min > max) {
    alert('Min cannot exceed max');
    return;
  }
  savingPrice.value = name;
  const def = (defaultCatalog as Catalog).ingredients;
  if (def[name]) {
    const ov = await getKey<Record<string, Partial<Ingredient>>>(
      'price_overrides',
      {},
    );
    ov[name] = { price_min: min, price_max: max };
    await setKey('price_overrides', ov);
  } else {
    const p = await getKey<Record<string, Ingredient>>(
      'personal_ingredients',
      {},
    );
    if (p[name]) {
      p[name].price_min = min;
      p[name].price_max = max;
    }
    await setKey('personal_ingredients', p);
  }
  catalog.value.ingredients[name].price_min = min;
  catalog.value.ingredients[name].price_max = max;
  setTimeout(() => {
    savingPrice.value = null;
  }, 1400);
}

const spiritIngredients = computed(() =>
  Object.entries(catalog.value.ingredients)
    .filter(([, i]) => i.type === 'spirit')
    .map(([n]) => n),
);
const allIngredientNames = computed(() =>
  Object.keys(catalog.value.ingredients),
);

function addRecipeRow() {
  if (!ckIngSel.value) return;
  ckRecipe.value[ckIngSel.value] = {
    quantity: ckIngQty.value,
    unit: ckIngUnit.value,
  };
}
function removeRecipeRow(name: string) {
  delete ckRecipe.value[name];
}

async function addCocktail() {
  const name = ckForm.value.name.trim();
  if (!name || catalog.value.cocktails[name]) {
    alert('Name missing or already exists');
    return;
  }
  if (!Object.keys(ckRecipe.value).length) {
    alert('Add at least one ingredient');
    return;
  }
  const personal = await getKey<Record<string, Cocktail>>(
    'personal_cocktails',
    {},
  );
  const newCk: Cocktail = {
    main_spirit: ckForm.value.main_spirit,
    category: ckForm.value.category,
    recipe: Object.fromEntries(
      Object.entries(ckRecipe.value).map(([k, v]) => [
        k,
        { quantity: v.quantity },
      ]),
    ),
  };
  personal[name] = newCk;
  await setKey('personal_cocktails', personal);
  catalog.value.cocktails[name] = newCk;
  ckForm.value = {
    name: '',
    main_spirit: spiritIngredients.value[0] ?? '',
    category: 'Spirits',
  };
  ckRecipe.value = {};
  showCkForm.value = false;
}
async function deleteCocktail(name: string) {
  if (!confirm(`Delete ${name}?`)) return;
  const def = (defaultCatalog as Catalog).cocktails;
  if (def[name]) {
    const h = await getKey<string[]>('hidden_cocktails', []);
    if (!h.includes(name)) h.push(name);
    await setKey('hidden_cocktails', h);
  } else {
    const p = await getKey<Record<string, Cocktail>>('personal_cocktails', {});
    delete p[name];
    await setKey('personal_cocktails', p);
  }
  delete catalog.value.cocktails[name];
}

// ─────────────────────────────────────────────────────────────────────────────
// DB backup
// ─────────────────────────────────────────────────────────────────────────────
async function exportDB() {
  const keys = [
    'personal_ingredients',
    'personal_cocktails',
    'hidden_ingredients',
    'hidden_cocktails',
    'price_overrides',
    'settings',
  ] as const;
  const data: Record<string, unknown> = {};
  for (const k of keys) data[k] = await getKey(k, null);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bottlecount_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
async function importDB(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  for (const [k, v] of Object.entries(data)) await setKey(k as any, v);
  location.reload();
}

function exportTxt() {
  if (!result.value) return;
  const r = result.value,
    s = settings.value;
  const label = isGlobal.value
    ? 'GLOBAL'
    : (selectedParty.value?.name?.toUpperCase() ?? '');
  const lines = [
    '='.repeat(62),
    `  PARTY BUDGET${label ? ' — ' + label : ''} — ${s.guests} GUESTS`,
    '='.repeat(62),
    `  Ticket price : €${s.ticket_price}`,
    `  Venue cost   : €${s.venue_cost}`,
    `  Equipment    : €${s.equipment_cost}`,
    `  Revenue      : €${r.revenue}`,
    `  Profit       : €${r.profit_min} – €${r.profit_max}`,
    `  Break-even   : ${r.break_even} guests`,
    '',
    '='.repeat(62),
    '  SHOPPING LIST',
    '='.repeat(62),
    `  ${'Type'.padEnd(8)} ${'Item'.padEnd(26)} ${'Qty'.padStart(5)} ${'Unit'.padEnd(6)} ${'Min€'.padStart(7)} ${'Max€'.padStart(7)}`,
    '  ' + '-'.repeat(60),
    ...r.shopping_list.map(
      (i) =>
        `  ${i.type.padEnd(8)} ${i.name.padEnd(26)} ${String(i.quantity).padStart(5)} ${i.unit.padEnd(6)} ${i.cost_min.toFixed(2).padStart(7)} ${i.cost_max.toFixed(2).padStart(7)}`,
    ),
    '  ' + '-'.repeat(60),
    `  TOTAL SPEND  : €${r.total_min} – €${r.total_max}`,
    `  TOTAL (incl. fixed): €${(r.total_min + r.fixed_costs).toFixed(2)} – €${(r.total_max + r.fixed_costs).toFixed(2)}`,
    `\n  Generated on ${new Date().toLocaleString()}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shopping_list_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
}
</script>

<template>
  <div v-if="!ready" class="calc-loading">Loading…</div>
  <div v-else>
    <!-- ══════════════════════════════════════════════════════════
         PARTY SWITCHER — always visible at the top
    ═══════════════════════════════════════════════════════════ -->
    <div class="card card-pad calc-switcher">
      <div class="section-label">Calculating for</div>
      <div class="calc-switcher-actions">
        <!-- Global -->
        <button
          class="btn btn-sm"
          :class="isGlobal ? 'btn-primary' : 'btn-ghost'"
          @click="selectPartyId(null)"
        >
          🌐 Global defaults
        </button>
        <!-- One button per party -->
        <button
          v-for="p in parties"
          :key="p.id"
          class="btn btn-sm"
          :class="selectedPartyId === p.id ? 'btn-primary' : 'btn-ghost'"
          @click="selectPartyId(p.id ?? null)"
        >
          🎉 {{ p.name }}
        </button>
        <span
          v-if="!parties.length"
          style="font-size: 0.8rem; color: var(--muted)"
        >
          Create parties in the Tickets section to get per-party configs.
        </span>
      </div>
      <!-- Context label -->
      <div class="calc-context">
        <span v-if="isGlobal"
          >Editing <strong>global defaults</strong> — shared baseline for all
          parties</span
        >
        <span v-else
          >Editing
          <strong class="calc-context-accent">{{ selectedParty?.name }}</strong>
          — independent settings &amp; drink menu</span
        >
      </div>
    </div>

    <!-- ── Tabs ── -->
    <div class="calc-tabs">
      <button
        class="btn btn-sm"
        :class="activeTab === 'settings' ? 'btn-primary' : 'btn-ghost'"
        @click="activeTab = 'settings'"
      >
        ⚙️ Settings
      </button>
      <button
        class="btn btn-sm"
        :class="activeTab === 'menu' ? 'btn-primary' : 'btn-ghost'"
        @click="activeTab = 'menu'"
      >
        🍹 Drink Menu
      </button>
      <button
        class="btn btn-sm"
        :class="activeTab === 'catalog' ? 'btn-primary' : 'btn-ghost'"
        @click="activeTab = 'catalog'"
      >
        📚 Catalog
      </button>
    </div>

    <!-- ══ SETTINGS TAB ══ -->
    <template v-if="activeTab === 'settings'">
      <div class="card card-pad calc-section">
        <div class="section-label">
          {{ isGlobal ? 'Global Settings' : selectedParty?.name + ' Settings' }}
        </div>
        <div class="grid-2 calc-grid">
          <div>
            <label>Guests</label
            ><input type="number" v-model.number="settings.guests" min="1" />
          </div>
          <div>
            <label>Ticket €</label
            ><input
              type="number"
              v-model.number="settings.ticket_price"
              min="0"
              step="0.5"
            />
          </div>
          <div>
            <label>Venue €</label
            ><input
              type="number"
              v-model.number="settings.venue_cost"
              min="0"
            />
          </div>
          <div>
            <label>Equipment €</label
            ><input
              type="number"
              v-model.number="settings.equipment_cost"
              min="0"
            />
          </div>
        </div>
        <label>
          Alcohol / person:
          <strong
            >{{ settings.alcohol_ml_per_person }} ml —
            {{ alcoholLabel }}</strong
          >
        </label>
        <div class="calc-slider-row">
          <span style="font-size: 0.75rem; color: var(--muted)">25ml</span>
          <input
            type="range"
            min="25"
            max="100"
            step="25"
            v-model.number="settings.alcohol_ml_per_person"
          />
          <span style="font-size: 0.75rem; color: var(--muted)">100ml</span>
        </div>
        <div class="calc-slider-labels">
          <span v-for="(name, ml) in ALCOHOL_LEVELS" :key="ml">{{ name }}</span>
        </div>
      </div>

      <div v-if="errors.length" class="card card-pad calc-errors">
        <p class="calc-errors-title">Menu errors</p>
        <p v-for="e in errors" :key="e" class="calc-errors-item">• {{ e }}</p>
        <button class="btn btn-sm btn-ghost" @click="activeTab = 'menu'">
          Fix Drink Menu →
        </button>
      </div>

      <!-- KPIs -->
      <div v-if="result" class="kpi-grid">
        <div
          class="card card-pad kpi-card"
          v-for="(kpi, i) in [
            {
              label: 'Revenue',
              val: `€${result.revenue}`,
              color: 'var(--success)',
            },
            {
              label: 'Spend',
              val: `€${result.total_min}–${result.total_max}`,
              color: 'var(--danger)',
            },
            {
              label: 'Fixed',
              val: `€${result.fixed_costs}`,
              color: 'var(--warning)',
            },
            {
              label: 'Profit',
              val: `€${result.profit_min}–${result.profit_max}`,
              color: 'var(--success)',
            },
            {
              label: 'Break-even',
              val: `${result.break_even} guests`,
              color: 'var(--primary-strong)',
            },
          ]"
          :key="i"
        >
          <div class="kpi-label">
            {{ kpi.label }}
          </div>
          <div class="kpi-value" :style="{ color: kpi.color }">
            {{ kpi.val }}
          </div>
        </div>
      </div>

      <!-- Shopping list -->
      <div v-if="result" class="card calc-shopping">
        <div class="calc-shopping-header">
          <span style="font-weight: 700; font-size: 1rem">Shopping List</span>
          <button class="btn btn-ghost btn-sm" @click="exportTxt">
            Export TXT
          </button>
        </div>
        <div class="calc-shopping-head">
          <span>Item</span>
          <span style="text-align: right">Qty</span>
          <span style="text-align: right; color: var(--success)">Min€</span>
          <span style="text-align: right; color: var(--danger)">Max€</span>
        </div>
        <div
          class="shop-row calc-shopping-row"
          v-for="item in result.shopping_list"
          :key="item.name"
        >
          <div class="shop-item">
            <div class="shop-item-name">{{ item.name }}</div>
            <span class="badge" :class="BADGE[item.type] ?? 'badge-extra'">{{
              item.type
            }}</span>
          </div>
          <span class="shop-qty">{{ item.quantity }} {{ item.unit }}</span>
          <span class="shop-cost min">{{ item.cost_min.toFixed(2) }}</span>
          <span class="shop-cost max">{{ item.cost_max.toFixed(2) }}</span>
        </div>
        <div class="calc-shopping-total">
          <span>TOTAL</span>
          <span></span>
          <span style="text-align: right; color: var(--success)">{{
            result.total_min.toFixed(2)
          }}</span>
          <span style="text-align: right; color: var(--danger)">{{
            result.total_max.toFixed(2)
          }}</span>
        </div>
      </div>
    </template>

    <!-- ══ DRINK MENU TAB ══ -->
    <template v-if="activeTab === 'menu'">
      <!-- Context banner -->
      <div v-if="!isGlobal" class="calc-menu-banner">
        🎉 Editing drink menu for <strong>{{ selectedParty?.name }}</strong>
      </div>

      <div class="card card-pad">
        <div class="section-label">Category Split (must = 100%)</div>
        <div
          style="
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: flex-end;
            margin-bottom: 10px;
          "
        >
          <div
            v-for="(data, cat) in settings.menu"
            :key="cat"
            style="flex: 1; min-width: 80px"
          >
            <label>{{ cat }}</label>
            <div style="display: flex; align-items: center; gap: 4px">
              <input
                type="number"
                :value="Math.round(data.macro_pct * 1000) / 10"
                @input="
                  (e) => {
                    data.macro_pct =
                      +(e.target as HTMLInputElement).value / 100;
                  }
                "
                min="0"
                max="100"
                step="1"
              />
              <span
                style="
                  color: var(--muted);
                  white-space: nowrap;
                  font-size: 0.85rem;
                "
                >%</span
              >
            </div>
          </div>
        </div>
        <div style="font-size: 0.85rem">
          Total:
          <span :class="pctOk(macroSum()) ? 'ok' : 'err'"
            >{{ (macroSum() * 100).toFixed(1) }}%</span
          >
        </div>
      </div>

      <div class="card" v-for="(catData, cat) in settings.menu" :key="cat">
        <div class="calc-category-header">
          <span
            class="badge"
            :class="
              cat === 'Spirits'
                ? 'badge-spirit'
                : cat === 'Beer'
                  ? 'badge-beer'
                  : 'badge-wine'
            "
            >{{ cat }}</span
          >
          <span style="font-size: 0.8rem; color: var(--muted); margin-left: 8px"
            >{{ (catData.macro_pct * 100).toFixed(0) }}% of total</span
          >
        </div>
        <div style="padding: 12px 16px">
          <template v-if="SIMPLE.has(cat as string)">
            <p
              style="
                font-size: 0.75rem;
                color: var(--muted);
                margin-bottom: 10px;
              "
            >
              Set share per variety (must = 100%)
            </p>
            <div
              v-for="(spData, spName) in catData.spirits"
              :key="spName"
              style="
                background: var(--surface2);
                border: 1px solid var(--border2);
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 8px;
              "
            >
              <div
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  margin-bottom: 8px;
                "
              >
                <span style="font-weight: 600">{{ spName }}</span>
                <button
                  class="btn btn-danger btn-sm"
                  @click="removeSpirit(cat as string, spName as string)"
                >
                  ✖
                </button>
              </div>
              <div style="display: flex; align-items: center; gap: 8px">
                <input
                  type="number"
                  :value="Math.round(spData.pct * 1000) / 10"
                  @input="
                    (e) => {
                      spData.pct = +(e.target as HTMLInputElement).value / 100;
                    }
                  "
                  min="0"
                  max="100"
                  step="1"
                  style="max-width: 80px"
                />
                <span style="color: var(--muted); font-size: 0.85rem">%</span>
              </div>
            </div>
            <div style="font-size: 0.85rem; margin-bottom: 10px">
              Total:
              <span :class="pctOk(spiritsSum(cat as string)) ? 'ok' : 'err'"
                >{{ (spiritsSum(cat as string) * 100).toFixed(1) }}%</span
              >
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <select
                v-model="selSpirit[cat as string]"
                style="flex: 1; min-width: 0"
              >
                <option
                  v-for="n in spiritsByType(cat === 'Beer' ? 'beer' : 'wine')"
                  :key="n"
                  :value="n"
                >
                  {{ n }}
                </option>
              </select>
              <button
                class="btn btn-primary btn-sm"
                @click="addSpirit(cat as string, selSpirit[cat as string])"
              >
                + Add
              </button>
            </div>
          </template>
          <template v-else>
            <div
              v-for="(spData, spName) in catData.spirits"
              :key="spName"
              style="
                background: var(--surface2);
                border: 1px solid var(--border2);
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 10px;
              "
            >
              <div
                style="
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  gap: 8px;
                  margin-bottom: 8px;
                "
              >
                <span style="font-weight: 700">{{ spName }}</span>
                <button
                  class="btn btn-danger btn-sm"
                  @click="removeSpirit(cat as string, spName as string)"
                >
                  ✖
                </button>
              </div>
              <div
                style="
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-bottom: 12px;
                "
              >
                <input
                  type="number"
                  :value="Math.round(spData.pct * 1000) / 10"
                  @input="
                    (e) => {
                      spData.pct = +(e.target as HTMLInputElement).value / 100;
                    }
                  "
                  min="0"
                  max="100"
                  step="1"
                  style="max-width: 80px"
                />
                <span style="color: var(--muted); font-size: 0.85rem"
                  >% of Spirits</span
                >
              </div>
              <div
                style="border-top: 1px solid var(--border); padding-top: 10px"
              >
                <div class="section-label">Cocktails (must = 100%)</div>
                <div
                  v-for="(dkPct, dkName) in spData.drinks ?? {}"
                  :key="dkName"
                  style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 6px;
                    flex-wrap: wrap;
                  "
                >
                  <span
                    style="
                      flex: 1;
                      font-size: 0.85rem;
                      color: #cbd5e1;
                      min-width: 100px;
                    "
                    >{{ dkName }}</span
                  >
                  <input
                    type="number"
                    :value="Math.round((dkPct as number) * 1000) / 10"
                    @input="
                      (e) => {
                        spData.drinks![dkName as string] =
                          +(e.target as HTMLInputElement).value / 100;
                      }
                    "
                    min="0"
                    max="100"
                    step="1"
                    style="max-width: 72px"
                  />
                  <span style="color: var(--muted); font-size: 0.85rem">%</span>
                  <button
                    class="btn btn-danger btn-sm"
                    @click="
                      removeDrink(
                        cat as string,
                        spName as string,
                        dkName as string,
                      )
                    "
                  >
                    ✖
                  </button>
                </div>
                <div style="font-size: 0.8rem; margin-bottom: 8px">
                  Total:
                  <span
                    :class="
                      pctOk(drinksSum(cat as string, spName as string))
                        ? 'ok'
                        : 'err'
                    "
                    >{{
                      (
                        drinksSum(cat as string, spName as string) * 100
                      ).toFixed(1)
                    }}%</span
                  >
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap">
                  <select
                    v-model="selDrink[`${cat as string}__${spName as string}`]"
                    style="flex: 1; min-width: 0"
                  >
                    <option
                      v-for="ck in cocktailsFor(spName as string)"
                      :key="ck"
                      :value="ck"
                    >
                      {{ ck }}
                    </option>
                    <option
                      v-if="!cocktailsFor(spName as string).length"
                      disabled
                    >
                      No cocktails for this spirit
                    </option>
                  </select>
                  <button
                    class="btn btn-primary btn-sm"
                    @click="
                      addDrink(
                        cat as string,
                        spName as string,
                        selDrink[`${cat as string}__${spName as string}`],
                      )
                    "
                  >
                    + Add drink
                  </button>
                </div>
              </div>
            </div>
            <div style="font-size: 0.85rem; margin-bottom: 10px">
              Spirits total:
              <span :class="pctOk(spiritsSum(cat as string)) ? 'ok' : 'err'"
                >{{ (spiritsSum(cat as string) * 100).toFixed(1) }}%</span
              >
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <select
                v-model="selSpirit[cat as string]"
                style="flex: 1; min-width: 0"
              >
                <option
                  v-for="n in spiritsByType('spirit')"
                  :key="n"
                  :value="n"
                >
                  {{ n }}
                </option>
              </select>
              <button
                class="btn btn-primary btn-sm"
                @click="addSpirit(cat as string, selSpirit[cat as string])"
              >
                + Add spirit
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ══ CATALOG TAB ══ -->
    <template v-if="activeTab === 'catalog'">
      <div style="display: flex; gap: 8px; margin-bottom: 16px">
        <button
          class="btn btn-sm"
          :class="catSection === 'ingredients' ? 'btn-primary' : 'btn-ghost'"
          @click="catSection = 'ingredients'"
        >
          🧴 Ingredients
        </button>
        <button
          class="btn btn-sm"
          :class="catSection === 'cocktails' ? 'btn-primary' : 'btn-ghost'"
          @click="catSection = 'cocktails'"
        >
          🍸 Cocktails
        </button>
      </div>

      <!-- Ingredients -->
      <template v-if="catSection === 'ingredients'">
        <button
          class="btn btn-primary btn-sm btn-full"
          style="margin-bottom: 12px"
          @click="showIngForm = !showIngForm"
        >
          {{ showIngForm ? '✕ Cancel' : '+ Add ingredient' }}
        </button>
        <div
          v-if="showIngForm"
          class="card card-pad"
          style="margin-bottom: 12px"
        >
          <div class="grid-2" style="margin-bottom: 8px">
            <div style="grid-column: 1/-1">
              <label>Name</label
              ><input
                type="text"
                v-model="ingForm.name"
                placeholder="e.g. Rum 70cl"
              />
            </div>
            <div>
              <label>Type</label>
              <select v-model="ingForm.type">
                <option>spirit</option>
                <option>beer</option>
                <option>wine</option>
                <option>mixer</option>
                <option>snack</option>
                <option>extra</option>
              </select>
            </div>
            <div>
              <label>ABV (0.40)</label
              ><input
                type="number"
                v-model.number="ingForm.abv"
                step="0.01"
                min="0"
                max="1"
              />
            </div>
            <div>
              <label>Volume ml</label
              ><input type="number" v-model.number="ingForm.volume_ml" />
            </div>
            <div>
              <label>Unit</label><input type="text" v-model="ingForm.unit" />
            </div>
            <div>
              <label>Min price €</label
              ><input
                type="number"
                v-model.number="ingForm.price_min"
                step="0.01"
              />
            </div>
            <div>
              <label>Max price €</label
              ><input
                type="number"
                v-model.number="ingForm.price_max"
                step="0.01"
              />
            </div>
          </div>
          <button class="btn btn-success btn-full" @click="addIngredient">
            ✅ Add ingredient
          </button>
        </div>

        <div
          v-for="(ing, name) in catalog.ingredients"
          :key="name"
          style="
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 8px;
          "
        >
          <div
            style="
              display: flex;
              align-items: flex-start;
              gap: 8px;
              margin-bottom: 8px;
            "
          >
            <div style="flex: 1; min-width: 0">
              <div
                style="
                  font-weight: 700;
                  font-size: 0.95rem;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                "
              >
                {{ name }}
              </div>
              <div
                style="
                  margin-top: 3px;
                  display: flex;
                  align-items: center;
                  gap: 6px;
                  flex-wrap: wrap;
                "
              >
                <span class="badge" :class="BADGE[ing.type] ?? 'badge-extra'">{{
                  ing.type
                }}</span>
                <span
                  v-if="ing.abv"
                  style="font-size: 0.75rem; color: var(--muted)"
                  >{{ Math.round(ing.abv * 100) }}% ABV</span
                >
                <span
                  v-if="ing.volume_ml"
                  style="font-size: 0.75rem; color: var(--muted)"
                  >{{ ing.volume_ml }}ml</span
                >
              </div>
            </div>
            <button
              class="btn btn-danger btn-sm"
              @click="deleteIngredient(name as string)"
            >
              ✖
            </button>
          </div>
          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              flex-wrap: wrap;
            "
            v-if="priceEdits[name as string]"
          >
            <div
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                flex: 1;
                min-width: 100px;
              "
            >
              <span
                style="font-size: 0.75rem; color: #4ade80; white-space: nowrap"
                >Min €</span
              >
              <input
                type="number"
                step="0.01"
                min="0"
                v-model.number="priceEdits[name as string].min"
                style="flex: 1; color: #4ade80; min-width: 60px"
              />
            </div>
            <div
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                flex: 1;
                min-width: 100px;
              "
            >
              <span
                style="font-size: 0.75rem; color: #f87171; white-space: nowrap"
                >Max €</span
              >
              <input
                type="number"
                step="0.01"
                min="0"
                v-model.number="priceEdits[name as string].max"
                style="flex: 1; color: #f87171; min-width: 60px"
              />
            </div>
            <button
              class="btn btn-success btn-sm"
              @click="savePrice(name as string)"
            >
              {{ savingPrice === name ? '✅' : '💾' }}
            </button>
          </div>
        </div>
      </template>

      <!-- Cocktails -->
      <template v-if="catSection === 'cocktails'">
        <button
          class="btn btn-primary btn-sm btn-full"
          style="margin-bottom: 12px"
          @click="showCkForm = !showCkForm"
        >
          {{ showCkForm ? '✕ Cancel' : '+ Add cocktail' }}
        </button>
        <div
          v-if="showCkForm"
          class="card card-pad"
          style="margin-bottom: 12px"
        >
          <div class="grid-2" style="margin-bottom: 8px">
            <div style="grid-column: 1/-1">
              <label>Name</label
              ><input
                type="text"
                v-model="ckForm.name"
                placeholder="e.g. Vodka Tonic"
              />
            </div>
            <div>
              <label>Category</label
              ><select v-model="ckForm.category">
                <option>Spirits</option>
              </select>
            </div>
            <div>
              <label>Main spirit</label>
              <select v-model="ckForm.main_spirit">
                <option v-for="n in spiritIngredients" :key="n" :value="n">
                  {{ n }}
                </option>
              </select>
            </div>
          </div>
          <div class="section-label" style="margin-bottom: 6px">Recipe</div>
          <div
            v-for="(row, ingName) in ckRecipe"
            :key="ingName"
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              margin-bottom: 4px;
              font-size: 0.85rem;
              background: var(--surface2);
              border-radius: 6px;
              padding: 5px 8px;
            "
          >
            <span style="flex: 1">{{ ingName }}</span>
            <span style="color: var(--indigo)"
              >{{ row.quantity }} {{ row.unit }}</span
            >
            <button
              class="btn btn-danger btn-sm"
              @click="removeRecipeRow(ingName as string)"
            >
              ✖
            </button>
          </div>
          <div
            style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px"
          >
            <select v-model="ckIngSel" style="flex: 1; min-width: 0">
              <option v-for="n in allIngredientNames" :key="n" :value="n">
                {{ n }}
              </option>
            </select>
            <input
              type="number"
              v-model.number="ckIngQty"
              style="width: 64px"
            />
            <select v-model="ckIngUnit" style="width: 64px">
              <option>ml</option>
              <option>kg</option>
              <option>pcs</option>
            </select>
            <button class="btn btn-primary btn-sm" @click="addRecipeRow">
              + Add
            </button>
          </div>
          <button class="btn btn-success btn-full" @click="addCocktail">
            ✅ Create cocktail
          </button>
        </div>

        <div
          v-for="(ck, name) in catalog.cocktails"
          :key="name"
          style="
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 8px;
          "
        >
          <div
            style="
              display: flex;
              align-items: flex-start;
              gap: 8px;
              margin-bottom: 6px;
            "
          >
            <div style="flex: 1">
              <div style="font-weight: 700; font-size: 0.95rem">{{ name }}</div>
              <div style="margin-top: 3px">
                <span class="badge badge-spirit">{{
                  ck.category ?? 'Spirits'
                }}</span>
                <span
                  style="
                    font-size: 0.75rem;
                    color: var(--muted);
                    margin-left: 6px;
                  "
                  >base: {{ ck.main_spirit }}</span
                >
              </div>
            </div>
            <button
              class="btn btn-danger btn-sm"
              @click="deleteCocktail(name as string)"
            >
              ✖
            </button>
          </div>
          <div style="font-size: 0.75rem; color: #64748b; line-height: 1.6">
            <span
              v-for="(det, ing) in ck.recipe"
              :key="ing"
              style="
                display: inline-block;
                background: var(--surface2);
                border-radius: 4px;
                padding: 1px 6px;
                margin: 1px;
              "
            >
              {{ ing }}: {{ det.quantity }}{{ det.unit ?? 'ml' }}
            </span>
          </div>
        </div>
      </template>

      <!-- Backup -->
      <div class="card card-pad" style="margin-top: 24px">
        <div class="section-label">Data backup</div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap">
          <button class="btn btn-ghost btn-sm" @click="exportDB">
            ⬇️ Export backup
          </button>
          <label class="btn btn-ghost btn-sm" style="cursor: pointer">
            ⬆️ Import backup
            <input
              type="file"
              accept=".json"
              @change="importDB"
              style="display: none"
            />
          </label>
        </div>
      </div>
    </template>

    <!-- ── Fixed save bar (Settings + Menu tabs only) ── -->
    <div v-if="saveLabel" class="save-bar">
      <div class="save-bar-inner">
        <span
          v-if="errors.length && activeTab === 'menu'"
          class="err"
          style="font-size: 0.82rem; flex: 1"
        >
          ⚠️ {{ errors.length }} error{{ errors.length > 1 ? 's' : '' }}
        </span>
        <span
          v-else
          style="
            flex: 1;
            font-size: 0.82rem;
            color: var(--muted);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          "
        >
          {{ isGlobal ? '🌐 Global' : '🎉 ' + selectedParty?.name }}
          · {{ settings.guests }} guests · €{{ settings.ticket_price }} ticket
        </span>
        <button
          class="btn btn-success"
          @click="handleSave"
          :disabled="saving"
          style="min-width: 150px; flex-shrink: 0"
        >
          {{ saving ? 'Saving…' : saveLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
