<script setup lang="ts">
import { ref, computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    color?: string;
    trackColor?: string;
  }>(),
  {
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
</script>

<template>
  <div
    ref="trackRef"
    role="slider"
    :aria-valuenow="modelValue"
    :aria-valuemin="min"
    :aria-valuemax="max"
    style="
      position: relative;
      height: 30px;
      border-radius: 999px;
      cursor: ew-resize;
      touch-action: none;
      display: flex;
      align-items: center;
    "
    :style="{ background: trackColor }"
    @pointerdown="onPointerDown"
  >
    <!-- filled track -->
    <div
      style="
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 999px;
        pointer-events: none;
      "
      :style="{ width: fillPct, background: color }"
    />
    <!-- knob -->
    <div
      style="
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        transform: translateX(-50%);
        pointer-events: none;
      "
      :style="{ left: fillPct, background: color }"
    />
  </div>
</template>
