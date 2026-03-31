<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { db, getKey, setKey } from '../lib/db';
import { calculate, validateMenu, ALCOHOL_LEVELS } from '../lib/core';
import type { Settings, Catalog, CalculationResult, Ingredient, Cocktail } from '../lib/types';

import defaultCatalog  from '../data/catalog.json';
import defaultSettings from '../data/settings.json';

// ── State ──────────────────────────────────────────────────────────────────
const settings  = ref<Settings>(JSON.parse(JSON.stringify(defaultSettings)) as Settings);
const catalog   = ref<Catalog>(JSON.parse(JSON.stringify(defaultCatalog))  as Catalog);
const ready     = ref(false);
const saving    = ref(false);
const activeTab = ref<'settings' | 'menu' | 'catalog'>('settings');

const SIMPLE = new Set(['Beer', 'Wine']);

// ── Catalog tab state ──────────────────────────────────────────────────────
const catSection     = ref<'ingredients' | 'cocktails'>('ingredients');
const showIngForm    = ref(false);
const showCkForm     = ref(false);
const savingPrice    = ref<string | null>(null);
const priceEdits     = ref<Record<string, { min: number; max: number }>>({});

const ingForm = ref({ name: '', type: 'spirit', abv: 0, volume_ml: 700, unit: 'ml', price_min: 0, price_max: 0 });
const ckForm  = ref({ name: '', main_spirit: '', category: 'Spirits' });
const ckRecipe  = ref<Record<string, { quantity: number; unit: string }>>({});
const ckIngSel  = ref('');
const ckIngQty  = ref(50);
const ckIngUnit = ref('ml');

const BADGE: Record<string, string> = {
  spirit: 'badge-spirit', beer: 'badge-beer', wine: 'badge-wine',
  mixer: 'badge-mixer', snack: 'badge-snack', extra: 'badge-extra',
};

// ── Load from IndexedDB ────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();

  // Load settings
  const saved = await getKey<Settings | null>('settings', null);
  if (saved) settings.value = saved;

  // Merge catalog
  await reloadCatalog();
  ready.value = true;
});

async function reloadCatalog() {
  const hiddenIng    = await getKey<string[]>('hidden_ingredients',   []);
  const hiddenCock   = await getKey<string[]>('hidden_cocktails',     []);
  const personalIng  = await getKey<Record<string, any>>('personal_ingredients', {});
  const personalCock = await getKey<Record<string, any>>('personal_cocktails',   {});
  const overrides    = await getKey<Record<string, any>>('price_overrides',      {});

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

  // Sync price edit state
  for (const [name, ing] of Object.entries(ings)) {
    if (!priceEdits.value[name]) {
      priceEdits.value[name] = { min: ing.price_min, max: ing.price_max };
    }
  }

  // Default selectors
  const spirits = Object.entries(ings).filter(([, i]) => i.type === 'spirit');
  if (spirits.length && !ckForm.value.main_spirit) ckForm.value.main_spirit = spirits[0][0];
  if (Object.keys(ings).length && !ckIngSel.value) ckIngSel.value = Object.keys(ings)[0];
}

// ── Derived ────────────────────────────────────────────────────────────────
const errors = computed(() => validateMenu(settings.value.menu));
const result = computed<CalculationResult | null>(() =>
  errors.value.length === 0 ? calculate(settings.value, catalog.value) : null
);
const alcoholLabel = computed(() =>
  ALCOHOL_LEVELS[settings.value.alcohol_ml_per_person] ?? ''
);

// ── Save ───────────────────────────────────────────────────────────────────
async function save() {
  saving.value = true;
  await setKey('settings', settings.value);
  saving.value = false;
}

// ── Menu helpers ───────────────────────────────────────────────────────────
function spiritsSum(cat: string) {
  return Object.values(settings.value.menu[cat]?.spirits ?? {})
    .reduce((s, v) => s + v.pct, 0);
}
function drinksSum(cat: string, sp: string) {
  return Object.values(settings.value.menu[cat]?.spirits?.[sp]?.drinks ?? {})
    .reduce((s, v) => s + v, 0);
}
function macroSum() {
  return Object.values(settings.value.menu).reduce((s, v) => s + v.macro_pct, 0);
}
function pctOk(v: number) { return Math.abs(v - 1.0) < 0.01; }

function addSpirit(cat: string, name: string) {
  if (!name || settings.value.menu[cat]?.spirits[name] !== undefined) return;
  const s = settings.value.menu[cat].spirits;
  s[name] = SIMPLE.has(cat) ? { pct: 0 } : { pct: 0, drinks: {} };
}
function removeSpirit(cat: string, name: string) {
  delete settings.value.menu[cat].spirits[name];
}
function addDrink(cat: string, sp: string, dk: string) {
  if (!dk) return;
  const ck = catalog.value.cocktails[dk];
  if (!ck || ck.main_spirit !== sp) return;
  const drinks = settings.value.menu[cat].spirits[sp].drinks!;
  if (drinks[dk] !== undefined) return;
  drinks[dk] = 0;
}
function removeDrink(cat: string, sp: string, dk: string) {
  delete settings.value.menu[cat].spirits[sp].drinks![dk];
}
function cocktailsFor(spiritName: string) {
  return Object.entries(catalog.value.cocktails)
    .filter(([, ck]) => ck.main_spirit === spiritName)
    .map(([name]) => name);
}
function spiritsByType(type: 'spirit' | 'beer' | 'wine') {
  return Object.entries(catalog.value.ingredients)
    .filter(([, ing]) => ing.type === type)
    .map(([name]) => name);
}

// ── Catalog: Ingredient CRUD ───────────────────────────────────────────────
async function addIngredient() {
  const name = ingForm.value.name.trim();
  if (!name || catalog.value.ingredients[name]) { alert('Name missing or already exists'); return; }
  const personal = await getKey<Record<string, Ingredient>>('personal_ingredients', {});
  const newIng: Ingredient = {
    type:      ingForm.value.type as Ingredient['type'],
    abv:       ingForm.value.abv,
    volume_ml: ingForm.value.volume_ml > 0 ? ingForm.value.volume_ml : undefined,
    unit:      ingForm.value.unit,
    price_min: ingForm.value.price_min,
    price_max: ingForm.value.price_max,
  };
  personal[name] = newIng;
  await setKey('personal_ingredients', personal);
  catalog.value.ingredients[name] = newIng;
  priceEdits.value[name] = { min: newIng.price_min, max: newIng.price_max };
  ingForm.value = { name: '', type: 'spirit', abv: 0, volume_ml: 700, unit: 'ml', price_min: 0, price_max: 0 };
  showIngForm.value = false;
}

async function deleteIngredient(name: string) {
  if (!confirm(`Delete ${name}?`)) return;
  const defaults = (defaultCatalog as Catalog).ingredients;
  if (defaults[name]) {
    const hidden = await getKey<string[]>('hidden_ingredients', []);
    if (!hidden.includes(name)) hidden.push(name);
    await setKey('hidden_ingredients', hidden);
  } else {
    const personal = await getKey<Record<string, Ingredient>>('personal_ingredients', {});
    delete personal[name];
    await setKey('personal_ingredients', personal);
  }
  delete catalog.value.ingredients[name];
  delete priceEdits.value[name];
}

async function savePrice(name: string) {
  const { min, max } = priceEdits.value[name];
  if (min > max) { alert('Min cannot exceed max'); return; }
  savingPrice.value = name;
  const defaults = (defaultCatalog as Catalog).ingredients;
  if (defaults[name]) {
    const overrides = await getKey<Record<string, Partial<Ingredient>>>('price_overrides', {});
    overrides[name] = { price_min: min, price_max: max };
    await setKey('price_overrides', overrides);
  } else {
    const personal = await getKey<Record<string, Ingredient>>('personal_ingredients', {});
    if (personal[name]) { personal[name].price_min = min; personal[name].price_max = max; }
    await setKey('personal_ingredients', personal);
  }
  catalog.value.ingredients[name].price_min = min;
  catalog.value.ingredients[name].price_max = max;
  setTimeout(() => { savingPrice.value = null; }, 1400);
}

// ── Catalog: Cocktail CRUD ─────────────────────────────────────────────────
const spiritIngredients = computed(() =>
  Object.entries(catalog.value.ingredients).filter(([, i]) => i.type === 'spirit').map(([n]) => n)
);
const allIngredientNames = computed(() => Object.keys(catalog.value.ingredients));

function addRecipeRow() {
  if (!ckIngSel.value) return;
  ckRecipe.value[ckIngSel.value] = { quantity: ckIngQty.value, unit: ckIngUnit.value };
}
function removeRecipeRow(name: string) { delete ckRecipe.value[name]; }

async function addCocktail() {
  const name = ckForm.value.name.trim();
  if (!name || catalog.value.cocktails[name]) { alert('Name missing or already exists'); return; }
  if (Object.keys(ckRecipe.value).length === 0) { alert('Add at least one ingredient'); return; }
  const personal = await getKey<Record<string, Cocktail>>('personal_cocktails', {});
  const newCk: Cocktail = {
    main_spirit: ckForm.value.main_spirit,
    category:    ckForm.value.category,
    recipe: Object.fromEntries(
      Object.entries(ckRecipe.value).map(([k, v]) => [k, { quantity: v.quantity }])
    ),
  };
  personal[name] = newCk;
  await setKey('personal_cocktails', personal);
  catalog.value.cocktails[name] = newCk;
  ckForm.value = { name: '', main_spirit: spiritIngredients.value[0] ?? '', category: 'Spirits' };
  ckRecipe.value = {};
  showCkForm.value = false;
}

async function deleteCocktail(name: string) {
  if (!confirm(`Delete ${name}?`)) return;
  const defaults = (defaultCatalog as Catalog).cocktails;
  if (defaults[name]) {
    const hidden = await getKey<string[]>('hidden_cocktails', []);
    if (!hidden.includes(name)) hidden.push(name);
    await setKey('hidden_cocktails', hidden);
  } else {
    const personal = await getKey<Record<string, Cocktail>>('personal_cocktails', {});
    delete personal[name];
    await setKey('personal_cocktails', personal);
  }
  delete catalog.value.cocktails[name];
}

// ── DB export / import ─────────────────────────────────────────────────────
async function exportDB() {
  const keys = ['personal_ingredients','personal_cocktails','hidden_ingredients','hidden_cocktails','price_overrides','settings'] as const;
  const data: Record<string, unknown> = {};
  for (const k of keys) data[k] = await getKey(k, null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `bottlecount_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
}
async function importDB(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  for (const [k, v] of Object.entries(data)) await setKey(k as any, v);
  location.reload();
}

// ── Export TXT ─────────────────────────────────────────────────────────────
function exportTxt() {
  if (!result.value) return;
  const r = result.value, s = settings.value;
  const lines = [
    '='.repeat(62),
    `  PARTY BUDGET - ${s.guests} GUESTS`,
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
    ...r.shopping_list.map(i =>
      `  ${i.type.padEnd(8)} ${i.name.padEnd(26)} ${String(i.quantity).padStart(5)} ${i.unit.padEnd(6)} ${i.cost_min.toFixed(2).padStart(7)} ${i.cost_max.toFixed(2).padStart(7)}`
    ),
    '  ' + '-'.repeat(60),
    `  TOTAL SPEND  : €${r.total_min} – €${r.total_max}`,
    `  TOTAL (incl. fixed): €${(r.total_min + r.fixed_costs).toFixed(2)} – €${(r.total_max + r.fixed_costs).toFixed(2)}`,
    `\n  Generated on ${new Date().toLocaleString()}`,
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shopping_list_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
}
</script>

<template>
  <div v-if="!ready" style="text-align:center;padding:60px;color:var(--muted);">Loading…</div>
  <div v-else>

    <!-- ── Tabs ── -->
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <button class="btn btn-sm" :class="activeTab==='settings' ? 'btn-primary' : 'btn-ghost'" @click="activeTab='settings'">⚙️ Settings</button>
      <button class="btn btn-sm" :class="activeTab==='menu'     ? 'btn-primary' : 'btn-ghost'" @click="activeTab='menu'">🍹 Drink Menu</button>
      <button class="btn btn-sm" :class="activeTab==='catalog'  ? 'btn-primary' : 'btn-ghost'" @click="activeTab='catalog'">📚 Catalog</button>
    </div>

    <!-- ══ SETTINGS TAB ══ -->
    <template v-if="activeTab==='settings'">
      <div class="card card-pad">
        <div class="section-label">Party Settings</div>
        <div class="grid-2" style="margin-bottom:14px;">
          <div><label>Guests</label>
            <input type="number" v-model.number="settings.guests" min="1" /></div>
          <div><label>Ticket €</label>
            <input type="number" v-model.number="settings.ticket_price" min="0" step="0.5" /></div>
          <div><label>Venue €</label>
            <input type="number" v-model.number="settings.venue_cost" min="0" /></div>
          <div><label>Equipment €</label>
            <input type="number" v-model.number="settings.equipment_cost" min="0" /></div>
        </div>

        <label>Alcohol / person: <strong style="color:var(--text)">{{ settings.alcohol_ml_per_person }} ml — {{ alcoholLabel }}</strong></label>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:.75rem;color:var(--muted)">25ml</span>
          <input type="range" min="25" max="100" step="25" v-model.number="settings.alcohol_ml_per_person" />
          <span style="font-size:.75rem;color:var(--muted)">100ml</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--indigo);margin-bottom:16px;">
          <span v-for="(name, ml) in ALCOHOL_LEVELS" :key="ml">{{ name }}</span>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" style="flex:1;" @click="save" :disabled="saving">
            {{ saving ? '…' : '💾 Save settings' }}
          </button>
          <button class="btn btn-ghost" style="flex:1;" @click="exportTxt" :disabled="!result">
            📄 Export TXT
          </button>
        </div>
      </div>

      <!-- Errors -->
      <div v-if="errors.length" class="card card-pad" style="border-color:var(--red);">
        <p style="color:#f87171;font-weight:700;margin-bottom:8px;">⚠️ Menu errors</p>
        <p v-for="e in errors" :key="e" style="color:#fca5a5;font-size:.875rem;margin-bottom:2px;">• {{ e }}</p>
        <button class="btn btn-sm btn-ghost" style="margin-top:10px;" @click="activeTab='menu'">Fix Drink Menu →</button>
      </div>

      <!-- KPIs -->
      <div v-if="result" class="kpi-grid">
        <div class="card card-pad" v-for="(kpi, i) in [
          { label:'💰 Revenue',    val:`€${result.revenue}`,                            color:'#4ade80' },
          { label:'💸 Spend',      val:`€${result.total_min}–${result.total_max}`,      color:'#f87171' },
          { label:'🏠 Fixed',      val:`€${result.fixed_costs}`,                        color:'#fbbf24' },
          { label:'📈 Profit',     val:`€${result.profit_min}–${result.profit_max}`,    color:'#34d399' },
          { label:'⚖️ Break-even', val:`${result.break_even} guests`,                   color:'#818cf8' },
        ]" :key="i">
          <div style="font-size:.7rem;color:var(--muted);margin-bottom:4px;">{{ kpi.label }}</div>
          <div style="font-size:.95rem;font-weight:800;line-height:1.2;" :style="{color:kpi.color}">{{ kpi.val }}</div>
        </div>
      </div>

      <!-- Shopping list -->
      <div v-if="result" class="card">
        <div style="font-weight:700;padding:14px 16px 8px;font-size:1rem;">🛒 Shopping List</div>
        <div style="display:flex;gap:8px;padding:6px 12px;background:#252538;font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border2);">
          <span style="flex:1;">Item</span>
          <span style="width:52px;text-align:right;">Qty</span>
          <span style="width:52px;text-align:right;color:#4ade80;">Min€</span>
          <span style="width:52px;text-align:right;color:#f87171;">Max€</span>
        </div>
        <div class="shop-row" v-for="item in result.shopping_list" :key="item.name">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ item.name }}</div>
            <span class="badge" :class="BADGE[item.type] ?? 'badge-extra'">{{ item.type }}</span>
          </div>
          <span style="width:52px;text-align:right;font-size:.8rem;white-space:nowrap;">{{ item.quantity }} {{ item.unit }}</span>
          <span style="width:52px;text-align:right;color:#4ade80;font-size:.8rem;">{{ item.cost_min.toFixed(2) }}</span>
          <span style="width:52px;text-align:right;color:#f87171;font-size:.8rem;">{{ item.cost_max.toFixed(2) }}</span>
        </div>
        <div style="display:flex;gap:8px;padding:10px 12px;border-top:2px solid #4d4d6e;font-weight:800;">
          <span style="flex:1;">TOTAL</span>
          <span style="width:52px;"></span>
          <span style="width:52px;text-align:right;color:#4ade80;">{{ result.total_min.toFixed(2) }}</span>
          <span style="width:52px;text-align:right;color:#f87171;">{{ result.total_max.toFixed(2) }}</span>
        </div>
      </div>
    </template>

    <!-- ══ MENU TAB ══ -->
    <template v-if="activeTab==='menu'">
      <!-- Macro split -->
      <div class="card card-pad">
        <div class="section-label">Category Split (must = 100%)</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:10px;">
          <div v-for="(data, cat) in settings.menu" :key="cat" style="flex:1;min-width:80px;">
            <label>{{ cat }}</label>
            <div style="display:flex;align-items:center;gap:4px;">
              <input type="number" :value="Math.round(data.macro_pct * 1000) / 10"
                @input="(e) => { data.macro_pct = +((e.target as HTMLInputElement).value) / 100 }"
                min="0" max="100" step="1" />
              <span style="color:var(--muted);white-space:nowrap;font-size:.85rem;">%</span>
            </div>
          </div>
        </div>
        <div style="font-size:.85rem;">
          Total: <span :class="pctOk(macroSum()) ? 'ok' : 'err'">{{ (macroSum()*100).toFixed(1) }}%</span>
        </div>
      </div>

      <!-- Per-category -->
      <div class="card" v-for="(catData, cat) in settings.menu" :key="cat" style="margin-bottom:12px;">
        <div style="padding:14px 16px;font-weight:700;font-size:1rem;border-bottom:1px solid var(--border);">
          <span class="badge" :class="cat==='Spirits'?'badge-spirit':cat==='Beer'?'badge-beer':'badge-wine'">{{ cat }}</span>
          <span style="font-size:.8rem;color:var(--muted);margin-left:8px;">{{ (catData.macro_pct*100).toFixed(0) }}% of total</span>
        </div>
        <div style="padding:12px 16px;">
          <template v-if="SIMPLE.has(cat as string)">
            <p style="font-size:.75rem;color:var(--muted);margin-bottom:10px;">Served as-is — set share per variety (must = 100%)</p>
            <div v-for="(spData, spName) in catData.spirits" :key="spName" style="background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span style="font-weight:600;">{{ spName }}</span>
                <button class="btn btn-danger btn-sm" @click="removeSpirit(cat as string, spName as string)">✖</button>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="number" :value="Math.round(spData.pct*1000)/10"
                  @input="(e) => { spData.pct = +((e.target as HTMLInputElement).value)/100 }"
                  min="0" max="100" step="1" style="max-width:80px;" />
                <span style="color:var(--muted);font-size:.85rem;">% of {{ cat }}</span>
              </div>
            </div>
            <div style="font-size:.85rem;margin-bottom:10px;">
              Total: <span :class="pctOk(spiritsSum(cat as string)) ? 'ok' : 'err'">{{ (spiritsSum(cat as string)*100).toFixed(1) }}%</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <select :id="`sel_${cat}`" style="flex:1;min-width:0;">
                <option v-for="n in spiritsByType(cat==='Beer'?'beer':'wine')" :key="n" :value="n">{{ n }}</option>
              </select>
              <button class="btn btn-primary btn-sm" @click="addSpirit(cat as string, (document.getElementById(`sel_${cat}`) as HTMLSelectElement)?.value)">+ Add</button>
            </div>
          </template>

          <template v-else>
            <div v-for="(spData, spName) in catData.spirits" :key="spName"
              style="background:var(--surface2);border:1px solid var(--border2);border-radius:10px;padding:12px;margin-bottom:10px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <span style="font-weight:700;">{{ spName }}</span>
                <button class="btn btn-danger btn-sm" @click="removeSpirit(cat as string, spName as string)">✖</button>
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <input type="number" :value="Math.round(spData.pct*1000)/10"
                  @input="(e) => { spData.pct = +((e.target as HTMLInputElement).value)/100 }"
                  min="0" max="100" step="1" style="max-width:80px;" />
                <span style="color:var(--muted);font-size:.85rem;">% of Spirits</span>
              </div>
              <div style="border-top:1px solid var(--border);padding-top:10px;">
                <div class="section-label">Cocktails (must = 100%)</div>
                <div v-for="(dkPct, dkName) in (spData.drinks ?? {})" :key="dkName"
                  style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                  <span style="flex:1;font-size:.85rem;color:#cbd5e1;min-width:100px;">{{ dkName }}</span>
                  <input type="number" :value="Math.round((dkPct as number)*1000)/10"
                    @input="(e) => { spData.drinks![dkName as string] = +((e.target as HTMLInputElement).value)/100 }"
                    min="0" max="100" step="1" style="max-width:72px;" />
                  <span style="color:var(--muted);font-size:.85rem;">%</span>
                  <button class="btn btn-danger btn-sm" @click="removeDrink(cat as string, spName as string, dkName as string)">✖</button>
                </div>
                <div style="font-size:.8rem;margin-bottom:8px;">
                  Total: <span :class="pctOk(drinksSum(cat as string, spName as string)) ? 'ok' : 'err'">
                    {{ (drinksSum(cat as string, spName as string)*100).toFixed(1) }}%
                  </span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <select :id="`sel_drink_${cat}_${spName}`" style="flex:1;min-width:0;">
                    <option v-for="ck in cocktailsFor(spName as string)" :key="ck" :value="ck">{{ ck }}</option>
                    <option v-if="cocktailsFor(spName as string).length === 0" disabled>No cocktails for this spirit</option>
                  </select>
                  <button class="btn btn-primary btn-sm"
                    @click="addDrink(cat as string, spName as string, (document.getElementById(`sel_drink_${cat}_${spName}`) as HTMLSelectElement)?.value)">
                    + Add drink
                  </button>
                </div>
              </div>
            </div>
            <div style="font-size:.85rem;margin-bottom:10px;">
              Spirits total: <span :class="pctOk(spiritsSum(cat as string)) ? 'ok' : 'err'">{{ (spiritsSum(cat as string)*100).toFixed(1) }}%</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <select :id="`sel_sp_${cat}`" style="flex:1;min-width:0;">
                <option v-for="n in spiritsByType('spirit')" :key="n" :value="n">{{ n }}</option>
              </select>
              <button class="btn btn-primary btn-sm"
                @click="addSpirit(cat as string, (document.getElementById(`sel_sp_${cat}`) as HTMLSelectElement)?.value)">
                + Add spirit
              </button>
            </div>
          </template>
        </div>
      </div>

      <button class="btn btn-success btn-full" @click="save" :disabled="saving">
        {{ saving ? 'Saving…' : '💾 Save Menu' }}
      </button>
    </template>

    <!-- ══ CATALOG TAB ══ -->
    <template v-if="activeTab==='catalog'">
      <!-- Section tabs -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn btn-sm" :class="catSection==='ingredients'?'btn-primary':'btn-ghost'" @click="catSection='ingredients'">🧴 Ingredients</button>
        <button class="btn btn-sm" :class="catSection==='cocktails'?'btn-primary':'btn-ghost'"   @click="catSection='cocktails'">🍸 Cocktails</button>
      </div>

      <!-- ── INGREDIENTS ── -->
      <template v-if="catSection==='ingredients'">
        <button class="btn btn-primary btn-sm btn-full" style="margin-bottom:12px;" @click="showIngForm=!showIngForm">
          {{ showIngForm ? '✕ Cancel' : '+ Add ingredient' }}
        </button>

        <div v-if="showIngForm" class="card card-pad" style="margin-bottom:12px;">
          <div class="grid-2" style="margin-bottom:8px;">
            <div style="grid-column:1/-1;"><label>Name</label><input type="text" v-model="ingForm.name" placeholder="e.g. Rum 70cl" /></div>
            <div><label>Type</label>
              <select v-model="ingForm.type">
                <option>spirit</option><option>beer</option><option>wine</option>
                <option>mixer</option><option>snack</option><option>extra</option>
              </select>
            </div>
            <div><label>ABV (0.40)</label><input type="number" v-model.number="ingForm.abv" step="0.01" min="0" max="1" /></div>
            <div><label>Volume ml</label><input type="number" v-model.number="ingForm.volume_ml" /></div>
            <div><label>Unit</label><input type="text" v-model="ingForm.unit" /></div>
            <div><label>Min price €</label><input type="number" v-model.number="ingForm.price_min" step="0.01" /></div>
            <div><label>Max price €</label><input type="number" v-model.number="ingForm.price_max" step="0.01" /></div>
          </div>
          <button class="btn btn-success btn-full" @click="addIngredient">✅ Add ingredient</button>
        </div>

        <div v-for="(ing, name) in catalog.ingredients" :key="name"
          style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ name }}</div>
              <div style="margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="badge" :class="BADGE[ing.type]??'badge-extra'">{{ ing.type }}</span>
                <span v-if="ing.abv" style="font-size:.75rem;color:var(--muted);">{{ Math.round(ing.abv*100) }}% ABV</span>
                <span v-if="ing.volume_ml" style="font-size:.75rem;color:var(--muted);">{{ ing.volume_ml }}ml</span>
              </div>
            </div>
            <button class="btn btn-danger btn-sm" @click="deleteIngredient(name as string)">✖</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;" v-if="priceEdits[name as string]">
            <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:100px;">
              <span style="font-size:.75rem;color:#4ade80;white-space:nowrap;">Min €</span>
              <input type="number" step="0.01" min="0" v-model.number="priceEdits[name as string].min" style="flex:1;color:#4ade80;min-width:60px;" />
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex:1;min-width:100px;">
              <span style="font-size:.75rem;color:#f87171;white-space:nowrap;">Max €</span>
              <input type="number" step="0.01" min="0" v-model.number="priceEdits[name as string].max" style="flex:1;color:#f87171;min-width:60px;" />
            </div>
            <button class="btn btn-success btn-sm" @click="savePrice(name as string)">
              {{ savingPrice===name ? '✅' : '💾' }}
            </button>
          </div>
        </div>
      </template>

      <!-- ── COCKTAILS ── -->
      <template v-if="catSection==='cocktails'">
        <button class="btn btn-primary btn-sm btn-full" style="margin-bottom:12px;" @click="showCkForm=!showCkForm">
          {{ showCkForm ? '✕ Cancel' : '+ Add cocktail' }}
        </button>

        <div v-if="showCkForm" class="card card-pad" style="margin-bottom:12px;">
          <div class="grid-2" style="margin-bottom:8px;">
            <div style="grid-column:1/-1;"><label>Name</label><input type="text" v-model="ckForm.name" placeholder="e.g. Vodka Tonic" /></div>
            <div><label>Category</label><select v-model="ckForm.category"><option>Spirits</option></select></div>
            <div><label>Main spirit</label>
              <select v-model="ckForm.main_spirit">
                <option v-for="n in spiritIngredients" :key="n" :value="n">{{ n }}</option>
              </select>
            </div>
          </div>
          <div class="section-label" style="margin-bottom:6px;">Recipe</div>
          <div v-for="(row, ingName) in ckRecipe" :key="ingName"
            style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:.85rem;background:var(--surface2);border-radius:6px;padding:5px 8px;">
            <span style="flex:1;">{{ ingName }}</span>
            <span style="color:var(--indigo);">{{ row.quantity }} {{ row.unit }}</span>
            <button class="btn btn-danger btn-sm" @click="removeRecipeRow(ingName as string)">✖</button>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            <select v-model="ckIngSel" style="flex:1;min-width:0;">
              <option v-for="n in allIngredientNames" :key="n" :value="n">{{ n }}</option>
            </select>
            <input type="number" v-model.number="ckIngQty" style="width:64px;" />
            <select v-model="ckIngUnit" style="width:64px;"><option>ml</option><option>kg</option><option>pcs</option></select>
            <button class="btn btn-primary btn-sm" @click="addRecipeRow">+ Add</button>
          </div>
          <button class="btn btn-success btn-full" @click="addCocktail">✅ Create cocktail</button>
        </div>

        <div v-for="(ck, name) in catalog.cocktails" :key="name"
          style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <div style="flex:1;">
              <div style="font-weight:700;font-size:.95rem;">{{ name }}</div>
              <div style="margin-top:3px;">
                <span class="badge badge-spirit">{{ ck.category ?? 'Spirits' }}</span>
                <span style="font-size:.75rem;color:var(--muted);margin-left:6px;">base: {{ ck.main_spirit }}</span>
              </div>
            </div>
            <button class="btn btn-danger btn-sm" @click="deleteCocktail(name as string)">✖</button>
          </div>
          <div style="font-size:.75rem;color:#64748b;line-height:1.6;">
            <span v-for="(det, ing) in ck.recipe" :key="ing"
              style="display:inline-block;background:var(--surface2);border-radius:4px;padding:1px 6px;margin:1px;">
              {{ ing }}: {{ det.quantity }}{{ det.unit ?? 'ml' }}
            </span>
          </div>
        </div>
      </template>

      <!-- Backup -->
      <div class="card card-pad" style="margin-top:24px;">
        <div class="section-label">Data backup</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" @click="exportDB">⬇️ Export backup</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
            ⬆️ Import backup
            <input type="file" accept=".json" @change="importDB" style="display:none;" />
          </label>
        </div>
      </div>
    </template>

  </div>
</template>
