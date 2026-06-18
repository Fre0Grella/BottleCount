<script setup lang="ts">
import { computed } from 'vue';
import { useStore, COVERS } from '../lib/store';
import Icon from './Icon.vue';

const store = useStore();

const party = computed(() => store.activeParty());
const emoji = computed(() => {
  const p = party.value;
  if (!p) return '🎉';
  return COVERS[p.cover ?? 0]?.emoji ?? '🎉';
});

const errCount = computed(() => store.menuErrors().length);

function onNameInput(e: Event): void {
  const val = (e.target as HTMLInputElement).value;
  store.update((p) => {
    p.name = val;
  });
}
</script>

<template>
  <div
    v-if="party"
    style="
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
    "
  >
    <!-- back button -->
    <button
      style="
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: var(--rs);
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        flex-shrink: 0;
      "
      @click="store.closeParty()"
    >
      <Icon name="arrowL" :size="18" />
    </button>

    <!-- emoji -->
    <span style="font-size: 22px; line-height: 1; flex-shrink: 0">{{
      emoji
    }}</span>

    <!-- name + date -->
    <div style="min-width: 0; flex: 1">
      <input
        :value="party.name"
        placeholder="Party name"
        style="
          font-family: var(--font-disp);
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.01em;
          background: transparent;
          border: none;
          color: var(--text);
          padding: 0;
          width: 100%;
          outline: none;
        "
        @input="onNameInput"
      />
      <div style="font-size: 11px; color: var(--faint); margin-top: 1px">
        {{ party.date }}
      </div>
    </div>

    <!-- right actions -->
    <div
      style="
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      "
    >
      <!-- balance badge -->
      <span
        v-if="errCount > 0"
        style="
          font-size: 11px;
          font-weight: 600;
          padding: 5px 11px;
          border-radius: 999px;
          background: var(--bad-soft);
          color: var(--bad);
        "
      >
        {{ errCount }} to balance
      </span>

      <!-- manage ingredients button -->
      <button
        style="
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 600;
          padding: 8px 13px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--dim);
          min-height: 36px;
        "
        @click="store.openIngMgr()"
      >
        <Icon name="tune" :size="15" />
        <span v-if="store.state.device === 'desktop'">Manage ingredients</span>
      </button>
    </div>
  </div>
</template>
