<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../../store/store';
import { savePersonalCocktail, deleteCocktail } from './catalog';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import Slider from '../../components/ui/Slider.vue';
import Field from '../../components/ui/Field.vue';
import Stepper from '../../components/ui/Stepper.vue';
import { shortName } from './ingredients';
import {
  BASE_POUR,
  EXTRA_SPIRIT,
  builderFromCocktail,
  cocktailFromBuilder,
  cocktailsForSpirit,
  emptyBuilder,
  mixerMeasure,
  mixerQtyLabel,
  roundQty,
  servingOf,
  toggleQty,
  type Builder,
} from './cocktailBuilder';

const store = useStore();

// ── Derived from store ───────────────────────────────────────────────────────

const isOpen = computed(() => store.state.cocktailFor !== null);
const ctx = computed(() => store.state.cocktailFor);
const cat = computed(() => ctx.value?.cat ?? '');
const spirit = computed(() => ctx.value?.spirit ?? '');
const spiritShort = computed(() => shortName(spirit.value));

// ── Builder state ─────────────────────────────────────────────────────────────

const builder = ref<Builder | null>(null);

// ── Pick mode data ────────────────────────────────────────────────────────────

/**
 * Every cocktail for this spirit — both built-in classics and the user's own.
 * All of them are editable and deletable; custom ones sort first.
 */
const spiritCocktails = computed(() => {
  const catalog = store.state.catalog;
  if (!catalog || !spirit.value) return [];
  const party = store.activeParty();
  const existing = party?.menu[cat.value]?.spirits[spirit.value]?.drinks ?? {};
  return cocktailsForSpirit(catalog, spirit.value, existing);
});

// ── Build mode data ───────────────────────────────────────────────────────────

const otherSpirits = computed(() => {
  const catalog = store.state.catalog;
  const b = builder.value;
  if (!catalog || !b) return [];
  return Object.entries(catalog.ingredients)
    .filter(([k, v]) => v.type === 'spirit' && k !== spirit.value)
    .map(([k]) => ({
      key: k,
      name: shortName(k),
      on: b.spirits[k] !== undefined,
      qty: b.spirits[k] ?? 0,
    }));
});

const mixerExtras = computed(() => {
  const catalog = store.state.catalog;
  const b = builder.value;
  if (!catalog || !b) return [];
  return Object.entries(catalog.ingredients)
    .filter(([, v]) => v.type === 'mixer' || v.type === 'extra')
    .map(([k, v]) => {
      const isKg = v.unit === 'kg';
      const qty = b.mixers[k] ?? 0;
      return {
        key: k,
        name: shortName(k),
        isKg,
        step: mixerMeasure(isKg).step,
        on: b.mixers[k] !== undefined,
        qty,
        qtyLabel: mixerQtyLabel(qty, isKg),
      };
    });
});

// ── Per-serving summary ───────────────────────────────────────────────────────

const serving = computed(() => {
  const b = builder.value;
  const catalog = store.state.catalog;
  if (!b || !catalog) return { ml: 0, abvPct: 0 };
  return servingOf(catalog, b, spirit.value);
});

const canSave = computed(() => !!builder.value?.name.trim());

// ── Actions ───────────────────────────────────────────────────────────────────

function pickCocktail(key: string): void {
  store.addCocktail(cat.value, spirit.value, key);
  store.closeCocktail();
}

function openBuilder(): void {
  builder.value = emptyBuilder();
}

/** Open the builder pre-filled from an existing cocktail. */
function openEditBuilder(key: string): void {
  const catalog = store.state.catalog;
  const filled = catalog && builderFromCocktail(catalog, key, spirit.value);
  if (filled) builder.value = filled;
}

async function deleteCocktailEntry(key: string): Promise<void> {
  await deleteCocktail(key);
  store.removeCocktail(cat.value, spirit.value, key);
  await store.reloadCatalog();
}

function backToPick(): void {
  builder.value = null;
}

function toggleOtherSpirit(key: string): void {
  if (!builder.value) return;
  builder.value = {
    ...builder.value,
    spirits: toggleQty(builder.value.spirits, key, EXTRA_SPIRIT.start),
  };
}

function setSpirit(key: string, qty: number): void {
  if (!builder.value) return;
  builder.value = {
    ...builder.value,
    spirits: { ...builder.value.spirits, [key]: qty },
  };
}

function toggleMixer(key: string, isKg: boolean): void {
  if (!builder.value) return;
  builder.value = {
    ...builder.value,
    mixers: toggleQty(builder.value.mixers, key, mixerMeasure(isKg).start),
  };
}

function setMixer(key: string, qty: number): void {
  if (!builder.value) return;
  builder.value = {
    ...builder.value,
    mixers: { ...builder.value.mixers, [key]: roundQty(qty) },
  };
}

async function saveCocktail(): Promise<void> {
  const b = builder.value;
  if (!b || !b.name.trim()) return;
  const newName = b.name.trim();

  await savePersonalCocktail(
    newName,
    cocktailFromBuilder(b, spirit.value, cat.value),
  );

  if (b.editKey) {
    // Editing an existing custom cocktail.
    const wasInMenu =
      store.activeParty()?.menu[cat.value]?.spirits[spirit.value]?.drinks?.[
        b.editKey
      ] !== undefined;
    if (b.editKey !== newName) {
      // Renamed — drop the old catalog entry and fix any menu reference.
      await deleteCocktail(b.editKey);
      if (wasInMenu) {
        store.renameCocktailInMenu(cat.value, spirit.value, b.editKey, newName);
      }
    }
    await store.reloadCatalog();
    if (!wasInMenu) store.addCocktail(cat.value, spirit.value, newName);
  } else {
    // Brand-new cocktail — add it to the menu.
    await store.reloadCatalog();
    store.addCocktail(cat.value, spirit.value, newName);
  }

  store.closeCocktail();
}

function handleClose(): void {
  builder.value = null;
  store.closeCocktail();
}

// Reset builder when modal closes
watch(isOpen, (open) => {
  if (!open) builder.value = null;
});
</script>

<template>
  <ModalShell
    :open="isOpen"
    variant="sheet"
    size="md"
    icon="glass"
    @close="handleClose"
  >
    <template #title>{{
      builder
        ? builder.editKey
          ? 'Edit cocktail'
          : 'Custom cocktail'
        : 'Add a ' + spiritShort + ' drink'
    }}</template>

    <!-- PICK MODE -->
    <div v-if="!builder">
      <!-- Cocktails for this spirit — classics + your own, all editable -->
      <template v-if="spiritCocktails.length > 0">
        <div class="cb-heading">Cocktails with {{ spiritShort }}</div>
        <div class="cb-list">
          <div v-for="cc in spiritCocktails" :key="cc.key" class="cb-cocktail">
            <Icon
              :name="cc.custom ? 'sparkle' : 'glass'"
              :size="16"
              class="cb-accent"
            />
            <div class="cb-cocktail__text">
              <div class="cb-cocktail__name">
                {{ cc.key }}
                <span v-if="cc.inMenu" class="cb-badge">on menu</span>
              </div>
              <div class="cb-cocktail__recipe">{{ cc.recipe }}</div>
            </div>
            <!-- Add to menu (only if not already there) -->
            <button
              v-if="!cc.inMenu"
              type="button"
              title="Add to menu"
              :aria-label="`Add ${cc.key} to the menu`"
              class="cb-icon-btn cb-icon-btn--add"
              @click="pickCocktail(cc.key)"
            >
              <Icon name="plus" :size="15" />
            </button>
            <!-- Edit -->
            <button
              type="button"
              title="Edit recipe"
              :aria-label="`Edit ${cc.key}`"
              class="cb-icon-btn"
              @click="openEditBuilder(cc.key)"
            >
              <Icon name="pencil" :size="15" />
            </button>
            <!-- Delete -->
            <button
              type="button"
              title="Delete"
              :aria-label="`Delete ${cc.key}`"
              class="cb-icon-btn cb-icon-btn--delete"
              @click="deleteCocktailEntry(cc.key)"
            >
              <Icon name="trash" :size="15" />
            </button>
          </div>
        </div>
      </template>

      <!-- Build custom -->
      <button type="button" class="cb-build" @click="openBuilder">
        <Icon name="sparkle" :size="16" />
        Build a custom cocktail
      </button>
    </div>

    <!-- BUILD MODE -->
    <div v-else class="cb-form">
      <!-- Cocktail name -->
      <Field v-slot="{ id }" label="Cocktail name">
        <input
          :id="id"
          v-model="builder.name"
          placeholder="e.g. Spicy Paloma"
        />
      </Field>

      <!-- Base spirit slider -->
      <div class="cb-base">
        <div class="cb-base__head">
          <Icon name="bottle" :size="16" class="cb-accent" />
          <span class="cb-base__tag">Base</span>
          <span class="cb-base__name">{{ spiritShort }}</span>
          <span class="cb-base__qty">{{ builder.mainQty }} ml</span>
        </div>
        <Slider
          :model-value="builder.mainQty"
          :label="`${spiritShort} pour`"
          :value-text="`${builder.mainQty} ml`"
          :min="BASE_POUR.min"
          :max="BASE_POUR.max"
          :step="BASE_POUR.step"
          @update:model-value="
            (v) => {
              if (builder) builder.mainQty = v;
            }
          "
        />
      </div>

      <!-- More spirits -->
      <div>
        <div class="cb-heading">
          More spirits
          <span class="cb-heading__note"
            >· for Long Island, Spritz &amp; co.</span
          >
        </div>
        <div class="cb-rows">
          <div
            v-for="s in otherSpirits"
            :key="s.key"
            class="cb-row"
            :class="{ 'is-on': s.on }"
          >
            <button
              type="button"
              role="checkbox"
              :aria-checked="s.on"
              :aria-label="s.name"
              class="cb-check"
              @click="toggleOtherSpirit(s.key)"
            >
              <Icon v-if="s.on" name="check" :size="13" />
            </button>
            <Icon name="glass" :size="15" class="cb-dim" />
            <span class="cb-row__name">{{ s.name }}</span>
            <Stepper
              v-if="s.on"
              :model-value="s.qty"
              :label="s.name"
              :min="0"
              :step="EXTRA_SPIRIT.step"
              unit="ml"
              @update:model-value="(v) => setSpirit(s.key, v)"
            />
          </div>
        </div>
      </div>

      <!-- Mixers & extras -->
      <div>
        <div class="cb-heading">Mixers &amp; extras</div>
        <div class="cb-rows">
          <div
            v-for="m in mixerExtras"
            :key="m.key"
            class="cb-row"
            :class="{ 'is-on': m.on }"
          >
            <button
              type="button"
              role="checkbox"
              :aria-checked="m.on"
              :aria-label="m.name"
              class="cb-check"
              @click="toggleMixer(m.key, m.isKg)"
            >
              <Icon v-if="m.on" name="check" :size="13" />
            </button>
            <Icon name="droplet" :size="15" class="cb-dim" />
            <span class="cb-row__name">{{ m.name }}</span>
            <Stepper
              v-if="m.on"
              :model-value="m.qty"
              :label="m.name"
              :min="0"
              :step="m.step"
              @update:model-value="(v) => setMixer(m.key, v)"
            >
              <span aria-live="polite">{{ m.qtyLabel }}</span>
            </Stepper>
          </div>
        </div>
      </div>

      <!-- Per-serving summary -->
      <div class="cb-serving">
        <span class="cb-serving__label">Per serving</span>
        <span class="cb-serving__ml">{{ serving.ml }} ml</span>
        <span class="cb-serving__abv">≈ {{ serving.abvPct }}% ABV</span>
      </div>

      <!-- Actions -->
      <div class="cb-actions">
        <button type="button" class="cb-back" @click="backToPick">Back</button>
        <button
          type="button"
          :disabled="!canSave"
          class="cb-save"
          @click="saveCocktail"
        >
          {{ builder.editKey ? 'Save changes' : 'Add to menu' }}
        </button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.cb-accent {
  flex-shrink: 0;
  color: var(--accent);
}
.cb-dim {
  color: var(--dim);
}

.cb-heading {
  font-size: 12px;
  color: var(--dim);
  font-weight: 600;
  margin-bottom: 9px;
}
.cb-heading__note {
  color: var(--faint);
  font-weight: 500;
}

/* ── Pick mode ── */
.cb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.cb-cocktail {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
}
.cb-cocktail__text {
  flex: 1;
  min-width: 0;
}
.cb-cocktail__name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.cb-cocktail__recipe {
  font-size: 11px;
  color: var(--faint);
}
.cb-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}

.cb-icon-btn {
  cursor: pointer;
  display: flex;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--dim);
}
.cb-icon-btn--add {
  color: var(--accent);
}
.cb-icon-btn--delete {
  color: var(--faint);
}
.cb-icon-btn--delete:hover {
  border-color: var(--bad);
  color: var(--bad);
}

.cb-build {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  border-radius: var(--rs);
  border: 1.5px dashed var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 14px;
  font-weight: 700;
  min-height: 48px;
}

/* ── Build mode ── */
.cb-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cb-base {
  background: var(--surface2);
  border-radius: var(--rs);
  padding: 13px;
}
.cb-base__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.cb-base__tag {
  font-size: 10px;
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}
.cb-base__name,
.cb-base__qty {
  font-size: 13px;
  font-weight: 600;
}
.cb-base__qty {
  margin-left: auto;
}

.cb-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cb-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  transition:
    background 0.15s,
    border-color 0.15s;
}
.cb-row.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.cb-row__name {
  flex: 1;
  font-size: 13.5px;
  font-weight: 500;
}

.cb-check {
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border);
  background: transparent;
  color: var(--on-accent);
}
.cb-row.is-on .cb-check {
  border-color: var(--accent);
  background: var(--accent);
}

.cb-serving {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 11px 13px;
  border-radius: var(--rs);
  background: var(--surface2);
}
.cb-serving__label {
  font-size: 12px;
  color: var(--dim);
}
.cb-serving__ml {
  font-size: 14px;
  font-weight: 600;
}
.cb-serving__abv {
  margin-left: auto;
  font-size: 11px;
  color: var(--faint);
}

.cb-actions {
  display: flex;
  gap: 9px;
}
.cb-back {
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
.cb-save {
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
.cb-save:disabled {
  background: var(--track);
  opacity: 0.5;
}
</style>
