<script setup lang="ts">
/**
 * A panel on the page: surface, hairline border, the large radius.
 *
 * pad: sm 16px (Menu, Shopping), md 18px (Plan), lg 20px (Guests).
 * `highlight` draws the border in the accent, for a setting that is on.
 * `as` sets the element, such as "section".
 */
withDefaults(
  defineProps<{
    as?: string;
    pad?: 'sm' | 'md' | 'lg';
    highlight?: boolean;
  }>(),
  { as: 'div', pad: 'md', highlight: false },
);
</script>

<template>
  <component
    :is="as"
    class="bc-card"
    :class="[`bc-card--${pad}`, { 'bc-card--highlight': highlight }]"
  >
    <slot />
  </component>
</template>

<style scoped>
.bc-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
}

.bc-card--sm {
  padding: 16px;
}
.bc-card--md {
  padding: 18px;
}
.bc-card--lg {
  padding: 20px;
}

.bc-card--highlight {
  border-color: var(--accent);
}
</style>
