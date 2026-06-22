<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStore } from '../../lib/store';
import Icon from '../Icon.vue';

const store = useStore();

// ── Types ──────────────────────────────────────────────────────────────────

type GroupType = 'spirit' | 'beer' | 'wine' | 'mixer' | 'extra' | 'snack';

const TYPE_ORDER: GroupType[] = [
  'spirit',
  'beer',
  'wine',
  'mixer',
  'extra',
  'snack',
];

const TYPE_META: Record<GroupType, { label: string; icon: string }> = {
  spirit: { label: 'Spirits', icon: 'glass' },
  beer: { label: 'Beer', icon: 'beer' },
  wine: { label: 'Wine', icon: 'wine' },
  mixer: { label: 'Mixers & soft', icon: 'droplet' },
  extra: { label: 'Extras', icon: 'sparkle' },
  snack: { label: 'Snacks', icon: 'cart' },
};

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

const progressPct = computed(() => {
  const total = list.value.length;
  if (total === 0) return 0;
  return Math.round((checkedCount.value / total) * 100);
});

const groups = computed(() => {
  const p = party.value;
  if (!p) return [];
  return TYPE_ORDER.flatMap((type) => {
    const items = list.value.filter((item) => item.type === type);
    if (items.length === 0) return [];
    const subtotalMin = items.reduce((s, i) => s + i.cost_min, 0);
    const subtotalMax = items.reduce((s, i) => s + i.cost_max, 0);
    return [{ type, ...TYPE_META[type], subtotalMin, subtotalMax, items }];
  });
});

const bufferPct = computed(() => {
  const p = party.value;
  if (!p) return 0;
  return Math.round((p.settings.buffer - 1) * 100);
});

const perGuest = computed(() => {
  const p = party.value;
  if (!p || p.settings.guests === 0) return 0;
  const avg = (result.value.total_min + result.value.total_max) / 2;
  return Math.round(avg / p.settings.guests);
});

// ── Actions ────────────────────────────────────────────────────────────────

function isChecked(name: string): boolean {
  return !!party.value?.checked[name];
}

async function copyList(): Promise<void> {
  const lines = list.value
    .map(
      (i) =>
        `${i.quantity} ${i.unit}  ${i.name}  (€${i.cost_min}–€${i.cost_max})`,
    )
    .join('\n');
  await navigator.clipboard.writeText(lines);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div
    style="
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 32px;
    "
  >
    <!-- Progress card -->
    <div
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      "
    >
      <div style="flex: 1; min-width: 180px">
        <div
          style="
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          "
        >
          <span
            style="
              display: flex;
              align-items: center;
              gap: 7px;
              font-size: 13px;
              font-weight: 600;
              color: var(--dim);
            "
          >
            <span style="display: flex; color: var(--accent)">
              <Icon name="cart" :size="15" />
            </span>
            Cart progress
          </span>
          <span style="font-size: 12px; font-weight: 600; color: var(--dim)">
            {{ checkedCount }} / {{ list.length }}
          </span>
        </div>
        <div
          style="
            height: 9px;
            border-radius: 999px;
            background: var(--track);
            overflow: hidden;
          "
        >
          <div
            :style="{
              height: '100%',
              width: progressPct + '%',
              background: 'var(--good)',
              borderRadius: '999px',
              transition: 'width 0.2s ease',
            }"
          />
        </div>
      </div>
      <button
        style="
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
          color: #fff;
          min-height: 44px;
        "
        @click="copyList"
      >
        <span style="display: flex">
          <Icon name="copy" :size="15" />
        </span>
        {{ copied ? 'Copied' : 'Copy list' }}
      </button>
    </div>

    <!-- Group cards -->
    <template v-for="g in groups" :key="g.type">
      <div
        style="
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 16px;
        "
      >
        <!-- Group header -->
        <div
          style="
            display: flex;
            align-items: center;
            gap: 9px;
            margin-bottom: 6px;
          "
        >
          <span style="display: flex; color: var(--accent)">
            <Icon :name="g.icon" :size="16" />
          </span>
          <span style="font-size: 13px; font-weight: 600">{{ g.label }}</span>
          <span style="margin-left: auto; font-size: 12px; color: var(--dim)">
            €{{ g.subtotalMin }}–€{{ g.subtotalMax }}
          </span>
        </div>

        <!-- Item rows -->
        <div style="display: flex; flex-direction: column">
          <div
            v-for="item in g.items"
            :key="item.name"
            style="
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 11px 2px;
              border-top: 1px solid var(--border);
              cursor: pointer;
              min-height: 44px;
            "
            @click="store.toggleChecked(item.name)"
          >
            <!-- Checkbox -->
            <span
              :style="{
                display: 'flex',
                flexShrink: '0',
                width: '22px',
                height: '22px',
                borderRadius: '7px',
                border: `2px solid ${isChecked(item.name) ? 'var(--accent)' : 'var(--border)'}`,
                background: isChecked(item.name)
                  ? 'var(--accent)'
                  : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }"
            >
              <Icon v-if="isChecked(item.name)" name="check" :size="13" />
            </span>

            <!-- Name -->
            <span
              :style="{
                fontSize: '14px',
                fontWeight: '500',
                color: isChecked(item.name) ? 'var(--faint)' : 'var(--text)',
                textDecoration: isChecked(item.name) ? 'line-through' : 'none',
                flex: '1',
                minWidth: '0',
              }"
            >
              {{ item.name }}
            </span>

            <!-- Qty -->
            <span
              style="
                margin-left: auto;
                font-size: 13px;
                font-weight: 600;
                flex-shrink: 0;
              "
            >
              {{ item.quantity }} {{ item.unit }}
            </span>

            <!-- Cost -->
            <span
              style="
                font-size: 12px;
                color: var(--dim);
                width: 96px;
                text-align: right;
                flex-shrink: 0;
              "
            >
              €{{ item.cost_min }}–€{{ item.cost_max }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Totals card -->
    <div
      style="
        background: var(--surface);
        border: 1.5px solid var(--accent);
        border-radius: var(--r);
        padding: 16px;
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
      "
    >
      <span style="font-size: 13px; font-weight: 700; color: var(--dim)">
        Estimated spend
      </span>
      <span style="font-weight: 600; font-size: 22px">
        €{{ result.total_min }}–€{{ result.total_max }}
      </span>
      <span style="margin-left: auto; font-size: 12px; color: var(--faint)">
        €{{ perGuest }} per guest · incl. {{ bufferPct }}% buffer
      </span>
    </div>
  </div>
</template>
