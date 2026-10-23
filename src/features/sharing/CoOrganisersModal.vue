<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { collaboratorUrl, linkLabel } from '../../../shared/urls';
import { useStore } from '../../store/store';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import IconTile from '../../components/ui/IconTile.vue';
import CloseButton from '../../components/ui/CloseButton.vue';

const store = useStore();

const base = import.meta.env.BASE_URL as string;

const isOwner = computed(() => store.state.role === 'owner');
const members = computed(() => store.state.members);
const session = computed(() => store.state.session);

const link = ref('');
const busy = ref(false);
const copied = ref(false);
const error = ref<string | null>(null);

/** Who you are, so the list can say "you" rather than your own email back. */
function label(userId: string, name: string | null, email: string): string {
  if (userId === session.value.user?.id) return 'You';
  return name ?? email;
}

/** Removing yourself is leaving; removing anyone else is the owner's call. */
function removeLabel(userId: string): string {
  return userId === session.value.user?.id ? 'Leave this party' : 'Remove';
}

async function createLink(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;

  const token = await store.inviteCoOrganiser();
  if (token) {
    link.value = collaboratorUrl(window.location.origin, base, token);
  } else {
    error.value = "Couldn't create a link. Try again in a moment.";
  }
  busy.value = false;
}

function copyLink(): void {
  navigator.clipboard
    ?.writeText(link.value)
    .then(() => {
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    })
    .catch(() => {});
}

async function revoke(): Promise<void> {
  busy.value = true;
  await store.revokeCoOrganiserInvites();
  link.value = '';
  busy.value = false;
}

async function remove(userId: string): Promise<void> {
  busy.value = true;
  await store.removeCoOrganiser(userId);
  busy.value = false;
}

// A link minted for one party means nothing on another.
watch(
  () => store.state.membersOpen,
  (open) => {
    if (!open) {
      link.value = '';
      error.value = null;
    }
  },
);
</script>

<template>
  <ModalShell
    v-slot="{ titleId }"
    :open="store.state.membersOpen"
    variant="sheet"
    size="md"
    @close="store.closeMembers()"
  >
    <div class="coorg">
      <div class="coorg__head">
        <IconTile icon="users" />
        <div :id="titleId" class="coorg__title">Co-organisers</div>
        <CloseButton
          class="coorg__close"
          label="Close co-organisers"
          @click="store.closeMembers()"
        />
      </div>

      <p class="coorg__intro">
        Anyone here can edit the party — menu, budget, guest list — from their
        own device, and changes show up on yours within a few seconds. They
        don't need to pay: the party is yours.
      </p>

      <!-- Who's on the party -->
      <div class="coorg__members">
        <div
          v-for="member in members"
          :key="member.userId"
          class="coorg__member"
        >
          <img
            v-if="member.picture"
            :src="member.picture"
            alt=""
            width="26"
            height="26"
            referrerpolicy="no-referrer"
            class="coorg__avatar"
          />
          <span v-else class="coorg__avatar coorg__avatar--blank">
            <Icon name="user" :size="14" />
          </span>

          <div class="coorg__who">
            <div class="coorg__name">
              {{ label(member.userId, member.name, member.email) }}
            </div>
            <div class="coorg__role">
              {{ member.role === 'owner' ? 'Owner' : 'Co-organiser' }}
            </div>
          </div>

          <!-- The owner may remove anyone; anyone may remove themselves. -->
          <button
            v-if="
              member.role !== 'owner' &&
              (isOwner || member.userId === session.user?.id)
            "
            :disabled="busy"
            :title="removeLabel(member.userId)"
            :aria-label="removeLabel(member.userId)"
            class="coorg__remove"
            @click="remove(member.userId)"
          >
            <Icon name="x" :size="14" />
          </button>
        </div>
      </div>

      <!-- Inviting. Owner only — an editor who could invite could undo a removal. -->
      <template v-if="isOwner">
        <div class="coorg__invite">
          <div v-if="!link">
            <button :disabled="busy" class="coorg__create" @click="createLink">
              <Icon name="link" :size="15" />
              {{ busy ? 'Creating…' : 'Create an invite link' }}
            </button>
          </div>

          <div v-else class="coorg__link-box">
            <div class="coorg__link-label">Send this to your co-organiser</div>
            <div class="coorg__link">
              {{ linkLabel(link) }}
            </div>
            <div class="coorg__actions">
              <button class="coorg__copy" @click="copyLink">
                <Icon name="copy" :size="14" />
                {{ copied ? 'Copied' : 'Copy link' }}
              </button>
              <button
                :disabled="busy"
                title="Stop this link working"
                class="coorg__revoke"
                @click="revoke"
              >
                Revoke
              </button>
            </div>
            <p class="coorg__note">
              Anyone with this link can edit the party until you revoke it.
            </p>
          </div>

          <p v-if="error" class="coorg__error">
            {{ error }}
          </p>
        </div>
      </template>
    </div>
  </ModalShell>
</template>

<style scoped>
.coorg {
  padding: 22px;
}

.coorg__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.coorg__title {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 16px;
}

/* The sheet's own heading, so the close sits at its end. */
.coorg__close {
  margin-left: auto;
  flex-shrink: 0;
}

.coorg__intro {
  font-size: 12px;
  color: var(--dim);
  line-height: 1.55;
  margin: 0 0 18px 0;
}

.coorg__members {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.coorg__member {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  border-radius: var(--rs);
  background: var(--surface2);
}

.coorg__avatar {
  display: block;
  flex-shrink: 0;
  border-radius: 999px;
}
.coorg__avatar--blank {
  display: flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  background: var(--surface-3, var(--surface));
  color: var(--dim);
}

.coorg__who {
  flex: 1;
  min-width: 0;
}

.coorg__name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coorg__role {
  font-size: 11px;
  color: var(--faint);
}

.coorg__remove {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--dim);
}

.coorg__invite {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.coorg__create {
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  padding: 12px 16px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: var(--on-accent);
  min-height: 44px;
}

.coorg__link-box {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.coorg__link-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}

.coorg__link {
  font-size: 12px;
  font-family: monospace;
  color: var(--dim);
  background: var(--surface2);
  padding: 11px 13px;
  border-radius: var(--rs);
  overflow-wrap: anywhere;
}

.coorg__actions {
  display: flex;
  gap: 8px;
}

.coorg__copy {
  flex: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  padding: 11px 16px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: var(--on-accent);
}

.coorg__revoke {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 11px 15px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--dim);
}

.coorg__note {
  font-size: 11px;
  color: var(--faint);
  margin: 0;
  line-height: 1.5;
}

.coorg__error {
  font-size: 12px;
  color: var(--bad);
  margin: 10px 0 0 0;
}
</style>
