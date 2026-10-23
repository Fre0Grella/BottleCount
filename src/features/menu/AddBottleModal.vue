<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../../store/store';
import { savePersonalIngredient } from './catalog';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import Field from '../../components/ui/Field.vue';
import { TYPE_META } from './ingredientTypes';
import {
  bottleDefaults,
  bottleFromFields,
  bottleMetaLine,
  bottleTypeFor,
  shortName,
  type BottleFields,
} from './ingredients';

const store = useStore();

// ── Derived from store ───────────────────────────────────────────────────────

const isOpen = computed(() => store.state.bottleFor !== null);
const cat = computed(() => store.state.bottleFor ?? '');

/** beer, wine or spirit: what this category is stocked with. */
const bottleType = computed(() => bottleTypeFor(cat.value));

const namePlaceholder = computed(
  () => bottleDefaults(bottleType.value).placeholder,
);

const bottleOptions = computed(() => {
  const catalog = store.pickerCatalog();
  if (!catalog || !cat.value) return [];
  const party = store.activeParty();
  if (!party) return [];
  const catEntry = party.menu[cat.value];
  if (!catEntry) return [];
  return Object.entries(catalog.ingredients)
    .filter(([k, v]) => v.type === bottleType.value && !catEntry.spirits[k])
    .map(([k, v]) => ({
      key: k,
      name: shortName(k),
      icon: TYPE_META[v.type].icon,
      meta: bottleMetaLine(v),
    }));
});

// ── Custom form state ────────────────────────────────────────────────────────

const customForm = ref<BottleFields | null>(null);

function openCustomForm(): void {
  const d = bottleDefaults(bottleType.value);
  customForm.value = {
    name: '',
    abv: d.abv,
    vol: d.vol,
    priceMin: '',
    priceMax: '',
  };
}

function cancelCustomForm(): void {
  customForm.value = null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

function pickBottle(key: string): void {
  store.addBottle(cat.value, key);
  store.closeBottle();
}

async function saveCustomBottle(): Promise<void> {
  const f = customForm.value;
  if (!f || !f.name.trim()) return;
  await savePersonalIngredient(
    f.name.trim(),
    bottleFromFields(bottleType.value, f),
  );
  await store.libraryEdited('ingredients', f.name.trim());
  store.addBottle(cat.value, f.name.trim());
  store.closeBottle();
}

function handleClose(): void {
  customForm.value = null;
  store.closeBottle();
}

// Reset custom form whenever the modal closes
watch(isOpen, (open) => {
  if (!open) customForm.value = null;
});

const canSave = computed(() => !!customForm.value?.name.trim());
</script>

<template>
  <ModalShell
    :open="isOpen"
    variant="sheet"
    size="md"
    icon="bottle"
    @close="handleClose"
  >
    <template #title>Add to {{ cat }}</template>

    <!-- PICK MODE -->
    <div v-if="!customForm" class="ab-pick">
      <!-- Empty state -->
      <div v-if="bottleOptions.length === 0" class="ab-empty">
        No more {{ bottleType }}s to add — all catalog options are already on
        your menu.
      </div>

      <!-- Option rows -->
      <button
        v-for="opt in bottleOptions"
        :key="opt.key"
        type="button"
        class="ab-option"
        @click="pickBottle(opt.key)"
      >
        <Icon :name="opt.icon" :size="16" class="ab-accent" />
        <div class="ab-option__text">
          <div class="ab-option__name">{{ opt.name }}</div>
          <div class="ab-option__meta">{{ opt.meta }}</div>
        </div>
        <Icon name="plus" :size="16" class="ab-accent" />
      </button>

      <!-- Create your own -->
      <button type="button" class="ab-create" @click="openCustomForm">
        <Icon name="sparkle" :size="16" />
        Create your own {{ bottleType }}
      </button>
    </div>

    <!-- CUSTOM FORM MODE -->
    <div v-else class="ab-form">
      <Field v-slot="{ id }" label="Name">
        <input
          :id="id"
          v-model="customForm.name"
          :placeholder="namePlaceholder"
        />
      </Field>

      <!-- 2x2 grid -->
      <div class="ab-grid">
        <Field v-slot="{ id }" label="Strength (ABV %)">
          <input :id="id" v-model="customForm.abv" inputmode="decimal" />
        </Field>
        <Field v-slot="{ id }" label="Bottle size (ml)">
          <input :id="id" v-model="customForm.vol" inputmode="numeric" />
        </Field>
      </div>

      <div class="ab-grid">
        <Field v-slot="{ id }" label="Price from (€)">
          <input
            :id="id"
            v-model="customForm.priceMin"
            inputmode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field v-slot="{ id }" label="Price to (€)">
          <input
            :id="id"
            v-model="customForm.priceMax"
            inputmode="decimal"
            placeholder="0.00"
          />
        </Field>
      </div>

      <!-- Actions -->
      <div class="ab-actions">
        <button type="button" class="ab-back" @click="cancelCustomForm">
          Back
        </button>
        <button
          type="button"
          :disabled="!canSave"
          class="ab-save"
          @click="saveCustomBottle"
        >
          Add to menu
        </button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.ab-pick {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ab-empty {
  padding: 20px;
  text-align: center;
  color: var(--faint);
  font-size: 13px;
}

.ab-accent {
  flex-shrink: 0;
  color: var(--accent);
}

.ab-option {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  text-align: left;
  transition: border-color 0.15s;
}
.ab-option:hover {
  border-color: var(--accent);
}
.ab-option__text {
  flex: 1;
  min-width: 0;
}
.ab-option__name {
  font-size: 14px;
  font-weight: 600;
}
.ab-option__meta {
  font-size: 11px;
  color: var(--faint);
}

.ab-create {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
  padding: 13px;
  border-radius: var(--rs);
  border: 1.5px dashed var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  min-height: 46px;
  width: 100%;
}

.ab-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ab-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ab-actions {
  display: flex;
  gap: 9px;
}
.ab-back {
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
.ab-save {
  cursor: pointer;
  flex: 1;
  padding: 13px;
  border-radius: var(--rs);
  border: none;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 14px;
  font-weight: 700;
  transition: opacity 0.15s;
}
.ab-save:disabled {
  background: var(--track);
  opacity: 0.5;
}
</style>
