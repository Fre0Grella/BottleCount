<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStore } from '../../lib/store';
import { savePersonalCocktail } from '../../lib/catalog';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';
import Slider from '../Slider.vue';

const store = useStore();

// ── Helpers ─────────────────────────────────────────────────────────────────

function shortName(key: string): string {
  return key.replace(/\s+\d+(?:cl|ml|L|kg|g)$/i, '').trim();
}

// ── Derived from store ───────────────────────────────────────────────────────

const isOpen = computed(() => store.state.cocktailFor !== null);
const ctx = computed(() => store.state.cocktailFor);
const cat = computed(() => ctx.value?.cat ?? '');
const spirit = computed(() => ctx.value?.spirit ?? '');
const spiritShort = computed(() => shortName(spirit.value));

// ── Builder state ─────────────────────────────────────────────────────────────

interface Builder {
  name: string;
  mainQty: number;
  spirits: Record<string, number>;
  mixers: Record<string, number>;
}

const builder = ref<Builder | null>(null);

// ── Pick mode data ────────────────────────────────────────────────────────────

const presetCocktails = computed(() => {
  const catalog = store.state.catalog;
  if (!catalog || !spirit.value) return [];
  const party = store.activeParty();
  if (!party) return [];
  const catEntry = party.menu[cat.value];
  const spiritEntry = catEntry?.spirits[spirit.value];
  const existing = spiritEntry?.drinks ?? {};
  return Object.entries(catalog.cocktails)
    .filter(([k, v]) => v.main_spirit === spirit.value && !existing[k])
    .map(([k, v]) => ({
      key: k,
      name: k,
      recipe: Object.keys(v.recipe)
        .map((x) => shortName(x))
        .join(' + '),
    }));
});

// ── Build mode data ───────────────────────────────────────────────────────────

const otherSpirits = computed(() => {
  const catalog = store.state.catalog;
  if (!catalog || !builder.value) return [];
  return Object.entries(catalog.ingredients)
    .filter(([k, v]) => v.type === 'spirit' && k !== spirit.value)
    .map(([k]) => ({
      key: k,
      name: shortName(k),
      on: builder.value!.spirits[k] !== undefined,
      qty: builder.value!.spirits[k] ?? 0,
    }));
});

const mixerExtras = computed(() => {
  const catalog = store.state.catalog;
  if (!catalog || !builder.value) return [];
  return Object.entries(catalog.ingredients)
    .filter(([, v]) => v.type === 'mixer' || v.type === 'extra')
    .map(([k, v]) => {
      const isKg = v.unit === 'kg';
      const on = builder.value!.mixers[k] !== undefined;
      const qty = builder.value!.mixers[k] ?? 0;
      const step = isKg ? 0.05 : 25;
      const unit = isKg ? ' kg' : ' ml';
      return {
        key: k,
        name: shortName(k),
        isKg,
        step,
        unit,
        on,
        qty,
        qtyLabel: (isKg ? qty.toFixed(2) : qty) + unit,
      };
    });
});

// ── Per-serving summary ───────────────────────────────────────────────────────

const serving = computed(() => {
  const b = builder.value;
  const catalog = store.state.catalog;
  if (!b || !catalog) return { ml: 0, abvPct: 0 };
  const mainAbv = catalog.ingredients[spirit.value]?.abv ?? 0.4;
  let totalMl = b.mainQty;
  let totalAlc = b.mainQty * mainAbv;

  for (const [k, q] of Object.entries(b.spirits)) {
    totalMl += q;
    totalAlc += q * (catalog.ingredients[k]?.abv ?? 0);
  }
  for (const [k, q] of Object.entries(b.mixers)) {
    if (catalog.ingredients[k]?.unit !== 'kg') totalMl += q;
  }

  const abvPct = Math.round((totalAlc / (totalMl || 1)) * 100);
  return { ml: Math.round(totalMl), abvPct };
});

const canSave = computed(() => !!builder.value?.name.trim());

// ── Actions ───────────────────────────────────────────────────────────────────

function pickCocktail(key: string): void {
  store.addCocktail(cat.value, spirit.value, key);
  store.closeCocktail();
}

function openBuilder(): void {
  builder.value = { name: '', mainQty: 50, spirits: {}, mixers: {} };
}

function backToPick(): void {
  builder.value = null;
}

function toggleOtherSpirit(key: string): void {
  if (!builder.value) return;
  const m = { ...builder.value.spirits };
  if (m[key] !== undefined) {
    delete m[key];
  } else {
    m[key] = 30;
  }
  builder.value = { ...builder.value, spirits: m };
}

function adjustSpirit(key: string, delta: number): void {
  if (!builder.value) return;
  const m = { ...builder.value.spirits };
  m[key] = Math.max(0, (m[key] ?? 0) + delta);
  builder.value = { ...builder.value, spirits: m };
}

function toggleMixer(key: string, isKg: boolean): void {
  if (!builder.value) return;
  const m = { ...builder.value.mixers };
  if (m[key] !== undefined) {
    delete m[key];
  } else {
    m[key] = isKg ? 0.1 : 100;
  }
  builder.value = { ...builder.value, mixers: m };
}

function adjustMixer(key: string, step: number, delta: 1 | -1): void {
  if (!builder.value) return;
  const m = { ...builder.value.mixers };
  m[key] = Math.max(0, Math.round(((m[key] ?? 0) + step * delta) * 100) / 100);
  builder.value = { ...builder.value, mixers: m };
}

async function saveCocktail(): Promise<void> {
  const b = builder.value;
  if (!b || !b.name.trim()) return;
  const recipe: Record<string, { quantity: number }> = {
    [spirit.value]: { quantity: b.mainQty },
  };
  for (const [k, q] of Object.entries(b.spirits)) {
    recipe[k] = { quantity: q };
  }
  for (const [k, q] of Object.entries(b.mixers)) {
    recipe[k] = { quantity: q };
  }
  await savePersonalCocktail(b.name.trim(), {
    main_spirit: spirit.value,
    category: cat.value,
    recipe,
  });
  await store.reloadCatalog();
  store.addCocktail(cat.value, spirit.value, b.name.trim());
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
          <Icon name="glass" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          {{ builder ? 'Custom cocktail' : 'Add a ' + spiritShort + ' drink' }}
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
      <div v-if="!builder">
        <!-- Preset cocktails -->
        <template v-if="presetCocktails.length > 0">
          <div
            style="
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              margin-bottom: 9px;
            "
          >
            Classics with {{ spiritShort }}
          </div>
          <div
            style="
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin-bottom: 16px;
            "
          >
            <button
              v-for="pc in presetCocktails"
              :key="pc.key"
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
              @click="pickCocktail(pc.key)"
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
                <Icon name="glass" :size="16" />
              </span>
              <div style="flex: 1; min-width: 0">
                <div style="font-size: 14px; font-weight: 600">
                  {{ pc.name }}
                </div>
                <div style="font-size: 11px; color: var(--faint)">
                  {{ pc.recipe }}
                </div>
              </div>
              <span style="display: flex; color: var(--accent); flex-shrink: 0">
                <Icon name="plus" :size="16" />
              </span>
            </button>
          </div>
        </template>

        <!-- Build custom -->
        <button
          style="
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
          "
          @click="openBuilder"
        >
          <span style="display: flex"><Icon name="sparkle" :size="16" /></span>
          Build a custom cocktail
        </button>
      </div>

      <!-- BUILD MODE -->
      <div v-else style="display: flex; flex-direction: column; gap: 14px">
        <!-- Cocktail name -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label style="font-size: 12px; color: var(--dim); font-weight: 600"
            >Cocktail name</label
          >
          <input
            v-model="builder.name"
            placeholder="e.g. Spicy Paloma"
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

        <!-- Base spirit slider -->
        <div
          style="
            background: var(--surface2);
            border-radius: var(--rs);
            padding: 13px;
          "
        >
          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 10px;
            "
          >
            <span style="display: flex; color: var(--accent)">
              <Icon name="bottle" :size="16" />
            </span>
            <span
              style="
                font-size: 10px;
                color: var(--faint);
                text-transform: uppercase;
                letter-spacing: 0.06em;
                font-weight: 700;
              "
              >Base</span
            >
            <span style="font-size: 13px; font-weight: 600">{{
              spiritShort
            }}</span>
            <span style="margin-left: auto; font-size: 13px; font-weight: 600"
              >{{ builder.mainQty }} ml</span
            >
          </div>
          <Slider
            :model-value="builder.mainQty"
            :min="20"
            :max="80"
            :step="5"
            @update:model-value="
              (v) => {
                if (builder) builder.mainQty = v;
              }
            "
          />
        </div>

        <!-- More spirits -->
        <div>
          <div
            style="
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              margin-bottom: 9px;
            "
          >
            More spirits
            <span style="color: var(--faint); font-weight: 500"
              >· for Long Island, Spritz &amp; co.</span
            >
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div
              v-for="s in otherSpirits"
              :key="s.key"
              style="
                display: flex;
                align-items: center;
                gap: 11px;
                padding: 10px 12px;
                border-radius: var(--rs);
                transition:
                  background 0.15s,
                  border-color 0.15s;
              "
              :style="{
                border: s.on
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
                background: s.on ? 'var(--accent-soft)' : 'var(--surface2)',
              }"
            >
              <button
                style="
                  cursor: pointer;
                  display: flex;
                  flex-shrink: 0;
                  width: 22px;
                  height: 22px;
                  border-radius: 7px;
                  align-items: center;
                  justify-content: center;
                "
                :style="{
                  border: s.on
                    ? '2px solid var(--accent)'
                    : '2px solid var(--border)',
                  background: s.on ? 'var(--accent)' : 'transparent',
                  color: 'var(--on-accent)',
                }"
                @click="toggleOtherSpirit(s.key)"
              >
                <Icon v-if="s.on" name="check" :size="13" />
              </button>
              <span style="display: flex; color: var(--dim)">
                <Icon name="glass" :size="15" />
              </span>
              <span style="flex: 1; font-size: 13.5px; font-weight: 500">{{
                s.name
              }}</span>
              <div
                v-if="s.on"
                style="display: flex; align-items: center; gap: 6px"
              >
                <button
                  style="
                    cursor: pointer;
                    width: 26px;
                    height: 26px;
                    border-radius: 7px;
                    border: 1px solid var(--border);
                    background: var(--surface);
                    color: var(--text);
                    font-size: 15px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  "
                  @click="adjustSpirit(s.key, -10)"
                >
                  −
                </button>
                <span
                  style="
                    font-size: 12px;
                    font-weight: 600;
                    width: 48px;
                    text-align: center;
                  "
                  >{{ s.qty }} ml</span
                >
                <button
                  style="
                    cursor: pointer;
                    width: 26px;
                    height: 26px;
                    border-radius: 7px;
                    border: 1px solid var(--border);
                    background: var(--surface);
                    color: var(--text);
                    font-size: 15px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  "
                  @click="adjustSpirit(s.key, 10)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Mixers & extras -->
        <div>
          <div
            style="
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              margin-bottom: 9px;
            "
          >
            Mixers &amp; extras
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div
              v-for="m in mixerExtras"
              :key="m.key"
              style="
                display: flex;
                align-items: center;
                gap: 11px;
                padding: 10px 12px;
                border-radius: var(--rs);
                transition:
                  background 0.15s,
                  border-color 0.15s;
              "
              :style="{
                border: m.on
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
                background: m.on ? 'var(--accent-soft)' : 'var(--surface2)',
              }"
            >
              <button
                style="
                  cursor: pointer;
                  display: flex;
                  flex-shrink: 0;
                  width: 22px;
                  height: 22px;
                  border-radius: 7px;
                  align-items: center;
                  justify-content: center;
                "
                :style="{
                  border: m.on
                    ? '2px solid var(--accent)'
                    : '2px solid var(--border)',
                  background: m.on ? 'var(--accent)' : 'transparent',
                  color: 'var(--on-accent)',
                }"
                @click="toggleMixer(m.key, m.isKg)"
              >
                <Icon v-if="m.on" name="check" :size="13" />
              </button>
              <span style="display: flex; color: var(--dim)">
                <Icon name="droplet" :size="15" />
              </span>
              <span style="flex: 1; font-size: 13.5px; font-weight: 500">{{
                m.name
              }}</span>
              <div
                v-if="m.on"
                style="display: flex; align-items: center; gap: 6px"
              >
                <button
                  style="
                    cursor: pointer;
                    width: 26px;
                    height: 26px;
                    border-radius: 7px;
                    border: 1px solid var(--border);
                    background: var(--surface);
                    color: var(--text);
                    font-size: 15px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  "
                  @click="adjustMixer(m.key, m.step, -1)"
                >
                  −
                </button>
                <span
                  style="
                    font-size: 12px;
                    font-weight: 600;
                    width: 48px;
                    text-align: center;
                  "
                  >{{ m.qtyLabel }}</span
                >
                <button
                  style="
                    cursor: pointer;
                    width: 26px;
                    height: 26px;
                    border-radius: 7px;
                    border: 1px solid var(--border);
                    background: var(--surface);
                    color: var(--text);
                    font-size: 15px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  "
                  @click="adjustMixer(m.key, m.step, 1)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Per-serving summary -->
        <div
          style="
            display: flex;
            align-items: baseline;
            gap: 8px;
            padding: 11px 13px;
            border-radius: var(--rs);
            background: var(--surface2);
          "
        >
          <span style="font-size: 12px; color: var(--dim)">Per serving</span>
          <span style="font-size: 14px; font-weight: 600"
            >{{ serving.ml }} ml</span
          >
          <span style="margin-left: auto; font-size: 11px; color: var(--faint)"
            >≈ {{ serving.abvPct }}% ABV</span
          >
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
            @click="backToPick"
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
            @click="saveCocktail"
          >
            Add to menu
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
