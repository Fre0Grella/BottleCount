<script setup lang="ts">
import { computed } from 'vue';

/**
 * − value + for a number with bounds. The buttons are named "Decrease <label>"
 * and "Increase <label>", and each stops at its bound.
 *
 * The default slot replaces the value in the middle (the Plan tab puts a
 * typed-in number and a caption there); it gets `value`.
 *
 * size: sm is the compact row control (26px buttons, the cocktail builder);
 * lg is the headline one (42px buttons, the guest count).
 */
const props = withDefaults(
  defineProps<{
    modelValue: number;
    /** What is being counted, for the buttons' names: "guests", "gin". */
    label: string;
    min?: number;
    max?: number;
    step?: number;
    /** Shown after the value, as in "40 ml". */
    unit?: string;
    size?: 'sm' | 'lg';
  }>(),
  {
    min: Number.NEGATIVE_INFINITY,
    max: Number.POSITIVE_INFINITY,
    step: 1,
    unit: undefined,
    size: 'sm',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const atMin = computed(() => props.modelValue <= props.min);
const atMax = computed(() => props.modelValue >= props.max);

function nudge(by: number): void {
  const next = Math.min(props.max, Math.max(props.min, props.modelValue + by));
  if (next !== props.modelValue) emit('update:modelValue', next);
}
</script>

<template>
  <div class="bc-stepper" :class="`bc-stepper--${size}`">
    <button
      type="button"
      class="bc-stepper__btn"
      :aria-label="`Decrease ${label}`"
      :disabled="atMin"
      @click="nudge(-step)"
    >
      −
    </button>
    <div class="bc-stepper__value">
      <slot :value="modelValue">
        <span aria-live="polite">{{
          unit ? `${modelValue} ${unit}` : modelValue
        }}</span>
      </slot>
    </div>
    <button
      type="button"
      class="bc-stepper__btn"
      :aria-label="`Increase ${label}`"
      :disabled="atMax"
      @click="nudge(step)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.bc-stepper {
  display: flex;
  align-items: center;
}

.bc-stepper__btn {
  cursor: pointer;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  color: var(--text);
}

.bc-stepper__btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.bc-stepper--sm {
  gap: 6px;
}
.bc-stepper--sm .bc-stepper__btn {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--surface);
  font-size: 15px;
}
.bc-stepper--sm .bc-stepper__value {
  width: 48px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
}

.bc-stepper--lg {
  gap: 14px;
}
.bc-stepper--lg .bc-stepper__btn {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--surface2);
  font-size: 20px;
}
.bc-stepper--lg .bc-stepper__value {
  flex: 1;
  text-align: center;
}
</style>
