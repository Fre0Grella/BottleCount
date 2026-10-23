<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean;
    variant?: 'sheet' | 'center';
    maxWidth?: string;
  }>(),
  {
    variant: 'sheet',
    maxWidth: '520px',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="bc-modal">
      <div
        v-if="open"
        style="
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        "
        :style="variant === 'center' ? 'align-items:center' : ''"
      >
        <!-- scrim -->
        <div
          style="position: absolute; inset: 0; background: var(--scrim)"
          @click="emit('close')"
        />
        <!-- panel -->
        <div
          style="
            position: relative;
            z-index: 1;
            background: var(--surface);
            width: 100%;
            max-height: 90dvh;
            overflow-y: auto;
            border-radius: var(--r) var(--r) 0 0;
            box-shadow: var(--shadow);
          "
          :style="{
            maxWidth: maxWidth,
            borderRadius:
              variant === 'center' ? 'var(--r)' : 'var(--r) var(--r) 0 0',
          }"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bc-modal-enter-active,
.bc-modal-leave-active {
  transition: opacity 0.2s ease;
}
.bc-modal-enter-from,
.bc-modal-leave-to {
  opacity: 0;
}
.bc-modal-enter-active > div:last-child,
.bc-modal-leave-active > div:last-child {
  transition: transform 0.25s ease;
}
.bc-modal-enter-from > div:last-child {
  transform: translateY(32px);
}
.bc-modal-leave-to > div:last-child {
  transform: translateY(32px);
}
</style>
