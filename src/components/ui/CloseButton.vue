<script setup lang="ts">
import Icon from './Icon.vue';

/**
 * The quiet x that closes a dialog. Icon-only, so `label` is its name for a
 * screen reader ("Close", "Close ticket"). ModalShell's standard header uses
 * it; a dialog that keeps its own heading places one itself.
 */
defineProps<{ label: string }>();
</script>

<template>
  <button type="button" class="bc-close" :aria-label="label">
    <Icon name="x" :size="18" />
  </button>
</template>

<style scoped>
.bc-close {
  cursor: pointer;
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dim);
}
</style>
