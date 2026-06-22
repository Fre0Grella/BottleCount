<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useStore } from '../../lib/store';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

const store = useStore();

const name = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => store.state.addGuestOpen,
  (open) => {
    if (open) {
      name.value = '';
      void nextTick(() => inputRef.value?.focus());
    }
  },
);

function handleClose(): void {
  store.closeAddGuest();
}

function submit(): void {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  store.addInvite(trimmed);
  store.closeAddGuest();
}
</script>

<template>
  <Modal
    :open="store.state.addGuestOpen"
    variant="sheet"
    max-width="420px"
    @close="handleClose"
  >
    <div style="padding: 22px">
      <!-- Header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        "
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            align-items: center;
            justify-content: center;
            background: var(--accent-soft);
            color: var(--accent);
          "
        >
          <Icon name="users" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Add a guest
        </div>
        <button
          style="
            margin-left: auto;
            cursor: pointer;
            display: flex;
            width: 32px;
            height: 32px;
            align-items: center;
            justify-content: center;
            border: none;
            background: transparent;
            color: var(--dim);
          "
          @click="handleClose"
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

      <!-- Name field -->
      <label
        style="
          display: block;
          font-size: 12px;
          color: var(--dim);
          font-weight: 600;
          margin-bottom: 7px;
        "
      >
        Guest name
      </label>
      <input
        ref="inputRef"
        v-model="name"
        placeholder="e.g. Sofia Marlowe"
        style="
          width: 100%;
          box-sizing: border-box;
          font-size: 15px;
          padding: 12px 13px;
          border-radius: var(--rs);
          border: 1px solid var(--border);
          background: var(--surface2);
          color: var(--text);
          font-family: inherit;
          outline: none;
          margin-bottom: 16px;
        "
        @keydown.enter="submit"
      />

      <!-- Actions -->
      <div style="display: flex; gap: 9px">
        <button
          style="
            flex: 1;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            padding: 12px;
            border-radius: var(--rs);
            border: 1px solid var(--border);
            background: transparent;
            color: var(--dim);
          "
          @click="handleClose"
        >
          Cancel
        </button>
        <button
          :disabled="!name.trim()"
          style="
            flex: 2;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            font-size: 14px;
            font-weight: 700;
            padding: 12px;
            border-radius: var(--rs);
            border: none;
            background: var(--accent);
            color: var(--on-accent);
          "
          :style="{ opacity: name.trim() ? '1' : '0.5' }"
          @click="submit"
        >
          <Icon name="plus" :size="15" />
          Add to list
        </button>
      </div>
    </div>
  </Modal>
</template>
