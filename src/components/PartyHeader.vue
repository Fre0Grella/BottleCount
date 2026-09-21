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

/**
 * How many people are on this party besides you. Shown on the button so the
 * fact that a party is shared is visible without opening anything — which
 * matters when somebody else's edits start appearing under your cursor.
 */
const coOrganisers = computed(() =>
  Math.max(0, store.state.members.length - 1),
);

/**
 * Whether there are unsent edits. A shared party that is quietly failing to
 * save is the worst thing this feature can do silently, so it says so.
 */
const syncPending = computed(() => store.state.syncPending);
const syncFailed = computed(() => store.state.syncError !== null);

const membersTitle = computed(() =>
  coOrganisers.value > 0
    ? `${coOrganisers.value + 1} people are running this party`
    : 'Invite a co-organiser',
);

const syncLabel = computed(() =>
  syncFailed.value
    ? { short: 'Not saved', title: "Couldn't reach the server — still trying" }
    : { short: 'Saving…', title: 'Saving your changes…' },
);

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

      <!--
        Unsent edits. Only appears on a shared party, because on a local-only
        one there is nothing to be behind on.
      -->
      <span
        v-if="party.publication && (syncPending || syncFailed)"
        :title="syncLabel.title"
        style="
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          padding: 5px 11px;
          border-radius: 999px;
        "
        :style="{
          background: syncFailed ? 'var(--bad-soft)' : 'var(--surface2)',
          color: syncFailed ? 'var(--bad)' : 'var(--dim)',
        }"
      >
        <Icon :name="syncFailed ? 'info' : 'hourglass'" :size="12" />
        <span v-if="store.state.device === 'desktop'">{{
          syncLabel.short
        }}</span>
      </span>

      <!-- co-organisers -->
      <button
        :title="membersTitle"
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
        @click="store.openMembers()"
      >
        <Icon name="users" :size="15" />
        <span v-if="coOrganisers > 0">{{ coOrganisers + 1 }}</span>
        <span v-else-if="store.state.device === 'desktop'">Co-organisers</span>
      </button>

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
