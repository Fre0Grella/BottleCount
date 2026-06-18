<script setup lang="ts">
import { computed } from 'vue';
import { useStore, SIMPLE } from '../../lib/store';
import Icon from '../Icon.vue';
import Slider from '../Slider.vue';

const store = useStore();

// ── Helpers ──────────────────────────────────────────────────────────────────

function catIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('beer')) return 'beer';
  if (n.includes('wine')) return 'wine';
  return 'glass';
}

function segColor(i: number): string {
  return `var(--seg-${i % 5})`;
}

// ── Derived data ─────────────────────────────────────────────────────────────

const party = computed(() => store.activeParty());

const menu = computed(() => party.value?.menu ?? {});

const menuEntries = computed(() =>
  Object.entries(menu.value).map(([cat, catData], i) => ({
    cat,
    catData,
    index: i,
    color: segColor(i),
  })),
);

// shopping_list for qty lookup (best-effort)
const shoppingMap = computed<Record<string, number>>(() => {
  const list = store.calc().shopping_list;
  const map: Record<string, number> = {};
  for (const item of list) {
    map[item.name] = (map[item.name] ?? 0) + item.quantity;
  }
  return map;
});

// ── Expanded state helpers ────────────────────────────────────────────────────

function toggleCat(cat: string): void {
  store.state.expandedCat = store.state.expandedCat === cat ? null : cat;
  // collapse spirit when collapsing cat
  if (store.state.expandedCat !== cat) {
    store.state.expandedSpirit = null;
  }
}

function toggleSpirit(cat: string, spirit: string): void {
  const key = `${cat}:${spirit}`;
  store.state.expandedSpirit = store.state.expandedSpirit === key ? null : key;
}
</script>

<template>
  <div
    v-if="party"
    style="
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 32px;
      animation: bcFadeUp 0.3s ease both;
    "
  >
    <!-- ── Macro mix card ─────────────────────────────────────────────────── -->
    <div
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: var(--card-pad, 16px);
      "
    >
      <!-- Header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
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
          "
        >
          <Icon name="glass" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 16px;
          "
        >
          The pour mix
        </div>
        <span style="margin-left: auto; font-size: 11px; color: var(--faint)"
          >drag bars · pin to lock · rest auto-balances</span
        >
      </div>

      <!-- Stacked bar -->
      <div
        style="
          display: flex;
          height: 16px;
          border-radius: 999px;
          overflow: hidden;
          background: var(--track);
          margin-bottom: 12px;
        "
      >
        <div
          v-for="({ cat, catData, color }, i) in menuEntries"
          :key="cat"
          :style="{
            width: `${catData.macro_pct * 100}%`,
            background: color,
            transition: 'width 0.15s ease',
            borderRadius:
              i === 0
                ? '999px 0 0 999px'
                : i === menuEntries.length - 1
                  ? '0 999px 999px 0'
                  : '0',
          }"
        />
      </div>

      <!-- Legend -->
      <div style="display: flex; gap: 16px; flex-wrap: wrap">
        <div
          v-for="{ cat, catData, color } in menuEntries"
          :key="cat"
          style="display: flex; align-items: center; gap: 7px"
        >
          <span :style="{ display: 'flex', color }">
            <Icon :name="catIcon(cat)" :size="14" />
          </span>
          <span style="font-size: 12px; color: var(--dim); font-weight: 600">{{
            cat
          }}</span>
          <span style="font-size: 12px; color: var(--text); font-weight: 600"
            >{{ Math.round(catData.macro_pct * 100) }}%</span
          >
        </div>
      </div>
    </div>

    <!-- ── Per-category cards ─────────────────────────────────────────────── -->
    <div
      v-for="{ cat, catData, color } in menuEntries"
      :key="cat"
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: var(--card-pad, 16px);
      "
    >
      <!-- Card header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        "
      >
        <span
          :style="{
            display: 'flex',
            width: '32px',
            height: '32px',
            borderRadius: '9px',
            alignItems: 'center',
            justifyContent: 'center',
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
          }"
        >
          <Icon :name="catIcon(cat)" />
        </span>
        <div>
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 600;
              font-size: 16px;
            "
          >
            {{ cat }}
          </div>
          <div style="font-size: 11px; color: var(--faint)">
            {{ Object.keys(catData.spirits).length }} option{{
              Object.keys(catData.spirits).length === 1 ? '' : 's'
            }}
          </div>
        </div>
        <span style="margin-left: auto; font-weight: 600; font-size: 20px"
          >{{ Math.round(catData.macro_pct * 100) }}%</span
        >

        <!-- Pin button -->
        <button
          :title="party.locks['m:' + cat] ? 'Unlock share' : 'Lock share'"
          style="
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 9px;
            border: 1.5px solid;
            transition:
              background 0.15s,
              color 0.15s;
          "
          :style="{
            borderColor: party.locks['m:' + cat] ? color : 'var(--border)',
            background: party.locks['m:' + cat]
              ? `color-mix(in srgb, ${color} 18%, transparent)`
              : 'transparent',
            color: party.locks['m:' + cat] ? color : 'var(--dim)',
          }"
          @click="store.toggleLock('m:' + cat)"
        >
          <Icon name="pin" :size="15" />
        </button>

        <!-- Chevron -->
        <button
          style="
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 9px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--dim);
            transition: color 0.15s;
          "
          @click="toggleCat(cat)"
        >
          <Icon
            :name="store.state.expandedCat === cat ? 'chevU' : 'chevD'"
            :size="16"
          />
        </button>
      </div>

      <!-- Category slider -->
      <Slider
        :model-value="catData.macro_pct"
        :color="color"
        @update:model-value="(v) => store.rebalanceCategory(cat, v)"
      />

      <!-- Expanded: spirits list -->
      <div
        v-if="store.state.expandedCat === cat"
        style="
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          animation: bcFadeUp 0.25s ease both;
        "
      >
        <!-- Spirit rows -->
        <div
          v-for="(spiritData, spirit) in catData.spirits"
          :key="spirit"
          style="padding: 12px 0; border-top: 1px solid var(--border)"
        >
          <!-- Spirit row header -->
          <div
            style="
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 8px;
            "
          >
            <span style="font-size: 14px; font-weight: 600">{{ spirit }}</span>
            <!-- optional bottle qty -->
            <span
              v-if="shoppingMap[spirit] != null"
              style="font-size: 11px; color: var(--faint)"
              >≈ {{ shoppingMap[spirit] }} btl</span
            >
            <span style="margin-left: auto; font-weight: 600; font-size: 14px"
              >{{ Math.round(spiritData.pct * 100) }}%</span
            >

            <!-- Spirit pin -->
            <button
              :title="
                party.locks['s:' + cat + ':' + spirit] ? 'Unlock' : 'Lock share'
              "
              style="
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 8px;
                border: 1.5px solid;
                transition:
                  background 0.15s,
                  color 0.15s;
              "
              :style="{
                borderColor: party.locks['s:' + cat + ':' + spirit]
                  ? color
                  : 'var(--border)',
                background: party.locks['s:' + cat + ':' + spirit]
                  ? `color-mix(in srgb, ${color} 18%, transparent)`
                  : 'transparent',
                color: party.locks['s:' + cat + ':' + spirit]
                  ? color
                  : 'var(--dim)',
              }"
              @click="store.toggleLock('s:' + cat + ':' + spirit)"
            >
              <Icon name="pinS" :size="13" />
            </button>

            <!-- Chevron for drinks (only if NOT simple category) -->
            <button
              v-if="!SIMPLE.includes(cat)"
              style="
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 8px;
                border: 1px solid var(--border);
                background: transparent;
                color: var(--dim);
                transition: color 0.15s;
              "
              @click="toggleSpirit(cat, spirit as string)"
            >
              <Icon
                :name="
                  store.state.expandedSpirit === `${cat}:${spirit}`
                    ? 'chevU'
                    : 'chevD'
                "
                :size="14"
              />
            </button>

            <!-- Remove spirit -->
            <button
              title="Remove"
              style="
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                border-radius: 8px;
                border: none;
                background: transparent;
                color: var(--faint);
                transition: color 0.15s;
              "
              @click="store.removeBottle(cat, spirit as string)"
            >
              <Icon name="x" :size="14" />
            </button>
          </div>

          <!-- Spirit slider -->
          <Slider
            :model-value="spiritData.pct"
            :color="color"
            style="height: 22px"
            @update:model-value="
              (v) => store.rebalanceSpirit(cat, spirit as string, v)
            "
          />

          <!-- Expanded: drinks / cocktails -->
          <div
            v-if="
              !SIMPLE.includes(cat) &&
              store.state.expandedSpirit === `${cat}:${spirit}`
            "
            style="
              margin-top: 10px;
              padding: 12px;
              border-radius: var(--rs, 10px);
              background: var(--surface2);
              display: flex;
              flex-direction: column;
              gap: 9px;
              animation: bcFadeUp 0.25s ease both;
            "
          >
            <!-- "Served as" label -->
            <div style="display: flex; align-items: center; gap: 6px">
              <span style="display: flex; color: var(--faint)">
                <Icon name="glass" :size="14" />
              </span>
              <span
                style="
                  font-size: 10px;
                  color: var(--faint);
                  text-transform: uppercase;
                  letter-spacing: 0.07em;
                  font-weight: 700;
                "
                >Served as</span
              >
            </div>

            <!-- Drink rows -->
            <div
              v-for="(drinkPct, drink) in spiritData.drinks ?? {}"
              :key="drink"
              style="display: flex; align-items: center; gap: 10px"
            >
              <span
                style="
                  font-size: 13px;
                  width: 100px;
                  flex-shrink: 0;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                "
                >{{ drink }}</span
              >
              <Slider
                :model-value="drinkPct as number"
                :color="color"
                style="flex: 1; height: 16px"
                @update:model-value="
                  (v) =>
                    store.rebalanceDrink(
                      cat,
                      spirit as string,
                      drink as string,
                      v,
                    )
                "
              />
              <span
                style="
                  font-size: 12px;
                  font-weight: 600;
                  width: 40px;
                  text-align: right;
                "
                >{{ Math.round((drinkPct as number) * 100) }}%</span
              >
              <button
                title="Remove cocktail"
                style="
                  cursor: pointer;
                  display: flex;
                  width: 22px;
                  height: 22px;
                  align-items: center;
                  justify-content: center;
                  border: none;
                  background: transparent;
                  color: var(--faint);
                  transition: color 0.15s;
                "
                @click="
                  store.removeCocktail(cat, spirit as string, drink as string)
                "
              >
                <Icon name="x" :size="13" />
              </button>
            </div>

            <!-- Add cocktail button -->
            <button
              style="
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                margin-top: 2px;
                padding: 9px;
                border-radius: var(--rs, 10px);
                border: 1.5px dashed var(--border);
                background: transparent;
                color: var(--dim);
                font-size: 12px;
                font-weight: 600;
                min-height: 38px;
                transition:
                  border-color 0.15s,
                  color 0.15s;
              "
              @click="store.openCocktail(cat, spirit as string)"
              @mouseenter="
                ($event.currentTarget as HTMLButtonElement).style.borderColor =
                  'var(--accent)';
                ($event.currentTarget as HTMLButtonElement).style.color =
                  'var(--accent)';
              "
              @mouseleave="
                ($event.currentTarget as HTMLButtonElement).style.borderColor =
                  'var(--border)';
                ($event.currentTarget as HTMLButtonElement).style.color =
                  'var(--dim)';
              "
            >
              <Icon name="plus" :size="14" />
              Add / create a {{ spirit }} cocktail
            </button>
          </div>
        </div>

        <!-- Add bottle button -->
        <button
          style="
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            margin-top: 12px;
            padding: 11px;
            border-radius: var(--rs, 10px);
            border: 1.5px dashed var(--border);
            background: transparent;
            color: var(--dim);
            font-size: 13px;
            font-weight: 600;
            min-height: 42px;
            transition:
              border-color 0.15s,
              color 0.15s;
          "
          @click="store.openBottle(cat)"
          @mouseenter="
            ($event.currentTarget as HTMLButtonElement).style.borderColor =
              'var(--accent)';
            ($event.currentTarget as HTMLButtonElement).style.color =
              'var(--accent)';
          "
          @mouseleave="
            ($event.currentTarget as HTMLButtonElement).style.borderColor =
              'var(--border)';
            ($event.currentTarget as HTMLButtonElement).style.color =
              'var(--dim)';
          "
        >
          <Icon name="plus" :size="16" />
          Add {{ cat }} option
        </button>
      </div>
    </div>
  </div>
</template>
