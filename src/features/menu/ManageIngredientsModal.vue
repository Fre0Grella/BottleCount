<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../../store/store';
import {
  savePersonalIngredient,
  deleteIngredient,
  setPriceOverride,
} from './catalog';
import type { Catalog, Ingredient, IngredientType } from '../../lib/types';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import Field from '../../components/ui/Field.vue';
import { TYPE_META } from './ingredientTypes';
import {
  builtInEdit,
  emptyIngredientFields,
  fieldsFromIngredient,
  ingredientFromFields,
  ingredientMetaLine,
  typeHasAbv,
  typeHasVolume,
  type IngredientFields,
} from './ingredients';

import catalogData from '../../data/catalog.json';

const store = useStore();

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState extends IngredientFields {
  mode: 'new' | 'edit';
  key?: string; // original ingredient key (edit only)
}

const form = ref<FormState | null>(null);

// Reset form when modal closes
watch(
  () => store.state.ingMgrOpen,
  (open) => {
    if (!open) form.value = null;
  },
);

// ── Type groups ────────────────────────────────────────────────────────────

const TYPE_GROUPS = (
  ['beer', 'wine', 'spirit', 'mixer', 'extra', 'snack'] as IngredientType[]
).map((type) => ({ type, ...TYPE_META[type] }));

// ── Derived ingredient list ────────────────────────────────────────────────

const ingredients = computed<Record<string, Ingredient>>(
  () => store.state.catalog?.ingredients ?? {},
);

function ingsByType(type: IngredientType) {
  return Object.entries(ingredients.value)
    .filter(([, ing]) => ing.type === type)
    .sort(([a], [b]) => a.localeCompare(b));
}

// ── Form field helpers ─────────────────────────────────────────────────────

const hasAbv = computed(() => !!form.value && typeHasAbv(form.value.type));
const hasVol = computed(() => !!form.value && typeHasVolume(form.value.type));

const canSave = computed(() => {
  return !!form.value && form.value.name.trim().length > 0;
});

// ── Actions ────────────────────────────────────────────────────────────────

function openNewForm(type: IngredientType = 'spirit') {
  form.value = { mode: 'new', ...emptyIngredientFields(type) };
}

function openEditForm(key: string) {
  const ing = ingredients.value[key];
  if (!ing) return;
  form.value = { mode: 'edit', key, ...fieldsFromIngredient(key, ing) };
}

async function handleDelete(name: string) {
  await deleteIngredient(name);
  await store.reloadCatalog();
}

async function handleSave() {
  if (!form.value || !canSave.value) return;

  const f = form.value;
  const name = f.name.trim();
  const edited = ingredientFromFields(f);

  // A built-in ingredient keeps its entry when only the price changed;
  // otherwise it is hidden and the edit saved as a personal one. New and
  // personal ingredients are simply upserted.
  const originalKey = f.key ?? name;
  const builtIn =
    f.mode === 'edit'
      ? (catalogData as Catalog).ingredients[originalKey]
      : undefined;
  if (!builtIn) {
    await savePersonalIngredient(name, edited);
  } else if (builtInEdit(builtIn, originalKey, edited, name) === 'replace') {
    await deleteIngredient(originalKey);
    await savePersonalIngredient(name, edited);
  } else {
    await setPriceOverride(originalKey, edited.price_min, edited.price_max);
  }

  await store.reloadCatalog();
  form.value = null;
}

function handleClose() {
  form.value = null;
  store.closeIngMgr();
}
</script>

<template>
  <ModalShell
    :open="store.state.ingMgrOpen"
    variant="sheet"
    size="lg"
    icon="tune"
    title="Manage ingredients"
    @close="handleClose"
  >
    <!-- LIST mode -->
    <div v-if="form === null" class="ing-list">
      <div class="ing-intro">
        Edit prices, strength and sizes, or add and remove bottles, mixers and
        extras. Changes feed straight into the shopping math.
      </div>

      <!-- Per-type groups -->
      <div v-for="group in TYPE_GROUPS" :key="group.type">
        <!-- Group header -->
        <div class="ing-group__head">
          <Icon :name="group.icon" :size="16" class="ing-accent" />
          <span class="ing-group__label">{{ group.label }}</span>
          <button
            type="button"
            :aria-label="`Add to ${group.label}`"
            class="ing-group__add"
            @click="openNewForm(group.type)"
          >
            <Icon name="plus" :size="12" />
            Add
          </button>
        </div>

        <!-- Items list -->
        <div class="ing-items">
          <div
            v-for="[name, ing] in ingsByType(group.type)"
            :key="name"
            class="ing-item"
          >
            <div class="ing-item__text">
              <div class="ing-item__name">{{ name }}</div>
              <div class="ing-item__meta">{{ ingredientMetaLine(ing) }}</div>
            </div>
            <button
              type="button"
              title="Edit"
              :aria-label="`Edit ${name}`"
              class="ing-icon-btn"
              @click="openEditForm(name)"
            >
              <Icon name="pencil" :size="15" />
            </button>
            <button
              type="button"
              title="Remove"
              :aria-label="`Remove ${name}`"
              class="ing-icon-btn ing-icon-btn--delete"
              @click="handleDelete(name)"
            >
              <Icon name="trash" :size="15" />
            </button>
          </div>
        </div>
      </div>

      <!-- Bottom "Add an ingredient" CTA -->
      <button type="button" class="ing-cta" @click="openNewForm('spirit')">
        <Icon name="plus" :size="16" />
        Add an ingredient
      </button>
    </div>

    <!-- FORM mode -->
    <div v-else class="ing-form">
      <!-- Form title -->
      <div class="ing-form__title">
        {{ form.mode === 'new' ? 'New ingredient' : `Edit ${form.key}` }}
      </div>

      <!-- Type selector (new only) -->
      <div v-if="form.mode === 'new'">
        <div id="ing-type-label" class="ing-type__label">Type</div>
        <div class="ing-types" role="group" aria-labelledby="ing-type-label">
          <button
            v-for="group in TYPE_GROUPS"
            :key="group.type"
            type="button"
            :aria-pressed="form.type === group.type"
            class="ing-type"
            :class="{ 'is-on': form.type === group.type }"
            @click="form.type = group.type"
          >
            {{ group.label }}
          </button>
        </div>
      </div>

      <!-- Name -->
      <Field v-slot="{ id }" label="Name">
        <input
          :id="id"
          v-model="form.name"
          placeholder="e.g. Premium Gin 70cl"
        />
      </Field>

      <!-- ABV + Volume / Unit (by type) -->
      <div class="ing-grid">
        <Field v-if="hasAbv" v-slot="{ id }" label="Strength (ABV %)">
          <input
            :id="id"
            v-model="form.abv"
            inputmode="decimal"
            placeholder="0"
          />
        </Field>
        <Field v-if="hasVol" v-slot="{ id }" label="Bottle size (ml)">
          <input
            :id="id"
            v-model="form.vol"
            inputmode="numeric"
            placeholder="0"
          />
        </Field>
        <Field v-else v-slot="{ id }" label="Unit">
          <input :id="id" v-model="form.unit" placeholder="e.g. kg / pcs" />
        </Field>
      </div>

      <!-- Price from / Price to -->
      <div class="ing-grid">
        <Field v-slot="{ id }" label="Price from (€)">
          <input
            :id="id"
            v-model="form.priceMin"
            inputmode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field v-slot="{ id }" label="Price to (€)">
          <input
            :id="id"
            v-model="form.priceMax"
            inputmode="decimal"
            placeholder="0.00"
          />
        </Field>
      </div>

      <!-- Back / Save -->
      <div class="ing-actions">
        <button type="button" class="ing-back" @click="form = null">
          Back
        </button>
        <button
          type="button"
          class="ing-save"
          :disabled="!canSave"
          @click="handleSave"
        >
          Save
        </button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.ing-accent {
  color: var(--accent);
}

/* ── List ── */
.ing-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ing-intro {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.55;
}

.ing-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.ing-group__label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dim);
}
.ing-group__add {
  margin-left: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--dim);
  min-height: 32px;
}

.ing-items {
  display: flex;
  flex-direction: column;
}
.ing-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 2px;
  border-top: 1px solid var(--border);
  min-height: 48px;
}
.ing-item__text {
  min-width: 0;
  flex: 1;
}
.ing-item__name {
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ing-item__meta {
  font-size: 11px;
  color: var(--faint);
}

.ing-icon-btn {
  cursor: pointer;
  display: flex;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--dim);
}
.ing-icon-btn--delete {
  color: var(--faint);
}
.ing-icon-btn--delete:hover {
  border-color: var(--bad);
  color: var(--bad);
}

.ing-cta {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: var(--rs);
  border: 1.5px dashed var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 14px;
  font-weight: 700;
  min-height: 48px;
}

/* ── Form ── */
.ing-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.ing-form__title {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 15px;
}

.ing-type__label {
  font-size: 12px;
  color: var(--dim);
  font-weight: 600;
  margin-bottom: 7px;
}
.ing-types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ing-type {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 13px;
  border-radius: 999px;
  min-height: 34px;
  border: 1.5px solid var(--border);
  background: transparent;
  color: var(--dim);
}
.ing-type.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.ing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ing-actions {
  display: flex;
  gap: 9px;
}
.ing-back {
  cursor: pointer;
  flex-shrink: 0;
  padding: 13px 18px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--dim);
  font-size: 14px;
  font-weight: 600;
}
.ing-save {
  cursor: pointer;
  flex: 1;
  padding: 13px;
  border-radius: var(--rs);
  border: none;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 14px;
  font-weight: 700;
}
.ing-save:disabled {
  background: var(--faint);
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
