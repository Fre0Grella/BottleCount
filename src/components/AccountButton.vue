<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../lib/store';
import { logout } from '../lib/session';
import Icon from './Icon.vue';

const store = useStore();

const session = computed(() => store.state.session);

/**
 * With no backend there is no account to have, so the control hides rather than
 * offering a sign-in that cannot work. That is the GitHub Pages build and any
 * Pages deployment without the service binding.
 */
const visible = computed(
  () => session.value.backendAvailable && !store.state.sessionLoading,
);

const label = computed(() => {
  const user = session.value.user;
  if (!user) return 'Sign in';
  return user.name ?? user.email;
});

const busy = ref(false);

async function handleLogout(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  await logout();
  await store.refreshSession();
  busy.value = false;
}
</script>

<template>
  <div v-if="visible" style="display: flex; align-items: center; gap: 8px">
    <a
      v-if="!session.authenticated"
      href="/auth/google"
      style="
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 13px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--dim);
        text-decoration: none;
      "
    >
      <Icon name="user" :size="14" />
      Sign in
    </a>

    <template v-else>
      <span
        style="
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 600;
          padding: 7px 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          max-width: 190px;
        "
      >
        <img
          v-if="session.user?.picture"
          :src="session.user.picture"
          alt=""
          width="18"
          height="18"
          referrerpolicy="no-referrer"
          style="border-radius: 999px; display: block; flex-shrink: 0"
        />
        <Icon v-else name="user" :size="14" />
        <span
          style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
          >{{ label }}</span
        >
        <span
          v-if="session.tier === 'pro'"
          style="
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 2px 6px;
            border-radius: 999px;
            background: var(--accent-soft);
            color: var(--accent);
            flex-shrink: 0;
          "
          >{{ session.selfHosted ? 'Self-hosted' : 'Pro' }}</span
        >
      </span>
      <button
        title="Sign out"
        aria-label="Sign out"
        :disabled="busy"
        style="
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--dim);
        "
        @click="handleLogout"
      >
        <Icon name="logout" :size="15" />
      </button>
    </template>
  </div>
</template>
