<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../../lib/store';
import { savePersonalIngredient } from '../../lib/catalog';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

// ── Helpers ─────────────────────────────────────────────────────────────────

function shortName(key: string): string {
  return key.replace(/\s+\d+(?:cl|ml|L|kg|g)$/i, '').trim();
}

function typeIcon(t: string): string {
  if (t === 'beer') return 'beer';
  if (t === 'wine') return 'wine';
  return 'bottle';
}

// ── Derived from store ───────────────────────────────────────────────────────

const isOpen = computed(() => store.state.bottleFor !== null);
const cat = computed(() => store.state.bottleFor ?? '');

const wantType = computed(() => {
  if (cat.value === 'Beer') return 'beer';
  if (cat.value === 'Wine') return 'wine';
  return 'spirit';
});

const thingLabel = computed(() => {
  if (cat.value === 'Beer') return 'beer';
  if (cat.value === 'Wine') return 'wine';
  return 'spirit';
});

const namePlaceholder = computed(() => {
  if (thingLabel.value === 'spirit') return 'e.g. Mezcal';
  if (thingLabel.value === 'beer') return 'e.g. Craft IPA 33cl';
  return 'e.g. Prosecco';
});

const bottleOptions = computed(() => {
  const catalog = store.state.catalog;
  if (!catalog || !cat.value) return [];
  const party = store.activeParty();
  if (!party) return [];
  const catEntry = party.menu[cat.value];
  if (!catEntry) return [];
  return Object.entries(catalog.ingredients)
    .filter(([k, v]) => v.type === wantType.value && !catEntry.spirits[k])
    .map(([k, v]) => ({
      key: k,
      name: shortName(k),
      icon: typeIcon(v.type),
      meta:
        (v.abv ? Math.round(v.abv * 100) + '% ABV · ' : '') +
        '€' +
        v.price_min.toFixed(2) +
        '–' +
        v.price_max.toFixed(2),
    }));
});

// ── Custom form state ────────────────────────────────────────────────────────

interface CustomForm {
  name: string;
  abv: string;
  vol: string;
  priceMin: string;
  priceMax: string;
}

const customForm = ref<CustomForm | null>(null);

function defaultsForType(): { abv: string; vol: string } {
  if (cat.value === 'Beer') return { abv: '5', vol: '660' };
  if (cat.value === 'Wine') return { abv: '12', vol: '750' };
  return { abv: '40', vol: '700' };
}

function openCustomForm(): void {
  const d = defaultsForType();
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
  const abvNum = parseFloat(f.abv) || 0;
  const volNum = parseInt(f.vol, 10) || 0;
  const priceMin = parseFloat(f.priceMin) || 0;
  const priceMax = parseFloat(f.priceMax) || 0;
  await savePersonalIngredient(f.name.trim(), {
    type: wantType.value as 'spirit' | 'beer' | 'wine',
    abv: abvNum / 100,
    volume_ml: volNum,
    price_min: priceMin,
    price_max: priceMax,
  });
  await store.reloadCatalog();
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
  <Modal :open="isOpen" variant="sheet" max-width="460px" @close="handleClose">
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
            background: var(--accent-soft);
            color: var(--accent);
            flex-shrink: 0;
          "
        >
          <Icon name="bottle" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Add to {{ cat }}
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

      <!-- PICK MODE -->
      <div
        v-if="!customForm"
        style="display: flex; flex-direction: column; gap: 8px"
      >
        <!-- Empty state -->
        <div
          v-if="bottleOptions.length === 0"
          style="
            padding: 20px;
            text-align: center;
            color: var(--faint);
            font-size: 13px;
          "
        >
          No more {{ thingLabel }}s to add — all catalog options are already on
          your menu.
        </div>

        <!-- Option rows -->
        <button
          v-for="opt in bottleOptions"
          :key="opt.key"
          style="
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
          "
          @click="pickBottle(opt.key)"
          @mouseenter="
            ($event.currentTarget as HTMLElement).style.borderColor =
              'var(--accent)'
          "
          @mouseleave="
            ($event.currentTarget as HTMLElement).style.borderColor =
              'var(--border)'
          "
        >
          <span style="display: flex; color: var(--accent); flex-shrink: 0">
            <Icon :name="opt.icon" :size="16" />
          </span>
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 14px; font-weight: 600">{{ opt.name }}</div>
            <div style="font-size: 11px; color: var(--faint)">
              {{ opt.meta }}
            </div>
          </div>
          <span style="display: flex; color: var(--accent); flex-shrink: 0">
            <Icon name="plus" :size="16" />
          </span>
        </button>

        <!-- Create your own -->
        <button
          style="
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
          "
          @click="openCustomForm"
        >
          <span style="display: flex"><Icon name="sparkle" :size="16" /></span>
          Create your own {{ thingLabel }}
        </button>
      </div>

      <!-- CUSTOM FORM MODE -->
      <div v-else style="display: flex; flex-direction: column; gap: 12px">
        <!-- Name -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label style="font-size: 12px; color: var(--dim); font-weight: 600"
            >Name</label
          >
          <input
            v-model="customForm.name"
            :placeholder="namePlaceholder"
            style="
              font-size: 15px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
              width: 100%;
              box-sizing: border-box;
            "
          />
        </div>

        <!-- 2x2 grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label style="font-size: 12px; color: var(--dim); font-weight: 600"
              >Strength (ABV %)</label
            >
            <input
              v-model="customForm.abv"
              inputmode="decimal"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label style="font-size: 12px; color: var(--dim); font-weight: 600"
              >Bottle size (ml)</label
            >
            <input
              v-model="customForm.vol"
              inputmode="numeric"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label style="font-size: 12px; color: var(--dim); font-weight: 600"
              >Price from (€)</label
            >
            <input
              v-model="customForm.priceMin"
              inputmode="decimal"
              placeholder="0.00"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px">
            <label style="font-size: 12px; color: var(--dim); font-weight: 600"
              >Price to (€)</label
            >
            <input
              v-model="customForm.priceMax"
              inputmode="decimal"
              placeholder="0.00"
              style="
                font-size: 15px;
                padding: 11px 13px;
                border-radius: var(--rs);
                border: 1px solid var(--border);
                background: var(--surface2);
                color: var(--text);
                width: 100%;
                box-sizing: border-box;
              "
            />
          </div>
        </div>

        <!-- Actions -->
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
            "
            @click="cancelCustomForm"
          >
            Back
          </button>
          <button
            :disabled="!canSave"
            style="
              cursor: pointer;
              flex: 1;
              padding: 13px;
              border-radius: var(--rs);
              border: none;
              font-size: 14px;
              font-weight: 700;
              transition: opacity 0.15s;
            "
            :style="{
              background: canSave ? 'var(--accent)' : 'var(--track)',
              color: 'var(--on-accent)',
              opacity: canSave ? '1' : '0.5',
            }"
            @click="saveCustomBottle"
          >
            Add to menu
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
