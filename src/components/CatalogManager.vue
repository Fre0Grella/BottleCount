<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getKey, setKey } from '../lib/db';
import type { Catalog, Ingredient, Cocktail, CocktailRecipeItem } from '../lib/types';
import defaultCatalog from '../data/catalog.json';

// ── State ──────────────────────────────────────────────────────────────────
const catalog        = ref<Catalog>({ ingredients: {}, cocktails: {} });
const ready          = ref(false);
const section        = ref<'ingredients' | 'cocktails'>('ingredients');
const showIngForm    = ref(false);
const showCkForm     = ref(false);

// Ingredient form
const ingForm = ref({ name: '', type: 'spirit', abv: 0, volume_ml: 700, unit: 'ml', price_min: 0, price_max: 0 });

// Cocktail form
const ckForm   = ref({ name: '', main_spirit: '', category: 'Spirits' });
const ckRecipe = ref<Record<string, { quantity: number; unit: string }>>({});
const ckIngSel = ref('');
const ckIngQty = ref(50);
const ckIngUnit = ref('ml');

const savingPrice = ref<string | null>(null);
const priceEdits  = ref<Record<string, { min: number; max: number }>>({});

// ── Load ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  const hiddenIng    = await getKey<string[]>('hidden_ingredients',    []);
  const hiddenCock   = await getKey<string[]>('hidden_cocktails',      []);
  const personalIng  = await getKey<Record<string, Ingredient>>('personal_ingredients', {});
  const personalCock = await getKey<Record<string, Cocktail>>('personal_cocktails',   {});
  const overrides    = await getKey<Record<string, Partial<Ingredient>>>('price_overrides', {});

  const base = JSON.parse(JSON.stringify(defaultCatalog)) as Catalog;

  const ings = Object.fromEntries(
    Object.entries(base.ingredients).filter(([k]) => !hiddenIng.includes(k))
  ) as Record<string, Ingredient>;
  for (const [k, v] of Object.entries(overrides)) {
    if (ings[k]) ings[k] = { ...ings[k], ...v } as Ingredient;
  }
  Object.assign(ings, personalIng);

  const cocks = Object.fromEntries(
    Object.entries(base.cocktails).filter(([k]) => !hiddenCock.includes(k))
  ) as Record<string, Cocktail>;
  Object.assign(cocks, personalCock);

  catalog.value = { ingredients: ings, cocktails: cocks };

  // Init price edit state
  for (const [name, ing] of Object.entries(ings)) {
    priceEdits.value[name] = { min: ing.price_min, max: ing.price_max };
  }

  // Default cocktail form spirit
  const spirits = Object.entries(ings).filter(([, i]) => i.type === 'spirit');
  if (spirits.length) ckForm.value.main_spirit = spirits[0][0];
  if (Object.keys(ings).length) ckIngSel.value = Object.keys(ings)[0];

  ready.value = true;
});

// ── Computed ───────────────────────────────────────────────────────────────
const spiritIngredients = computed(() =>
  Object.entries(catalog.value.ingredients).filter(([, i]) => i.type === 'spirit').map(([n]) => n)
);
const allIngredientNames = computed(() => Object.keys(catalog.value.ingredients));

const BADGE: Record<string, string> = {
  spirit: 'badge-spirit', beer: 'badge-beer', wine: 'badge-wine',
  mixer: 'badge-mixer', snack: 'badge-snack', extra: 'badge-extra',
};

// ── Ingredient CRUD ────────────────────────────────────────────────────────
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

// ── Cocktail CRUD ──────────────────────────────────────────────────────────
function addRecipeRow() {
  if (!ckIngSel.value) return;
  ckRecipe.value[ckIngSel.value] = { quantity: ckIngQty.value, unit: ckIngUnit.value };
}
function removeRecipeRow(name: string) {
  delete ckRecipe.value[name];
}

async function addCocktail() {
  const name = ckForm.value.name.trim();
  if (!name || catalog.value.cocktails[name]) { alert('Name missing or already exists'); return; }
  if (Object.keys(ckRecipe.value).length === 0) { alert('Add at least one ingredient to the recipe'); return; }

  const personal = await getKey<Record<string, Cocktail>>('personal_cocktails', {});
  const newCk: Cocktail = {
    main_spirit: ckForm.value.main_spirit,
    category:    ckForm.value.category,
    recipe:      Object.fromEntries(
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
</script>

<template>
  <div v-if="!ready" style="text-align:center;padding:40px;color:var(--muted);">Loading catalog…</div>
  <div v-else>
    <h1 style="font-size:1.1rem;font-weight:800;margin:24px 0 12px;">📚 Catalog</h1>

    <!-- Section tabs -->
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="btn btn-sm" :class="section==='ingredients'?'btn-primary':'btn-ghost'" @click="section='ingredients'">🧴 Ingredients</button>
      <button class="btn btn-sm" :class="section==='cocktails'?'btn-primary':'btn-ghost'"   @click="section='cocktails'">🍸 Cocktails</button>
    </div>

    <!-- ══ INGREDIENTS ══ -->
    <template v-if="section==='ingredients'">
      <button class="btn btn-primary btn-sm btn-full" style="margin-bottom:12px;" @click="showIngForm=!showIngForm">
        {{ showIngForm ? '✕ Cancel' : '+ Add ingredient' }}
      </button>

      <!-- Add form -->
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

      <!-- List -->
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
        <!-- Inline price editor -->
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

    <!-- ══ COCKTAILS ══ -->
    <template v-if="section==='cocktails'">
      <button class="btn btn-primary btn-sm btn-full" style="margin-bottom:12px;" @click="showCkForm=!showCkForm">
        {{ showCkForm ? '✕ Cancel' : '+ Add cocktail' }}
      </button>

      <!-- Add form -->
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

      <!-- List -->
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

    <!-- ── Backup / Restore ── -->
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
  </div>
</template>
