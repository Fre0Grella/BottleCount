<script setup lang="ts">
import { ref, computed } from 'vue';

/**
 * A value on a track: drag it, tap the track, or use the keys (arrows step,
 * Page Up/Down take ten steps, Home and End go to the ends). `label` names it
 * for a screen reader; `valueText` says the value the way the screen does
 * ("35%") when the bare number would not.
 */
const props = withDefaults(
  defineProps<{
    modelValue: number;
    label: string;
    valueText?: string;
    min?: number;
    max?: number;
    step?: number;
    color?: string;
    trackColor?: string;
  }>(),
  {
    valueText: undefined,
    min: 0,
    max: 1,
    step: 0,
    color: 'var(--accent)',
    trackColor: 'var(--track)',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void;
}>();

const trackRef = ref<HTMLElement | null>(null);

const fraction = computed(() => {
  const range = props.max - props.min;
  if (range === 0) return 0;
  return Math.min(1, Math.max(0, (props.modelValue - props.min) / range));
});

const fillPct = computed(() => `${fraction.value * 100}%`);

function valueFromPct(pct: number): number {
  const raw = props.min + pct * (props.max - props.min);
  if (props.step && props.step > 0) {
    return Math.round(raw / props.step) * props.step;
  }
  return raw;
}

function clamp(v: number): number {
  return Math.min(props.max, Math.max(props.min, v));
}

function onPointerDown(e: PointerEvent): void {
  const el = trackRef.value;
  if (!el) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  el.focus({ preventScroll: true });

  function move(ev: PointerEvent): void {
    const rect = el!.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    emit('update:modelValue', clamp(valueFromPct(pct)));
  }

  function up(): void {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  }

  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/** One key press: the step, or a hundredth of the range when there is none. */
const keyStep = computed(() =>
  props.step && props.step > 0 ? props.step : (props.max - props.min) / 100,
);

function onKeydown(e: KeyboardEvent): void {
  const s = keyStep.value;
  const next: Record<string, number> = {
    ArrowRight: props.modelValue + s,
    ArrowUp: props.modelValue + s,
    ArrowLeft: props.modelValue - s,
    ArrowDown: props.modelValue - s,
    PageUp: props.modelValue + s * 10,
    PageDown: props.modelValue - s * 10,
    Home: props.min,
    End: props.max,
  };
  if (!(e.key in next)) return;
  e.preventDefault();
  const v = clamp(next[e.key]);
  if (v !== props.modelValue) emit('update:modelValue', v);
}
</script>

<template>
  <div
    ref="trackRef"
    role="slider"
    tabindex="0"
    class="bc-slider"
    :aria-label="label"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuetext="valueText"
    :style="{ background: trackColor }"
    @pointerdown="onPointerDown"
    @keydown="onKeydown"
  >
    <div
      class="bc-slider__fill"
      :style="{ width: fillPct, background: color }"
    />
    <div
      class="bc-slider__knob"
      :style="{ left: fillPct, background: color }"
    />
  </div>
</template>

<style scoped>
.bc-slider {
  position: relative;
  height: 30px;
  border-radius: 999px;
  cursor: ew-resize;
  touch-action: none;
  display: flex;
  align-items: center;
}

.bc-slider__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  pointer-events: none;
}

.bc-slider__knob {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--knob);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transform: translateX(-50%);
  pointer-events: none;
}
</style>
