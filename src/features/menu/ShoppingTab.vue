<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStore } from '../../store/store';
import Icon from '../../components/ui/Icon.vue';
import Card from '../../components/ui/Card.vue';
import ProgressBar from '../../components/ui/ProgressBar.vue';
import { TYPE_META } from './ingredientTypes';
import {
  bufferPercent,
  costPerGuest,
  shoppingGroups,
  shoppingListText,
} from './shopping';

const store = useStore();

// ── Reactive data ──────────────────────────────────────────────────────────

const copied = ref(false);

// ── Computed ───────────────────────────────────────────────────────────────

const party = computed(() => store.activeParty());
const result = computed(() => store.calc());

const list = computed(() => result.value.shopping_list);

const checkedCount = computed(() => {
  const p = party.value;
  if (!p) return 0;
  return list.value.filter((item) => p.checked[item.name]).length;
});

const groups = computed(() => {
  if (!party.value) return [];
  return shoppingGroups(list.value).map((g) => ({
    ...g,
    ...TYPE_META[g.type],
  }));
});

const bufferPct = computed(() =>
  party.value ? bufferPercent(party.value.settings.buffer) : 0,
);

const perGuest = computed(() =>
  party.value
    ? costPerGuest(
        result.value.total_min,
        result.value.total_max,
        party.value.settings.guests,
      )
    : 0,
);

// ── Actions ────────────────────────────────────────────────────────────────

function isChecked(name: string): boolean {
  return !!party.value?.checked[name];
}

async function copyList(): Promise<void> {
  await navigator.clipboard.writeText(shoppingListText(list.value));
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div class="shop">
    <!-- Progress card -->
    <Card pad="sm" class="shop-progress">
      <div class="shop-progress__main">
        <div class="shop-progress__head">
          <span class="shop-progress__title">
            <Icon name="cart" :size="15" class="shop-accent" />
            Cart progress
          </span>
          <span class="shop-progress__count">
            {{ checkedCount }} / {{ list.length }}
          </span>
        </div>
        <ProgressBar
          class="shop-progress__bar"
          :value="checkedCount"
          :max="list.length"
          label="Cart progress"
          :value-text="`${checkedCount} of ${list.length}`"
          tone="good"
        />
      </div>
      <button type="button" class="shop-copy" @click="copyList">
        <Icon name="copy" :size="15" />
        {{ copied ? 'Copied' : 'Copy list' }}
      </button>
    </Card>

    <!-- Group cards -->
    <Card v-for="g in groups" :key="g.type" pad="sm">
      <!-- Group header -->
      <div class="shop-group__head">
        <Icon :name="g.icon" :size="16" class="shop-accent" />
        <span class="shop-group__label">{{ g.label }}</span>
        <span class="shop-group__subtotal">
          €{{ g.subtotalMin }}–€{{ g.subtotalMax }}
        </span>
      </div>

      <!-- Item rows: each one a checkbox -->
      <div class="shop-group__items">
        <button
          v-for="item in g.items"
          :key="item.name"
          type="button"
          role="checkbox"
          :aria-checked="isChecked(item.name)"
          class="shop-item"
          :class="{ 'is-checked': isChecked(item.name) }"
          @click="store.toggleChecked(item.name)"
        >
          <span class="shop-item__box" aria-hidden="true">
            <Icon v-if="isChecked(item.name)" name="check" :size="13" />
          </span>
          <span class="shop-item__name">{{ item.name }}</span>
          <span class="shop-item__qty">
            {{ item.quantity }} {{ item.unit }}
          </span>
          <span class="shop-item__cost">
            €{{ item.cost_min }}–€{{ item.cost_max }}
          </span>
        </button>
      </div>
    </Card>

    <!-- Totals card -->
    <Card pad="sm" highlight class="shop-total">
      <span class="shop-total__label">Estimated spend</span>
      <span class="shop-total__value">
        €{{ result.total_min }}–€{{ result.total_max }}
      </span>
      <span class="shop-total__note">
        €{{ perGuest }} per guest · incl. {{ bufferPct }}% buffer
      </span>
    </Card>
  </div>
</template>

<style scoped>
.shop {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 32px;
}

.shop-accent {
  flex-shrink: 0;
  color: var(--accent);
}

/* ── Progress ── */
.shop-progress {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.shop-progress__main {
  flex: 1;
  min-width: 180px;
}
.shop-progress__head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.shop-progress__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dim);
}
.shop-progress__count {
  font-size: 12px;
  font-weight: 600;
  color: var(--dim);
}
/* The cart bar is a pixel taller than the kit's. */
.shop .shop-progress__bar {
  height: 9px;
}

.shop-copy {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  padding: 11px 18px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: var(--on-accent);
  min-height: 44px;
}

/* ── Groups ── */
.shop-group__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 6px;
}
.shop-group__label {
  font-size: 13px;
  font-weight: 600;
}
.shop-group__subtotal {
  margin-left: auto;
  font-size: 12px;
  color: var(--dim);
}
.shop-group__items {
  display: flex;
  flex-direction: column;
}

.shop-item {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0;
  padding: 11px 2px;
  min-height: 44px;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
}
.shop-item__box {
  display: flex;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 2px solid var(--border);
  align-items: center;
  justify-content: center;
  color: var(--on-accent);
}
.shop-item.is-checked .shop-item__box {
  border-color: var(--accent);
  background: var(--accent);
}
.shop-item__name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.shop-item.is-checked .shop-item__name {
  color: var(--faint);
  text-decoration: line-through;
}
.shop-item__qty {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
}
.shop-item__cost {
  flex-shrink: 0;
  width: 96px;
  text-align: right;
  font-size: 12px;
  color: var(--dim);
}

/* ── Totals ── */
.shop .shop-total {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  border-width: 1.5px;
}
.shop-total__label {
  font-size: 13px;
  font-weight: 700;
  color: var(--dim);
}
.shop-total__value {
  font-weight: 600;
  font-size: 22px;
}
.shop-total__note {
  margin-left: auto;
  font-size: 12px;
  color: var(--faint);
}
</style>
