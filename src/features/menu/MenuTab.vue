<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../../store/store';
import { isSimpleCategory } from './menu';
import { cocktailRecipe } from './catalog';
import Icon from '../../components/ui/Icon.vue';
import Toggle from '../../components/ui/Toggle.vue';
import Card from '../../components/ui/Card.vue';
import IconTile from '../../components/ui/IconTile.vue';
import { categoryIcon } from './ingredientTypes';
import { quantityByName } from './shopping';
import Slider from '../../components/ui/Slider.vue';
import { segColor } from '../../lib/display';

const store = useStore();

// ── Recipe info popovers ──────────────────────────────────────────────────────

const openRecipe = ref<string | null>(null);

function hasRecipe(drink: string): boolean {
  return (store.partyCatalog()?.cocktails[drink]?.recipe ?? null) !== null;
}

function recipeFor(drink: string): { name: string; amount: string }[] {
  const catalog = store.partyCatalog();
  return catalog ? cocktailRecipe(catalog, drink) : [];
}

function toggleRecipe(key: string): void {
  openRecipe.value = openRecipe.value === key ? null : key;
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
const shoppingMap = computed(() => quantityByName(store.calc().shopping_list));

// ── Snacks ────────────────────────────────────────────────────────────────────

const includeSnacks = computed(() => party.value?.includeSnacks ?? true);

const snackNames = computed(() => store.snackNames());

// ── Locks ─────────────────────────────────────────────────────────────────────

const catLock = (cat: string) => 'm:' + cat;
const spiritLock = (cat: string, spirit: string) => `s:${cat}:${spirit}`;

function isLocked(key: string): boolean {
  return !!party.value?.locks[key];
}

// ── Expanded state helpers ────────────────────────────────────────────────────

function toggleCat(cat: string): void {
  store.state.expandedCat = store.state.expandedCat === cat ? null : cat;
  // collapse spirit when collapsing cat
  if (store.state.expandedCat !== cat) {
    store.state.expandedSpirit = null;
  }
}

function isSpiritOpen(cat: string, spirit: string): boolean {
  return store.state.expandedSpirit === `${cat}:${spirit}`;
}

function toggleSpirit(cat: string, spirit: string): void {
  const key = `${cat}:${spirit}`;
  store.state.expandedSpirit = store.state.expandedSpirit === key ? null : key;
}
</script>

<template>
  <div v-if="party" class="menu">
    <!-- ── Macro mix card ─────────────────────────────────────────────────── -->
    <Card pad="sm">
      <!-- Header -->
      <div class="menu-mix__head">
        <IconTile
          icon="glass"
          :size="34"
          :icon-size="18"
          class="menu-mix__tile"
        />
        <div class="menu-title">The pour mix</div>
        <span class="menu-mix__hint"
          >drag bars · pin to lock · rest auto-balances</span
        >
      </div>

      <!-- Stacked bar -->
      <div class="menu-mix__bar">
        <div
          v-for="{ cat, catData, color } in menuEntries"
          :key="cat"
          class="menu-mix__seg"
          :style="{ width: `${catData.macro_pct * 100}%`, background: color }"
        />
      </div>

      <!-- Legend -->
      <div class="menu-mix__legend">
        <div
          v-for="{ cat, catData, color } in menuEntries"
          :key="cat"
          class="menu-mix__item"
          :style="{ '--seg': color }"
        >
          <Icon :name="categoryIcon(cat)" :size="14" class="menu-seg-text" />
          <span class="menu-mix__name">{{ cat }}</span>
          <span class="menu-mix__pct"
            >{{ Math.round(catData.macro_pct * 100) }}%</span
          >
        </div>
      </div>
    </Card>

    <!-- ── Snacks toggle card ─────────────────────────────────────────────── -->
    <Card pad="sm" :highlight="includeSnacks">
      <!-- toggle row -->
      <Toggle
        :model-value="includeSnacks"
        icon="cart"
        :tile-size="34"
        :icon-size="17"
        size="lg"
        @update:model-value="store.toggleSnacks()"
      >
        Add snacks
        <template #description>
          Include nibbles in the shopping list &amp; costs
        </template>
      </Toggle>

      <!-- snack chips -->
      <div v-if="includeSnacks && snackNames.length" class="menu-snacks">
        <span v-for="name in snackNames" :key="name" class="menu-snack">
          {{ name }}
          <span v-if="shoppingMap[name] != null" class="menu-faint"
            >· {{ shoppingMap[name] }}</span
          >
        </span>
      </div>
    </Card>

    <!-- ── Per-category cards ─────────────────────────────────────────────── -->
    <Card
      v-for="{ cat, catData, color } in menuEntries"
      :key="cat"
      pad="sm"
      :style="{ '--seg': color }"
    >
      <!-- Card header -->
      <div class="menu-cat__head">
        <IconTile
          :icon="categoryIcon(cat)"
          :size="32"
          :icon-size="18"
          class="menu-cat__tile"
        />
        <div>
          <div class="menu-title">{{ cat }}</div>
          <div class="menu-cat__count">
            {{ Object.keys(catData.spirits).length }} option{{
              Object.keys(catData.spirits).length === 1 ? '' : 's'
            }}
          </div>
        </div>
        <span class="menu-cat__pct"
          >{{ Math.round(catData.macro_pct * 100) }}%</span
        >

        <!-- Pin button -->
        <button
          type="button"
          :title="isLocked(catLock(cat)) ? 'Unlock share' : 'Lock share'"
          :aria-label="`Lock the ${cat} share`"
          :aria-pressed="isLocked(catLock(cat))"
          class="menu-icon-btn menu-icon-btn--lg menu-pin"
          :class="{ 'is-locked': isLocked(catLock(cat)) }"
          @click="store.toggleLock(catLock(cat))"
        >
          <Icon name="pin" :size="15" />
        </button>

        <!-- Chevron -->
        <button
          type="button"
          :aria-label="`${cat} options`"
          :aria-expanded="store.state.expandedCat === cat"
          class="menu-icon-btn menu-icon-btn--lg menu-chev"
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
        :label="`${cat} share`"
        :value-text="`${Math.round(catData.macro_pct * 100)}%`"
        :color="color"
        @update:model-value="(v) => store.rebalanceCategory(cat, v)"
      />

      <!-- Expanded: spirits list -->
      <div v-if="store.state.expandedCat === cat" class="menu-spirits">
        <!-- Spirit rows -->
        <div
          v-for="(spiritData, spirit) in catData.spirits"
          :key="spirit"
          class="menu-spirit"
        >
          <!-- Spirit row header -->
          <div class="menu-spirit__head">
            <span class="menu-spirit__name">{{ spirit }}</span>
            <!-- optional bottle qty -->
            <span v-if="shoppingMap[spirit] != null" class="menu-spirit__qty"
              >≈ {{ shoppingMap[spirit] }} btl</span
            >
            <span class="menu-spirit__pct"
              >{{ Math.round(spiritData.pct * 100) }}%</span
            >

            <!-- Spirit pin -->
            <button
              type="button"
              :title="
                isLocked(spiritLock(cat, spirit as string))
                  ? 'Unlock'
                  : 'Lock share'
              "
              :aria-label="`Lock the ${spirit} share`"
              :aria-pressed="isLocked(spiritLock(cat, spirit as string))"
              class="menu-icon-btn menu-pin"
              :class="{
                'is-locked': isLocked(spiritLock(cat, spirit as string)),
              }"
              @click="store.toggleLock(spiritLock(cat, spirit as string))"
            >
              <Icon name="pin" :size="13" />
            </button>

            <!-- Chevron for drinks (only if NOT simple category) -->
            <button
              v-if="!isSimpleCategory(cat)"
              type="button"
              :aria-label="`${spirit} drinks`"
              :aria-expanded="isSpiritOpen(cat, spirit as string)"
              class="menu-icon-btn menu-chev"
              @click="toggleSpirit(cat, spirit as string)"
            >
              <Icon
                :name="isSpiritOpen(cat, spirit as string) ? 'chevU' : 'chevD'"
                :size="14"
              />
            </button>

            <!-- Remove spirit -->
            <button
              type="button"
              title="Remove"
              :aria-label="`Remove ${spirit}`"
              class="menu-icon-btn menu-remove"
              @click="store.removeBottle(cat, spirit as string)"
            >
              <Icon name="x" :size="14" />
            </button>
          </div>

          <!-- Spirit slider -->
          <Slider
            :model-value="spiritData.pct"
            :label="`${spirit} share`"
            :value-text="`${Math.round(spiritData.pct * 100)}%`"
            :color="color"
            class="menu-slider"
            @update:model-value="
              (v) => store.rebalanceSpirit(cat, spirit as string, v)
            "
          />

          <!-- Expanded: drinks / cocktails -->
          <div
            v-if="!isSimpleCategory(cat) && isSpiritOpen(cat, spirit as string)"
            class="menu-drinks"
          >
            <!-- "Served as" label -->
            <div class="menu-drinks__label">
              <Icon name="glass" :size="14" />
              <span>Served as</span>
            </div>

            <!-- Drink rows -->
            <div
              v-for="(drinkPct, drink) in spiritData.drinks ?? {}"
              :key="drink"
              class="menu-drink"
            >
              <!-- name + percent + actions on one line -->
              <div class="menu-drink__row">
                <span class="menu-drink__name">{{ drink }}</span>
                <span class="menu-drink__pct"
                  >{{ Math.round((drinkPct as number) * 100) }}%</span
                >
                <!-- Recipe info -->
                <button
                  v-if="hasRecipe(drink as string)"
                  type="button"
                  title="Show recipe"
                  :aria-label="`${drink} recipe`"
                  :aria-expanded="openRecipe === `${cat}:${spirit}:${drink}`"
                  class="menu-icon-btn menu-icon-btn--sm menu-info"
                  :class="{
                    'is-open': openRecipe === `${cat}:${spirit}:${drink}`,
                  }"
                  @click="toggleRecipe(`${cat}:${spirit}:${drink}`)"
                >
                  <Icon name="info" :size="15" />
                </button>
                <button
                  type="button"
                  title="Remove cocktail"
                  :aria-label="`Remove ${drink}`"
                  class="menu-icon-btn menu-icon-btn--sm menu-remove"
                  @click="
                    store.removeCocktail(cat, spirit as string, drink as string)
                  "
                >
                  <Icon name="x" :size="14" />
                </button>
              </div>

              <!-- slider alone, full width under the name -->
              <Slider
                :model-value="drinkPct as number"
                :label="`${drink} share`"
                :value-text="`${Math.round((drinkPct as number) * 100)}%`"
                :color="color"
                class="menu-slider"
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

              <!-- Recipe detail -->
              <div
                v-if="openRecipe === `${cat}:${spirit}:${drink}`"
                class="menu-recipe"
              >
                <span
                  v-for="r in recipeFor(drink as string)"
                  :key="r.name"
                  class="menu-recipe__item"
                >
                  <span class="menu-recipe__name">{{ r.name }}</span>
                  <span class="menu-faint">{{ r.amount }}</span>
                </span>
              </div>
            </div>

            <!-- Add cocktail button -->
            <button
              type="button"
              class="menu-add menu-add--drink"
              @click="store.openCocktail(cat, spirit as string)"
            >
              <Icon name="plus" :size="14" />
              Add / create a {{ spirit }} cocktail
            </button>
          </div>
        </div>

        <!-- Add bottle button -->
        <button
          type="button"
          class="menu-add menu-add--bottle"
          @click="store.openBottle(cat)"
        >
          <Icon name="plus" :size="16" />
          Add {{ cat }} option
        </button>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 32px;
  animation: bcFadeUp 0.3s ease both;
}

.menu-title {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 16px;
}

.menu-faint {
  color: var(--faint);
}

/* The category's segment colour, set as --seg on its card or legend item. */
.menu-seg-text {
  color: var(--seg);
}

/* ── Pour mix ── */
.menu-mix__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
/* On a phone the hint wraps; the tile and the title keep their shape. */
.menu-mix__head .menu-title {
  white-space: nowrap;
}
.menu-mix__hint {
  min-width: 0;
  margin-left: auto;
  text-align: right;
  font-size: 11px;
  color: var(--faint);
}
.menu-mix__bar {
  display: flex;
  height: 16px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--track);
  margin-bottom: 12px;
}
.menu-mix__seg {
  transition: width 0.15s ease;
}
.menu-mix__seg:first-child {
  border-radius: 999px 0 0 999px;
}
.menu-mix__seg:last-child:not(:first-child) {
  border-radius: 0 999px 999px 0;
}
.menu-mix__legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.menu-mix__item {
  display: flex;
  align-items: center;
  gap: 7px;
}
.menu-mix__name,
.menu-mix__pct {
  font-size: 12px;
  font-weight: 600;
}
.menu-mix__name {
  color: var(--dim);
}
.menu-mix__pct {
  color: var(--text);
}

/* ── Snacks ── */
.menu-snacks {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
  animation: bcFadeUp 0.2s ease both;
}
.menu-snack {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dim);
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--surface2);
  border: 1px solid var(--border);
}

/* ── Category card ── */
.menu-cat__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.menu .menu-cat__tile {
  background: color-mix(in srgb, var(--seg) 15%, transparent);
  color: var(--seg);
}
.menu-cat__count {
  font-size: 11px;
  color: var(--faint);
}
.menu-cat__pct {
  margin-left: auto;
  font-weight: 600;
  font-size: 20px;
}

/* Square icon buttons: 32px in the card header, 28px on a spirit row, 26px on
   a drink row. */
.menu-icon-btn {
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: transparent;
  transition: color 0.15s;
}
.menu-icon-btn--lg {
  width: 32px;
  height: 32px;
  border-radius: 9px;
}
.menu-icon-btn--sm {
  width: 26px;
  height: 26px;
}

.menu-pin {
  border: 1.5px solid var(--border);
  color: var(--dim);
  transition:
    background 0.15s,
    color 0.15s;
}
.menu-pin.is-locked {
  border-color: var(--seg);
  background: color-mix(in srgb, var(--seg) 18%, transparent);
  color: var(--seg);
}
.menu-chev {
  border: 1px solid var(--border);
  color: var(--dim);
}
.menu-remove,
.menu-info {
  color: var(--faint);
}
.menu-info.is-open {
  color: var(--accent);
}

/* ── Spirits ── */
.menu-spirits {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  animation: bcFadeUp 0.25s ease both;
}
.menu-spirit {
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.menu-spirit__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.menu-spirit__name {
  font-size: 14px;
  font-weight: 600;
}
.menu-spirit__qty {
  font-size: 11px;
  color: var(--faint);
}
.menu-spirit__pct {
  margin-left: auto;
  font-weight: 600;
  font-size: 14px;
}

/* Slider sets its 30px height inline; spirit and drink rows are slimmer. */
.menu-slider {
  height: 22px !important;
}

/* ── Drinks ── */
.menu-drinks {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--rs, 10px);
  background: var(--surface2);
  display: flex;
  flex-direction: column;
  gap: 9px;
  animation: bcFadeUp 0.25s ease both;
}
.menu-drinks__label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--faint);
}
.menu-drinks__label span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-weight: 700;
}
.menu-drink {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.menu-drink__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.menu-drink__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-drink__pct {
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.menu-recipe {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  padding: 8px 10px;
  border-radius: var(--rs, 10px);
  background: var(--surface);
  border: 1px solid var(--border);
  animation: bcFadeUp 0.2s ease both;
}
.menu-recipe__item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
}
.menu-recipe__name {
  color: var(--dim);
  font-weight: 600;
}

/* ── Dashed add buttons ── */
.menu-add {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--rs, 10px);
  border: 1.5px dashed var(--border);
  background: transparent;
  color: var(--dim);
  font-weight: 600;
  transition:
    border-color 0.15s,
    color 0.15s;
}
.menu-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.menu-add--drink {
  gap: 6px;
  margin-top: 2px;
  padding: 9px;
  font-size: 12px;
  min-height: 38px;
}
.menu-add--bottle {
  gap: 7px;
  margin-top: 12px;
  padding: 11px;
  font-size: 13px;
  min-height: 42px;
}
</style>
