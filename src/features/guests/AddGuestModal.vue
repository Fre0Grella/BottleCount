<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { optionalContact } from '../../../shared/contact';
import { useStore } from '../../store/store';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';

/**
 * Adds a guest by hand, or — opened from a guest's row — sets where to send
 * their ticket. One sheet for both because the fields are the same and the
 * second is just the first without the name.
 */

const store = useStore();

const name = ref('');
const email = ref('');
const phone = ref('');
const error = ref<string | null>(null);
const saving = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

/** The guest being edited, or null when adding a new one. */
const editing = computed(() => {
  const id = store.state.contactFor;
  if (id === null) return null;
  return store.activeParty()?.invites.find((i) => i.id === id) ?? null;
});

watch(
  () => store.state.addGuestOpen,
  (open) => {
    if (!open) return;
    name.value = '';
    email.value = editing.value?.email ?? '';
    phone.value = editing.value?.phone ?? '';
    error.value = null;
    void nextTick(() => inputRef.value?.focus());
  },
);

function handleClose(): void {
  store.closeAddGuest();
}

const MESSAGES: Record<string, string> = {
  invalid_email: 'That email doesn’t look right.',
  invalid_phone: 'That phone number doesn’t look right.',
  not_saved_yet: 'This guest is still being saved. Try again in a moment.',
};

/** The contact as the server would store it, or the reason it would refuse. */
function contact(): { email: string | null; phone: string | null } | string {
  const parsed = optionalContact(email.value, phone.value);
  return 'error' in parsed ? parsed.error : parsed;
}

async function submit(): Promise<void> {
  if (saving.value) return;
  const parsed = contact();
  if (typeof parsed === 'string') {
    error.value = MESSAGES[parsed] ?? null;
    return;
  }

  const guest = editing.value;
  if (!guest) {
    const trimmed = name.value.trim();
    if (!trimmed) return;
    store.addInvite(trimmed, parsed);
    store.closeAddGuest();
    return;
  }

  saving.value = true;
  const failed = await store.setInviteContact(guest.id, parsed);
  saving.value = false;
  if (failed) {
    error.value = MESSAGES[failed] ?? 'Couldn’t save that. Try again.';
    return;
  }
  store.closeAddGuest();
}

const canSubmit = computed(
  () => !saving.value && (editing.value !== null || name.value.trim() !== ''),
);
</script>

<template>
  <ModalShell
    :open="store.state.addGuestOpen"
    variant="sheet"
    size="sm"
    :icon="editing ? 'mail' : 'users'"
    @close="handleClose"
  >
    <template #title>{{
      editing ? `Contact for ${editing.name}` : 'Add a guest'
    }}</template>

    <!-- Name field -->
    <template v-if="!editing">
      <label class="guest-label">Guest name</label>
      <input
        ref="inputRef"
        v-model="name"
        class="guest-input"
        placeholder="e.g. Sofia Marlowe"
        @keydown.enter="submit"
      />
    </template>

    <label class="guest-label">Email <span>(optional)</span></label>
    <input
      :ref="editing ? 'inputRef' : undefined"
      v-model="email"
      class="guest-input"
      type="email"
      inputmode="email"
      autocomplete="off"
      spellcheck="false"
      placeholder="sofia@example.com"
      @keydown.enter="submit"
    />

    <label class="guest-label"
      >Phone <span>(optional, for WhatsApp)</span></label
    >
    <input
      v-model="phone"
      class="guest-input"
      type="tel"
      inputmode="tel"
      autocomplete="off"
      placeholder="+39 333 123 4567"
      @keydown.enter="submit"
    />

    <p class="guest-hint">
      Used only to send their ticket for this party. Without a country code, a
      number is taken to be Italian.
    </p>
    <p v-if="error" class="guest-error">{{ error }}</p>

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
        :disabled="!canSubmit"
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
        :style="{ opacity: canSubmit ? '1' : '0.5' }"
        @click="submit"
      >
        <Icon :name="editing ? 'check' : 'plus'" :size="15" />
        {{ editing ? (saving ? 'Saving…' : 'Save') : 'Add to list' }}
      </button>
    </div>
  </ModalShell>
</template>

<style scoped>
.guest-label {
  display: block;
  font-size: 12px;
  color: var(--dim);
  font-weight: 600;
  margin-bottom: 7px;
}
.guest-label span {
  font-weight: 500;
  color: var(--faint);
}
.guest-input {
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
  margin-bottom: 14px;
}
.guest-hint {
  margin: -4px 0 14px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--faint);
}
.guest-error {
  margin: -6px 0 14px;
  font-size: 12px;
  color: var(--bad);
}
</style>
