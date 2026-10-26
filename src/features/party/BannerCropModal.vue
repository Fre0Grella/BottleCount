<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BANNER_ASPECT } from '../../../shared/coverPhotos';
import {
  MAX_ZOOM,
  cropRect,
  initialView,
  panned,
  zoomed,
  type CropRect,
  type CropView,
} from './bannerCrop';
import ModalShell from '../../components/ui/ModalShell.vue';
import PillButton from '../../components/ui/PillButton.vue';
import Slider from '../../components/ui/Slider.vue';

/**
 * Framing a banner: the photo in a frame of the banner's shape, dragged to
 * choose the part that shows and zoomed with a slider. What the frame shows is
 * exactly what is uploaded. The geometry is in bannerCrop.ts.
 */
const props = defineProps<{ file: Blob | null }>();
const emit = defineEmits<{
  (e: 'confirm', crop: CropRect): void;
  (e: 'cancel'): void;
}>();

const src = ref<string | null>(null);
const photo = ref<{ width: number; height: number } | null>(null);
const view = ref<CropView>({ zoom: 1, cx: 0, cy: 0 });

watch(
  () => props.file,
  (file) => {
    if (src.value) URL.revokeObjectURL(src.value);
    src.value = file ? URL.createObjectURL(file) : null;
    photo.value = null;
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (src.value) URL.revokeObjectURL(src.value);
});

function onLoad(e: Event): void {
  const img = e.target as HTMLImageElement;
  photo.value = { width: img.naturalWidth, height: img.naturalHeight };
  view.value = initialView(photo.value);
}

// ── The frame on screen ───────────────────────────────────────────────────

const frame = ref<HTMLElement | null>(null);
const frameWidth = ref(0);
let observer: ResizeObserver | null = null;

watch(frame, (el) => {
  observer?.disconnect();
  if (!el) return;
  frameWidth.value = el.clientWidth;
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(() => (frameWidth.value = el.clientWidth));
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

const rect = computed(() =>
  photo.value ? cropRect(photo.value, view.value) : null,
);

/** The photo laid out so the framed region fills the frame exactly. */
const photoStyle = computed(() => {
  if (!photo.value || !rect.value || !frameWidth.value) return { opacity: 0 };
  const scale = frameWidth.value / rect.value.width;
  return {
    width: `${photo.value.width * scale}px`,
    height: `${photo.value.height * scale}px`,
    transform: `translate(${-rect.value.x * scale}px, ${-rect.value.y * scale}px)`,
  };
});

// ── Moving it ─────────────────────────────────────────────────────────────

let dragFrom: { x: number; y: number } | null = null;

function onPointerDown(e: PointerEvent): void {
  dragFrom = { x: e.clientX, y: e.clientY };
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (!dragFrom || !photo.value) return;
  view.value = panned(
    photo.value,
    view.value,
    e.clientX - dragFrom.x,
    e.clientY - dragFrom.y,
    frameWidth.value,
  );
  dragFrom = { x: e.clientX, y: e.clientY };
}

function onPointerUp(): void {
  dragFrom = null;
}

/** Arrow keys move the photo too, for anyone not dragging: each the way it points. */
const KEY_STEP = 12;
const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-KEY_STEP, 0],
  ArrowRight: [KEY_STEP, 0],
  ArrowUp: [0, -KEY_STEP],
  ArrowDown: [0, KEY_STEP],
};

function onKey(e: KeyboardEvent): void {
  const step = KEYS[e.key];
  if (!step || !photo.value) return;
  e.preventDefault();
  view.value = panned(
    photo.value,
    view.value,
    step[0],
    step[1],
    frameWidth.value,
  );
}

function onZoom(zoom: number): void {
  if (photo.value) view.value = zoomed(photo.value, view.value, zoom);
}

function confirm(): void {
  if (rect.value) emit('confirm', { ...rect.value });
}
</script>

<template>
  <ModalShell
    :open="!!file"
    variant="center"
    size="lg"
    title="Frame your banner"
    icon="image"
    @close="emit('cancel')"
  >
    <div class="crop">
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
      <div
        ref="frame"
        class="crop__frame"
        :style="{ aspectRatio: String(BANNER_ASPECT) }"
        tabindex="0"
        role="img"
        aria-label="The banner. Drag the photo, or use the arrow keys, to choose the part that shows."
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @keydown="onKey"
      >
        <img
          v-if="src"
          :src="src"
          alt=""
          class="crop__photo"
          :style="photoStyle"
          draggable="false"
          @load="onLoad"
        />
      </div>
      <p class="crop__hint">
        Drag to choose what shows behind your party's name.
      </p>

      <Slider
        :model-value="view.zoom"
        label="Zoom"
        :value-text="`${Math.round(view.zoom * 100)}%`"
        :min="1"
        :max="MAX_ZOOM"
        :step="0.01"
        @update:model-value="onZoom"
      />

      <div class="crop__actions">
        <PillButton label="Cancel" size="md" @click="emit('cancel')" />
        <PillButton
          label="Use this"
          icon="check"
          variant="accent"
          size="md"
          :disabled="!rect"
          @click="confirm"
        />
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.crop {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* The banner's own shape: what is inside it is what is uploaded. */
.crop__frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--rs);
  background: var(--surface2);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.crop__frame:active {
  cursor: grabbing;
}

.crop__frame:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.crop__photo {
  position: absolute;
  top: 0;
  left: 0;
  max-width: none;
  transform-origin: 0 0;
  pointer-events: none;
}

.crop__hint {
  margin: -6px 0 0;
  font-size: 12px;
  color: var(--faint);
}

.crop__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
