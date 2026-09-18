<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../lib/store';
import type { Feature } from '../../shared/tiers';
import Icon from './Icon.vue';

/**
 * Wraps a paid feature.
 *
 * When the session allows it, this renders the slot and nothing else — no
 * wrapper element, no styling, so an unlocked feature behaves exactly as it did
 * before the tier model existed. When it doesn't, the slot is not rendered at
 * all: the point is that a locked feature is *absent*, not merely covered by an
 * overlay a devtools inspector can delete.
 */
const props = defineProps<{
  feature: Feature;
  /** Shown in place of the feature. Keep it to one line. */
  title: string;
  blurb: string;
}>();

const store = useStore();

const unlocked = computed(() => store.can(props.feature));
</script>

<template>
  <slot v-if="unlocked" />

  <div
    v-else
    style="
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 16px 18px;
      border-radius: var(--rs);
      border: 1px dashed var(--border);
      background: var(--surface2);
    "
  >
    <span
      style="
        display: flex;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 10px;
        align-items: center;
        justify-content: center;
        background: var(--accent-soft);
        color: var(--accent);
      "
    >
      <Icon name="lock" :size="15" />
    </span>
    <div style="flex: 1; min-width: 0">
      <div style="font-size: 13px; font-weight: 600; color: var(--text)">
        {{ title }}
      </div>
      <div style="font-size: 11.5px; color: var(--dim); line-height: 1.5">
        {{ blurb }}
      </div>
    </div>
    <button
      style="
        cursor: pointer;
        flex-shrink: 0;
        font-size: 12px;
        font-weight: 700;
        padding: 9px 15px;
        border-radius: 999px;
        border: none;
        background: var(--accent);
        color: var(--on-accent);
        min-height: 38px;
      "
      @click="store.requestUpgrade(feature)"
    >
      Unlock
    </button>
  </div>
</template>
