<script setup lang="ts">
import { computed, useId, useSlots } from 'vue';
import IconTile from './IconTile.vue';
import type { IconName } from '../../lib/icons';

/**
 * An on/off setting: a real switch (role=switch, aria-checked, Space and Enter
 * flip it, focus ring from theme.css). The whole row is the hit target — icon
 * tile, label, description and the track — as the hand-built rows were.
 *
 * The default slot is the label and names the switch; `description` is read
 * after it. A bare switch with no text needs `label` for its name.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Accessible name when the default slot is empty. */
    label?: string;
    icon?: IconName;
    tileSize?: 32 | 34;
    iconSize?: number;
    /** lg: the label in the display face at 16px, for a card-level setting. */
    size?: 'md' | 'lg';
  }>(),
  {
    label: undefined,
    icon: undefined,
    tileSize: 32,
    iconSize: 15,
    size: 'md',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', on: boolean): void;
}>();

const slots = useSlots();
const labelId = useId();
const descId = useId();
const hasText = computed(() => !!slots.default);

function flip(): void {
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <div
    role="switch"
    tabindex="0"
    class="bc-toggle"
    :class="[`bc-toggle--${size}`, { 'bc-toggle--on': modelValue }]"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="hasText ? undefined : label"
    :aria-labelledby="hasText ? labelId : undefined"
    :aria-describedby="slots.description ? descId : undefined"
    @click="flip"
    @keydown.enter.prevent="flip"
    @keydown.space.prevent="flip"
  >
    <IconTile
      v-if="icon"
      :icon="icon"
      :size="tileSize"
      :icon-size="iconSize"
      :tone="modelValue ? 'accent' : 'muted'"
    />
    <span v-if="hasText" class="bc-toggle__text">
      <span :id="labelId" class="bc-toggle__label"><slot /></span>
      <span v-if="slots.description" :id="descId" class="bc-toggle__desc">
        <slot name="description" />
      </span>
    </span>
    <span class="bc-toggle__track" aria-hidden="true">
      <span class="bc-toggle__thumb" />
    </span>
  </div>
</template>

<style scoped>
.bc-toggle {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: var(--rs);
}

.bc-toggle__text {
  flex: 1;
  min-width: 0;
}

.bc-toggle__label {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.bc-toggle--lg .bc-toggle__label {
  font-family: var(--font-disp);
  font-size: 16px;
}

.bc-toggle__desc {
  display: block;
  font-size: 11px;
  color: var(--faint);
}

.bc-toggle__track {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: 42px;
  height: 24px;
  padding: 3px;
  border-radius: 999px;
  background: var(--track);
  transition: background 0.2s;
}

.bc-toggle__thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--knob);
  transition: transform 0.2s;
}

.bc-toggle--on .bc-toggle__track {
  background: var(--accent);
}

.bc-toggle--on .bc-toggle__thumb {
  transform: translateX(18px);
}
</style>
