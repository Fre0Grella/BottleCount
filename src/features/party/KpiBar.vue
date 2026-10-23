<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../../store/store';
import { partyKpis } from './plan';
import Icon from '../../components/ui/Icon.vue';

const store = useStore();

const kpis = computed(() => {
  const p = store.activeParty();
  return p ? partyKpis(p, store.calc()) : [];
});
</script>

<template>
  <!-- Desktop: 4-column grid -->
  <div v-if="store.state.device === 'desktop'" class="kpis kpis--grid">
    <div v-for="k in kpis" :key="k.label" class="kpi">
      <div class="kpi__head">
        <Icon :name="k.icon" :size="15" />
        <span class="kpi__label">{{ k.label }}</span>
      </div>
      <div class="kpi__value" :class="`is-${k.tone}`">
        {{ k.value }}
      </div>
      <div class="kpi__sub">
        {{ k.sub }}
      </div>
    </div>
  </div>

  <!-- Phone: horizontal scroll chips -->
  <div v-else class="kpis kpis--chips">
    <div v-for="k in kpis" :key="k.label" class="kpi">
      <div class="kpi__head">
        <Icon :name="k.icon" :size="13" />
        <span class="kpi__label">{{ k.label }}</span>
      </div>
      <div class="kpi__value" :class="`is-${k.tone}`">
        {{ k.value }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.kpi {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--rs);
}

.kpi__head {
  display: flex;
  align-items: center;
  color: var(--faint);
}

.kpi__label {
  text-transform: uppercase;
}

.kpi__value {
  font-weight: 600;
  color: var(--text);
}

.kpi__value.is-good {
  color: var(--good);
}

.kpi__value.is-bad {
  color: var(--bad);
}

/* Desktop: four tiles across the page. */
.kpis--grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  padding: 14px 32px 16px 32px;
}

.kpis--grid .kpi {
  padding: 13px 15px;
}

.kpis--grid .kpi__head {
  gap: 7px;
}

.kpis--grid .kpi__label {
  font-size: 11px;
  letter-spacing: 0.07em;
}

.kpis--grid .kpi__value {
  margin-top: 6px;
  font-size: 19px;
}

.kpi__sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--dim);
}

/* Phone: a strip of chips that scrolls sideways and sticks to the top. */
.kpis--chips {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 10px 14px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.kpis--chips .kpi {
  flex-shrink: 0;
  padding: 7px 12px;
}

.kpis--chips .kpi__head {
  gap: 5px;
}

.kpis--chips .kpi__label {
  font-size: 9px;
  letter-spacing: 0.06em;
}

.kpis--chips .kpi__value {
  font-size: 14px;
}
</style>
