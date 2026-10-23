<script setup lang="ts">
import Icon from './Icon.vue';
import type { IconName } from '../../lib/icons';

/**
 * The rounded square an icon sits on beside a title: card and dialog headers,
 * setting rows, list items. Decorative — the text next to it says what it is.
 *
 * tone: accent (orange on accent-soft), muted (faint on the track, for an off
 * setting), neutral (dim on surface2).
 */
withDefaults(
  defineProps<{
    icon?: IconName;
    size?: 32 | 34 | 38 | 46;
    iconSize?: number;
    tone?: 'accent' | 'muted' | 'neutral';
  }>(),
  { icon: undefined, size: 34, iconSize: 17, tone: 'accent' },
);
</script>

<template>
  <span
    class="bc-tile"
    :class="[`bc-tile--${size}`, `bc-tile--${tone}`]"
    aria-hidden="true"
  >
    <slot><Icon v-if="icon" :name="icon" :size="iconSize" /></slot>
  </span>
</template>

<style scoped>
.bc-tile {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.bc-tile--32 {
  width: 32px;
  height: 32px;
  border-radius: 9px;
}
.bc-tile--34 {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}
.bc-tile--38 {
  width: 38px;
  height: 38px;
  border-radius: 11px;
}
.bc-tile--46 {
  width: 46px;
  height: 46px;
  border-radius: 14px;
}

.bc-tile--accent {
  background: var(--accent-soft);
  color: var(--accent);
}
.bc-tile--muted {
  background: var(--track);
  color: var(--faint);
}
.bc-tile--neutral {
  background: var(--surface2);
  color: var(--dim);
}
</style>
