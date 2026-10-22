<script setup lang="ts">
import { BOTTLE_PATHS, MARK } from '../../lib/brand';

/**
 * The BottleCount mark, optionally with the wordmark beside it.
 *
 * Drawn inline from src/lib/brand.ts rather than loaded from `public/`, so it
 * follows the Theme through `--accent` / `--on-accent` (theme.css) with no
 * second image to swap. Astro pages use it too: with no `client:` directive it
 * renders to static markup.
 */
withDefaults(defineProps<{ size?: number; wordmark?: boolean }>(), {
  size: 28,
  wordmark: false,
});
</script>

<template>
  <span class="bc-logo">
    <svg
      class="bc-logo__mark"
      :viewBox="`0 0 ${MARK.size} ${MARK.size}`"
      :width="size"
      :height="size"
      fill="none"
      :role="wordmark ? undefined : 'img'"
      :aria-label="wordmark ? undefined : 'BottleCount'"
      :aria-hidden="wordmark ? 'true' : undefined"
    >
      <rect
        class="bc-logo__tile"
        :width="MARK.size"
        :height="MARK.size"
        :rx="MARK.radius"
      />
      <g
        class="bc-logo__ink"
        :transform="MARK.stem.transform"
        :stroke-width="MARK.stem.strokeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path v-for="d in BOTTLE_PATHS" :key="d" :d="d" />
      </g>
      <path
        class="bc-logo__ink"
        :d="MARK.upperBowl"
        :stroke-width="MARK.bowlWidth"
      />
      <path class="bc-logo__tile" :d="`${MARK.lowerBowl}z`" />
      <path
        class="bc-logo__ink"
        :d="MARK.lowerBowl"
        :stroke-width="MARK.bowlWidth"
      />
    </svg>
    <span v-if="wordmark" class="bc-wordmark"
      >Bottle<span class="bc-wordmark__accent">Count</span></span
    >
  </span>
</template>
