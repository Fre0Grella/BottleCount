<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../lib/store';
import Icon from './Icon.vue';

const store = useStore();

function fmt(v: number): string {
  return '€' + v.toFixed(0);
}

function fmtRange(a: number, b: number): string {
  if (Math.abs(a - b) < 1) return fmt(a);
  return fmt(a) + '–' + fmt(b);
}

const kpis = computed(() => {
  const p = store.activeParty();
  if (!p) return [];
  const r = store.calc();
  const beCovered = r.break_even !== null && p.settings.guests >= r.break_even;
  const avgProfit = (r.profit_min + r.profit_max) / 2;

  return [
    {
      label: 'Spend',
      icon: 'cart' as const,
      v: fmtRange(Math.round(r.total_min), Math.round(r.total_max)),
      sub:
        fmt((r.total_min + r.total_max) / 2 / (p.settings.guests || 1)) +
        ' / guest',
      c: 'var(--text)',
    },
    {
      label: 'Revenue',
      icon: 'euro' as const,
      v: fmt(r.revenue),
      sub: p.settings.guests + ' × €' + p.settings.ticket_price,
      c: 'var(--text)',
    },
    {
      label: 'Profit',
      icon: 'trend' as const,
      v: fmt(avgProfit),
      sub: fmtRange(Math.round(r.profit_min), Math.round(r.profit_max)),
      c: avgProfit >= 0 ? 'var(--good)' : 'var(--bad)',
    },
    {
      label: 'Break-even',
      icon: 'target' as const,
      v: r.break_even === null ? 'never' : r.break_even + ' ppl',
      sub:
        r.break_even === null
          ? 'ticket < cost'
          : beCovered
            ? 'covered'
            : r.break_even - p.settings.guests + ' more',
      c:
        r.break_even === null
          ? 'var(--bad)'
          : beCovered
            ? 'var(--good)'
            : 'var(--text)',
    },
  ];
});
</script>

<template>
  <!-- Desktop: 4-column grid -->
  <div
    v-if="store.state.device === 'desktop'"
    style="
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      max-width: 960px;
      width: 100%;
      margin: 0 auto;
      padding: 14px 32px 16px 32px;
    "
  >
    <div
      v-for="k in kpis"
      :key="k.label"
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--rs);
        padding: 13px 15px;
      "
    >
      <div
        style="
          display: flex;
          align-items: center;
          gap: 7px;
          color: var(--faint);
        "
      >
        <Icon :name="k.icon" :size="15" />
        <span
          style="
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.07em;
          "
          >{{ k.label }}</span
        >
      </div>
      <div
        style="margin-top: 6px; font-weight: 600; font-size: 19px"
        :style="{ color: k.c }"
      >
        {{ k.v }}
      </div>
      <div style="margin-top: 2px; font-size: 11px; color: var(--dim)">
        {{ k.sub }}
      </div>
    </div>
  </div>

  <!-- Phone: horizontal scroll chips -->
  <div
    v-else
    style="
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 10px 14px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    "
  >
    <div
      v-for="k in kpis"
      :key="k.label"
      style="
        flex-shrink: 0;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--rs);
        padding: 7px 12px;
      "
    >
      <div
        style="
          display: flex;
          align-items: center;
          gap: 5px;
          color: var(--faint);
        "
      >
        <Icon :name="k.icon" :size="13" />
        <span
          style="
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          "
          >{{ k.label }}</span
        >
      </div>
      <div style="font-weight: 600; font-size: 14px" :style="{ color: k.c }">
        {{ k.v }}
      </div>
    </div>
  </div>
</template>
