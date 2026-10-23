<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../../store/store';
import { devSignIn, logout } from '../../lib/api/session';
import Icon from '../../components/ui/Icon.vue';

const store = useStore();

const session = computed(() => store.state.session);

/**
 * With no server reachable there is no account to have, so the control hides
 * rather than offering a sign-in that cannot work — a Worker that is down, or a
 * self-hosted Pages project with no service binding.
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

// ── Email sign-in, where the Worker offers it ─────────────────────────────
//
// Local development and self-hosted Workers sign people in without Google
// (`POST /auth/dev`). Linking to /auth/google there would lead to a 500 on a
// fresh clone, so the button opens this instead.
const signInOpen = ref(false);
const email = ref('');
const signInError = ref<string | null>(null);

async function handleDevSignIn(): Promise<void> {
  const value = email.value.trim();
  if (!value || busy.value) return;
  busy.value = true;
  signInError.value = null;
  const result = await devSignIn(value);
  if (result.ok) {
    signInOpen.value = false;
    email.value = '';
    await store.refreshSession();
  } else {
    signInError.value =
      result.error.kind === 'network'
        ? "Couldn't reach the server."
        : 'Sign-in failed.';
  }
  busy.value = false;
}

async function handleLogout(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  await logout();
  await store.refreshSession();
  busy.value = false;
}
</script>

<template>
  <div v-if="visible" class="account">
    <template v-if="!session.authenticated && session.devSignIn">
      <button
        type="button"
        class="account-pill"
        :aria-expanded="signInOpen"
        @click="signInOpen = !signInOpen"
      >
        <Icon name="user" :size="14" />
        <span class="account-pill__text">Sign in</span>
      </button>
      <form
        v-if="signInOpen"
        class="dev-signin"
        @submit.prevent="handleDevSignIn"
      >
        <!-- The label wraps its input but lays out as two rows of the form. -->
        <label class="dev-signin__field" for="dev-signin-email">
          <span class="dev-signin__label">
            This server signs you in by email — no Google account needed.
          </span>
          <input
            id="dev-signin-email"
            v-model="email"
            class="dev-signin__input"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            @keydown.escape="signInOpen = false"
          />
        </label>
        <span v-if="signInError" role="alert" class="dev-signin__error">{{
          signInError
        }}</span>
        <button
          type="submit"
          class="dev-signin__submit"
          :disabled="busy || !email.trim()"
        >
          Continue
        </button>
      </form>
    </template>

    <a
      v-else-if="!session.authenticated"
      href="/auth/google"
      class="account-pill"
    >
      <Icon name="user" :size="14" />
      Sign in
    </a>

    <template v-else>
      <span class="account-chip">
        <img
          v-if="session.user?.picture"
          :src="session.user.picture"
          alt=""
          width="18"
          height="18"
          referrerpolicy="no-referrer"
          class="account-chip__picture"
        />
        <Icon v-else name="user" :size="14" />
        <span class="account-chip__name">{{ label }}</span>
        <span v-if="session.tier === 'pro'" class="account-chip__tier">{{
          session.selfHosted ? 'Self-hosted' : 'Pro'
        }}</span>
      </span>
      <button
        title="Sign out"
        aria-label="Sign out"
        :disabled="busy"
        class="account-signout"
        @click="handleLogout"
      >
        <Icon name="logout" :size="15" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.account {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-pill {
  cursor: pointer;
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
}
.account-pill__text {
  white-space: nowrap;
}

.account-chip {
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
}
.account-chip__picture {
  border-radius: 999px;
  display: block;
  flex-shrink: 0;
}
.account-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-chip__tier {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.account-signout {
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
}

.dev-signin {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: var(--r);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}

.dev-signin__field {
  display: contents;
}
.dev-signin__label {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.5;
}
.dev-signin__input {
  font-size: 14px;
  padding: 10px 12px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  font-family: inherit;
}
.dev-signin__error {
  font-size: 11.5px;
  color: var(--bad);
}
.dev-signin__submit {
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: var(--on-accent);
}
.dev-signin__submit:disabled {
  opacity: 0.55;
}

/* The button is not flush right on a phone — Docs and the Theme Switch sit
   beside it — so anchoring to it would push the form off the left edge. */
@media (max-width: 600px) {
  .dev-signin {
    position: fixed;
    top: 72px;
    left: 16px;
    right: 16px;
    width: auto;
  }
}
</style>
