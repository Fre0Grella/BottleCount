<script setup lang="ts">
import { computed } from 'vue';

/**
 * One filled bar for "value out of max" (checked in, paid), as a
 * role=progressbar with its numbers. `label` names it; `valueText` is what a
 * screen reader says for the value ("3 of 40") when a bare number is unclear.
 */
const props = withDefaults(
  defineProps<{
    value: number;
    max: number;
    label: string;
    valueText?: string;
    tone?: 'good' | 'accent';
  }>(),
  { valueText: undefined, tone: 'good' },
);

const now = computed(() => Math.min(Math.max(props.value, 0), props.max));
const width = computed(() =>
  props.max > 0 ? `${(now.value / props.max) * 100}%` : '0%',
);
</script>

<template>
  <div
    class="bc-progress"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="now"
    :aria-valuetext="valueText"
  >
    <div
      class="bc-progress__fill"
      :class="`bc-progress__fill--${tone}`"
      :style="{ width }"
    />
  </div>
</template>

<style scoped>
.bc-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}

.bc-progress__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.25s ease;
}

.bc-progress__fill--good {
  background: var(--good);
}
.bc-progress__fill--accent {
  background: var(--accent);
}
</style>
