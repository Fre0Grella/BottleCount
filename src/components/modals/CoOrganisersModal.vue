<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { collaboratorUrl } from '../../../shared/collab';
import { useStore } from '../../lib/store';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';

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

async function createLink(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;

  const token = await store.inviteCoOrganiser();
  if (token) {
    link.value = collaboratorUrl(window.location.host, base, token);
  } else {
    error.value = "Couldn't create a link. Try again in a moment.";
  }
  busy.value = false;
}

function copyLink(): void {
  navigator.clipboard
    ?.writeText(`https://${link.value}`)
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
  <Modal
    :open="store.state.membersOpen"
    variant="sheet"
    max-width="460px"
    @close="store.closeMembers()"
  >
    <div style="padding: 22px">
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
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
          <Icon name="users" :size="17" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 16px;
          "
        >
          Co-organisers
        </div>
      </div>

      <p
        style="
          font-size: 12px;
          color: var(--dim);
          line-height: 1.55;
          margin: 0 0 18px 0;
        "
      >
        Anyone here can edit the party — menu, budget, guest list — from their
        own device, and changes show up on yours within a few seconds. They
        don't need to pay: the party is yours.
      </p>

      <!-- Who's on the party -->
      <div style="display: flex; flex-direction: column; gap: 8px">
        <div
          v-for="member in members"
          :key="member.userId"
          style="
            display: flex;
            align-items: center;
            gap: 11px;
            padding: 11px 13px;
            border-radius: var(--rs);
            background: var(--surface2);
          "
        >
          <img
            v-if="member.picture"
            :src="member.picture"
            alt=""
            width="26"
            height="26"
            referrerpolicy="no-referrer"
            style="border-radius: 999px; display: block; flex-shrink: 0"
          />
          <span
            v-else
            style="
              display: flex;
              width: 26px;
              height: 26px;
              flex-shrink: 0;
              align-items: center;
              justify-content: center;
              border-radius: 999px;
              background: var(--surface-3, var(--surface));
              color: var(--dim);
            "
          >
            <Icon name="user" :size="14" />
          </span>

          <div style="flex: 1; min-width: 0">
            <div
              style="
                font-size: 13px;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              "
            >
              {{ label(member.userId, member.name, member.email) }}
            </div>
            <div style="font-size: 11px; color: var(--faint)">
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
            :title="
              member.userId === session.user?.id ? 'Leave this party' : 'Remove'
            "
            style="
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
            "
            @click="remove(member.userId)"
          >
            <Icon name="x" :size="14" />
          </button>
        </div>
      </div>

      <!-- Inviting. Owner only — an editor who could invite could undo a removal. -->
      <template v-if="isOwner">
        <div
          style="
            margin-top: 18px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
          "
        >
          <div v-if="!link">
            <button
              :disabled="busy"
              style="
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
              "
              @click="createLink"
            >
              <Icon name="link" :size="15" />
              {{ busy ? 'Creating…' : 'Create an invite link' }}
            </button>
          </div>

          <div v-else style="display: flex; flex-direction: column; gap: 9px">
            <div
              style="
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: var(--faint);
              "
            >
              Send this to your co-organiser
            </div>
            <div
              style="
                font-size: 12px;
                font-family: monospace;
                color: var(--dim);
                background: var(--surface2);
                padding: 11px 13px;
                border-radius: var(--rs);
                overflow-wrap: anywhere;
              "
            >
              {{ link }}
            </div>
            <div style="display: flex; gap: 8px">
              <button
                style="
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
                "
                @click="copyLink"
              >
                <Icon name="copy" :size="14" />
                {{ copied ? 'Copied' : 'Copy link' }}
              </button>
              <button
                :disabled="busy"
                title="Stop this link working"
                style="
                  cursor: pointer;
                  font-size: 13px;
                  font-weight: 600;
                  padding: 11px 15px;
                  border-radius: 999px;
                  border: 1px solid var(--border);
                  background: transparent;
                  color: var(--dim);
                "
                @click="revoke"
              >
                Revoke
              </button>
            </div>
            <p
              style="
                font-size: 11px;
                color: var(--faint);
                margin: 0;
                line-height: 1.5;
              "
            >
              Anyone with this link can edit the party until you revoke it.
            </p>
          </div>

          <p
            v-if="error"
            style="font-size: 12px; color: var(--bad); margin: 10px 0 0 0"
          >
            {{ error }}
          </p>
        </div>
      </template>
    </div>
  </Modal>
</template>
