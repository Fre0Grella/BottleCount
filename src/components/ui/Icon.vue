<script setup lang="ts">
import { ICONS, type IconName } from '../../lib/icons';

/**
 * One icon from the registry in src/lib/icons.ts. Astro pages use it too: with
 * no `client:` directive it renders to static markup.
 */
defineProps<{ name: IconName; size?: number | string }>();
</script>

<template>
  <!-- ICONS is our own source-controlled markup, never user input. -->
  <!-- eslint-disable vue/no-v-html -->
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="bc-icon"
    aria-hidden="true"
    v-html="ICONS[name]"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>
