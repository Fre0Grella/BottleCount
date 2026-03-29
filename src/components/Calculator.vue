<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { db, getKey, setKey } from '../lib/db';
import { calculate, validateMenu, ALCOHOL_LEVELS } from '../lib/core';
import type { Settings, Catalog, CalculationResult } from '../lib/types';

import defaultCatalog  from '../data/catalog.json';
import defaultSettings from '../data/settings.json';

// ── State ──────────────────────────────────────────────────────────────────
const settings = ref<Settings>(JSON.parse(JSON.stringify(defaultSettings)) as Settings);
const catalog  = ref<Catalog>(JSON.parse(JSON.stringify(defaultCatalog))  as Catalog);
const ready    = ref(false);
const saving   = ref(false);
const activeTab = ref<'settings' | 'menu'>('settings');

const SIMPLE = new Set(['Beer', 'Wine']);

// ── Load from IndexedDB ────────────────────────────────────────────────────
onMounted(async () => {
  await navigator.storage?.persist?.();

  // Load settings
  const saved = await getKey<Settings | null>('settings', null);
  if (saved) settings.value = saved;

  // Merge catalog: defaults + personal overrides
  const hiddenIng    = await getKey<string[]>('hidden_ingredients',   []);
  const hiddenCock   = await getKey<string[]>('hidden_cocktails',     []);
  const personalIng  = await getKey<Record<string, any>>('personal_ingredients', {});
  const personalCock = await getKey<Record<string, any>>('personal_cocktails',   {});
  const overrides    = await getKey<Record<string, any>>('price_overrides',      {});

  const base = JSON.parse(JSON.stringify(defaultCatalog)) as Catalog;
  const ings  = Object.fromEntries(
    Object.entries(base.ingredients).filter(([k]) => !hiddenIng.includes(k))
  );
  for (const [k, v] of Object.entries(overrides)) {
    if (ings[k]) ings[k] = { ...ings[k], ...v };
  }
  Object.assign(ings, personalIng);

  const cocks = Object.fromEntries(
    Object.entries(base.cocktails).filter(([k]) => !hiddenCock.includes(k))
  );
  Object.assign(cocks, personalCock);

  catalog.value = { ingredients: ings, cocktails: cocks };
  ready.value   = true;
});

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
function normalise(obj: Record<string, number>) {
  const total = Object.values(obj).reduce((s, v) => s + v, 0);
  if (total === 0) return;
  for (const k of Object.keys(obj)) obj[k] = obj[k] / total;
}

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

// ── Cocktails for a spirit ─────────────────────────────────────────────────
function cocktailsFor(spiritName: string) {
  return Object.entries(catalog.value.cocktails)
    .filter(([, ck]) => ck.main_spirit === spiritName)
    .map(([name]) => name);
}
// ── Spirits by type ────────────────────────────────────────────────────────
function spiritsByType(type: 'spirit' | 'beer' | 'wine') {
  return Object.entries(catalog.value.ingredients)
    .filter(([, ing]) => ing.type === type)
    .map(([name]) => name);
}

// ── Export ─────────────────────────────────────────────────────────────────
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

const BADGE: Record<string, string> = {
  spirit: 'badge-spirit', beer: 'badge-beer', wine: 'badge-wine',
  mixer: 'badge-mixer', snack: 'badge-snack', extra: 'badge-extra',
};
</script>

<template>
  <div v-if="!ready" style="text-align:center;padding:60px;color:var(--muted);">Loading…</div>
  <div v-else>

    <!-- ── Tabs ── -->
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="btn btn-sm" :class="activeTab==='settings' ? 'btn-primary' : 'btn-ghost'" @click="activeTab='settings'">⚙️ Settings</button>
      <button class="btn btn-sm" :class="activeTab==='menu'     ? 'btn-primary' : 'btn-ghost'" @click="activeTab='menu'">🍹 Drink Menu</button>
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

          <!-- Simple (Beer / Wine) -->
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

          <!-- Spirits (3-level) -->
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

              <!-- Drinks level -->
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

  </div>
</template>
