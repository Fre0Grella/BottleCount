<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../../lib/store';
import {
  savePersonalIngredient,
  deleteIngredient,
  setPriceOverride,
} from '../../lib/catalog';
import type { IngredientType } from '../../lib/types';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

import catalogData from '../../data/catalog.json';
import type { Catalog } from '../../lib/types';

const store = useStore();

// ── Form state ─────────────────────────────────────────────────────────────

interface FormState {
  mode: 'new' | 'edit';
  key?: string; // original ingredient key (edit only)
  name: string;
  type: IngredientType;
  abv: string;
  vol: string;
  unit: string;
  priceMin: string;
  priceMax: string;
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

interface TypeGroup {
  type: IngredientType;
  label: string;
  icon: string;
  color: string;
}

const TYPE_GROUPS: TypeGroup[] = [
  { type: 'beer', label: 'Beer', icon: 'beer', color: 'var(--accent)' },
  { type: 'wine', label: 'Wine', icon: 'wine', color: 'var(--accent)' },
  { type: 'spirit', label: 'Spirits', icon: 'bottle', color: 'var(--accent)' },
  {
    type: 'mixer',
    label: 'Mixers & soft',
    icon: 'droplet',
    color: 'var(--accent)',
  },
  { type: 'extra', label: 'Extras', icon: 'zap', color: 'var(--accent)' },
  { type: 'snack', label: 'Snacks', icon: 'sparkle', color: 'var(--accent)' },
];

// ── Derived ingredient list ────────────────────────────────────────────────

const ingredients = computed(() => {
  const cat = store.state.catalog;
  if (!cat) return {} as Record<string, (typeof cat.ingredients)[string]>;
  return cat.ingredients;
});

function ingsByType(type: IngredientType) {
  return Object.entries(ingredients.value)
    .filter(([, ing]) => ing.type === type)
    .sort(([a], [b]) => a.localeCompare(b));
}

function metaLine(ing: (typeof ingredients.value)[string]): string {
  const parts: string[] = [];
  if (ing.abv && ing.abv > 0) {
    parts.push(`${Math.round(ing.abv * 100)}%`);
  }
  if (ing.volume_ml) {
    parts.push(`${ing.volume_ml} ml`);
  } else if (ing.unit) {
    parts.push(ing.unit);
  }
  const minStr = ing.price_min.toFixed(2);
  const maxStr = ing.price_max.toFixed(2);
  if (minStr === maxStr) {
    parts.push(`€${minStr}`);
  } else {
    parts.push(`€${minStr}–€${maxStr}`);
  }
  return parts.join(' · ');
}

// ── Form field helpers ─────────────────────────────────────────────────────

const hasAbv = computed(() => {
  if (!form.value) return false;
  return ['beer', 'wine', 'spirit'].includes(form.value.type);
});

const hasVol = computed(() => {
  if (!form.value) return false;
  return ['beer', 'wine', 'spirit', 'mixer'].includes(form.value.type);
});

const canSave = computed(() => {
  return !!form.value && form.value.name.trim().length > 0;
});

// ── Actions ────────────────────────────────────────────────────────────────

function openNewForm(type: IngredientType = 'spirit') {
  form.value = {
    mode: 'new',
    name: '',
    type,
    abv: '',
    vol: '',
    unit: '',
    priceMin: '',
    priceMax: '',
  };
}

function openEditForm(key: string) {
  const ing = ingredients.value[key];
  if (!ing) return;
  form.value = {
    mode: 'edit',
    key,
    name: key,
    type: ing.type,
    abv: ing.abv ? String(Math.round(ing.abv * 100)) : '',
    vol: ing.volume_ml ? String(ing.volume_ml) : '',
    unit: ing.unit ?? '',
    priceMin: String(ing.price_min),
    priceMax: String(ing.price_max),
  };
}

async function handleDelete(name: string) {
  await deleteIngredient(name);
  await store.reloadCatalog();
}

async function handleSave() {
  if (!form.value || !canSave.value) return;

  const f = form.value;
  const name = f.name.trim();
  const abvVal = hasAbv.value ? Number(f.abv) / 100 : 0;
  const volVal = hasVol.value ? Number(f.vol) || undefined : undefined;
  const unitVal = !hasVol.value && f.unit.trim() ? f.unit.trim() : undefined;
  const priceMin = Number(f.priceMin) || 0;
  const priceMax = Number(f.priceMax) || 0;

  if (f.mode === 'new') {
    // Always savePersonalIngredient for new
    await savePersonalIngredient(name, {
      type: f.type,
      abv: abvVal,
      volume_ml: volVal,
      unit: unitVal,
      price_min: priceMin,
      price_max: priceMax,
    });
  } else {
    // Edit mode
    const originalKey = f.key ?? name;
    const defaultIngs = (catalogData as Catalog).ingredients;
    const isDefault = !!defaultIngs[originalKey];

    if (isDefault) {
      // For default ingredients, check if only price changed
      const defaultIng = defaultIngs[originalKey]!;
      const defaultAbv = defaultIng.abv ?? 0;
      const defaultVol = defaultIng.volume_ml;
      const defaultUnit = defaultIng.unit;
      const editedAbv = abvVal;
      const editedVol = volVal;

      const onlyPriceChanged =
        Math.abs(defaultAbv - editedAbv) < 0.0001 &&
        defaultVol === editedVol &&
        (defaultUnit ?? '') === (unitVal ?? '') &&
        originalKey === name;

      if (onlyPriceChanged) {
        await setPriceOverride(originalKey, priceMin, priceMax);
      } else {
        // Other fields changed — hide the default and save as personal
        await deleteIngredient(originalKey);
        await savePersonalIngredient(name, {
          type: f.type,
          abv: editedAbv,
          volume_ml: editedVol,
          unit: unitVal,
          price_min: priceMin,
          price_max: priceMax,
        });
      }
    } else {
      // Personal ingredient — just upsert
      await savePersonalIngredient(name, {
        type: f.type,
        abv: abvVal,
        volume_ml: volVal,
        unit: unitVal,
        price_min: priceMin,
        price_max: priceMax,
      });
    }
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
  <Modal
    :open="store.state.ingMgrOpen"
    variant="sheet"
    :max-width="'520px'"
    @close="handleClose"
  >
    <div style="padding: 22px">
      <!-- Header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        "
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            background: var(--accent-soft);
            color: var(--accent);
          "
        >
          <Icon name="tune" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Manage ingredients
        </div>
        <button
          style="
            margin-left: auto;
            cursor: pointer;
            display: flex;
            width: 32px;
            height: 32px;
            align-items: center;
            justify-content: center;
            border: none;
            background: transparent;
            color: var(--dim);
            flex-shrink: 0;
          "
          @click="handleClose"
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

      <!-- LIST mode -->
      <div
        v-if="form === null"
        style="display: flex; flex-direction: column; gap: 14px"
      >
        <div style="font-size: 11.5px; color: var(--dim); line-height: 1.55">
          Edit prices, strength and sizes, or add and remove bottles, mixers and
          extras. Changes feed straight into the shopping math.
        </div>

        <!-- Per-type groups -->
        <div v-for="group in TYPE_GROUPS" :key="group.type">
          <!-- Group header -->
          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 4px;
            "
          >
            <span style="display: flex" :style="{ color: group.color }">
              <Icon :name="group.icon" :size="16" />
            </span>
            <span
              style="
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: var(--dim);
              "
            >
              {{ group.label }}
            </span>
            <button
              style="
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
              "
              @click="openNewForm(group.type)"
            >
              <Icon name="plus" :size="12" />
              Add
            </button>
          </div>

          <!-- Items list -->
          <div style="display: flex; flex-direction: column">
            <div
              v-for="[name, ing] in ingsByType(group.type)"
              :key="name"
              style="
                display: flex;
                align-items: center;
                gap: 11px;
                padding: 10px 2px;
                border-top: 1px solid var(--border);
                min-height: 48px;
              "
            >
              <div style="min-width: 0; flex: 1">
                <div
                  style="
                    font-size: 13.5px;
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  "
                >
                  {{ name }}
                </div>
                <div style="font-size: 11px; color: var(--faint)">
                  {{ metaLine(ing) }}
                </div>
              </div>
              <button
                title="Edit"
                style="
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
                "
                @click="openEditForm(name)"
              >
                <Icon name="pencil" :size="15" />
              </button>
              <button
                title="Remove"
                class="ing-delete-btn"
                style="
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
                  color: var(--faint);
                "
                @click="handleDelete(name)"
              >
                <Icon name="trash" :size="15" />
              </button>
            </div>
          </div>
        </div>

        <!-- Bottom "Add an ingredient" CTA -->
        <button
          style="
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
          "
          @click="openNewForm('spirit')"
        >
          <Icon name="plus" :size="16" />
          Add an ingredient
        </button>
      </div>

      <!-- FORM mode -->
      <div v-else style="display: flex; flex-direction: column; gap: 13px">
        <!-- Form title -->
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 15px;
          "
        >
          {{ form.mode === 'new' ? 'New ingredient' : `Edit ${form.key}` }}
        </div>

        <!-- Type selector (new only) -->
        <div v-if="form.mode === 'new'">
          <div
            style="
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              margin-bottom: 7px;
            "
          >
            Type
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px">
            <button
              v-for="group in TYPE_GROUPS"
              :key="group.type"
              style="
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                padding: 7px 13px;
                border-radius: 999px;
                min-height: 34px;
              "
              :style="{
                border:
                  form.type === group.type
                    ? '1.5px solid var(--accent)'
                    : '1.5px solid var(--border)',
                background:
                  form.type === group.type
                    ? 'var(--accent-soft)'
                    : 'transparent',
                color:
                  form.type === group.type ? 'var(--accent)' : 'var(--dim)',
              }"
              @click="form.type = group.type"
            >
              {{ group.label }}
            </button>
          </div>
        </div>

        <!-- Name -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label style="font-size: 12px; color: var(--dim); font-weight: 600">
            Name
          </label>
          <input
            v-model="form.name"
            placeholder="e.g. Premium Gin 70cl"
            style="
              font-size: 15px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
              font-family: var(--font-body);
              outline: none;
              width: 100%;
              box-sizing: border-box;
            "
          />
        </div>

        <!-- ABV + Volume / Unit (conditional) -->
        <div
          v-if="hasAbv || hasVol || !hasVol"
          style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px"
        >
          <div
            v-if="hasAbv"
            style="display: flex; flex-direction: column; gap: 6px"
          >
            <label style="font-size: 12px; color: var(--dim); font-weight: 600">
              Strength (ABV %)
            </label>
            <input
              v-model="form.abv"
              inputmode="decimal"
              placeholder="0"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                font-family: var(--font-body);
                outline: none;
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
          <div
            v-if="hasVol"
            style="display: flex; flex-direction: column; gap: 6px"
          >
            <label style="font-size: 12px; color: var(--dim); font-weight: 600">
              Bottle size (ml)
            </label>
            <input
              v-model="form.vol"
              inputmode="numeric"
              placeholder="0"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                font-family: var(--font-body);
                outline: none;
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
          <div
            v-if="!hasVol"
            style="display: flex; flex-direction: column; gap: 6px"
          >
            <label style="font-size: 12px; color: var(--dim); font-weight: 600">
              Unit
            </label>
            <input
              v-model="form.unit"
              placeholder="e.g. kg / pcs"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                font-family: var(--font-body);
                outline: none;
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
        </div>

        <!-- Price from / Price to -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label style="font-size: 12px; color: var(--dim); font-weight: 600">
              Price from (€)
            </label>
            <input
              v-model="form.priceMin"
              inputmode="decimal"
              placeholder="0.00"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                font-family: var(--font-body);
                outline: none;
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label style="font-size: 12px; color: var(--dim); font-weight: 600">
              Price to (€)
            </label>
            <input
              v-model="form.priceMax"
              inputmode="decimal"
              placeholder="0.00"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                font-family: var(--font-body);
                outline: none;
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
        </div>

        <!-- Back / Save -->
        <div style="display: flex; gap: 9px">
          <button
            style="
              cursor: pointer;
              flex-shrink: 0;
              padding: 13px 18px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: transparent;
              color: var(--dim);
              font-size: 14px;
              font-weight: 600;
              font-family: var(--font-body);
            "
            @click="form = null"
          >
            Back
          </button>
          <button
            style="
              cursor: pointer;
              flex: 1;
              padding: 13px;
              border-radius: var(--rs);
              border: none;
              font-size: 14px;
              font-weight: 700;
              font-family: var(--font-body);
              color: var(--on-accent);
            "
            :style="{
              background: canSave ? 'var(--accent)' : 'var(--faint)',
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }"
            :disabled="!canSave"
            @click="handleSave"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.ing-delete-btn:hover {
  border-color: var(--bad) !important;
  color: var(--bad) !important;
}
</style>
