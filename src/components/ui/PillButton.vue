<script setup lang="ts">
import Icon from './Icon.vue';
import type { IconName } from '../../lib/icons';

/**
 * A rounded action button with an optional icon.
 *
 * `label` is always required: it is the text, or, with `iconOnly` (the guest
 * rows on a phone), the button's accessible name — so an icon-only pill is
 * never nameless. `pressed` makes it a toggle button (aria-pressed).
 *
 * variant: accent (solid), outline (accent outline), good (green, soft fill),
 * ghost (neutral outline, dim text), quiet (neutral outline, faint text).
 * size: sm the guest-row action, md a card header action, lg a primary call.
 */
withDefaults(
  defineProps<{
    label: string;
    icon?: IconName;
    iconOnly?: boolean;
    variant?: 'accent' | 'outline' | 'good' | 'ghost' | 'quiet';
    size?: 'sm' | 'md' | 'lg';
    pressed?: boolean;
    disabled?: boolean;
  }>(),
  {
    icon: undefined,
    iconOnly: false,
    variant: 'ghost',
    size: 'sm',
    pressed: undefined,
    disabled: false,
  },
);
</script>

<template>
  <button
    type="button"
    class="bc-pill"
    :class="[`bc-pill--${variant}`, `bc-pill--${size}`]"
    :aria-label="iconOnly ? label : undefined"
    :aria-pressed="pressed"
    :disabled="disabled"
  >
    <Icon v-if="icon" :name="icon" :size="size === 'sm' ? 13 : 14" />
    <span v-if="!iconOnly">{{ label }}</span>
  </button>
</template>

<style scoped>
.bc-pill {
  cursor: pointer;
  display: flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  white-space: nowrap;
}

.bc-pill:disabled {
  cursor: default;
  opacity: 0.5;
}

.bc-pill--sm {
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 11px;
  min-height: 36px;
}
.bc-pill--md {
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 14px;
  min-height: 36px;
}
.bc-pill--lg {
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  padding: 9px 16px;
  min-height: 40px;
}

.bc-pill--accent {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
/* The primary call is a flat fill, no outline (GuestsTab's "Send invite"). */
.bc-pill--lg.bc-pill--accent {
  border: none;
}
.bc-pill--outline {
  border-color: var(--accent);
  color: var(--accent);
}
.bc-pill--good {
  border-color: var(--good);
  background: var(--good-soft);
  color: var(--good);
}
.bc-pill--ghost {
  color: var(--dim);
}
.bc-pill--quiet {
  color: var(--faint);
}
</style>
