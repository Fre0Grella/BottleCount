<script setup lang="ts">
import { computed } from 'vue';
import { useStore, COVERS } from '../../lib/store';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';
import ShareChannels from '../ShareChannels.vue';
import { inviteUrl } from '../../../shared/invites';

const store = useStore();

const party = computed(() => store.activeParty());

const cover = computed(() => {
  const p = party.value;
  if (!p) return COVERS[0];
  return COVERS[p.cover] ?? COVERS[0];
});

/**
 * The host's own link, or '' until the party has been published.
 *
 * The slug is the server's, not one derived from the party name: renaming the
 * party must not change a link already sent, and only the server knows which
 * slug it handed out. `openShare` publishes on open, so this fills in a moment
 * after the sheet appears — `publishing` covers the gap.
 */
const publication = computed(() => party.value?.publication ?? null);

const inviteLink = computed(() => {
  const pub = publication.value;
  if (!pub) return '';
  // `window` is always there: the whole app mounts under `client:only`, so this
  // never renders on the server. Reading the live origin is also what makes a
  // preview deployment and a self-hosted domain each hand out links that point
  // back at themselves — scheme included, so `http://localhost` works too.
  return inviteUrl(
    window.location.origin,
    import.meta.env.BASE_URL as string,
    pub.slug,
    pub.rootToken,
  );
});

/** The link as the card shows it: without the scheme, which nobody reads. */
const inviteLinkLabel = computed(() =>
  inviteLink.value.replace(/^https?:\/\//, ''),
);

const publishing = computed(() => store.state.publishing);
const publishFailed = computed(
  () => !publishing.value && !publication.value && store.state.publishError,
);

const venueWhere = computed(() => {
  const p = party.value;
  if (!p) return '';
  const parts = [p.venue.place, p.venue.city].filter(Boolean);
  return parts.join(', ') || 'TBD';
});

const partyDateShort = computed(() => {
  const p = party.value;
  if (!p) return '';
  return new Date(p.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
});

const allowForward = computed(() => party.value?.allowForward ?? false);

const shareHint = computed(() =>
  allowForward.value
    ? 'Friends-of-friends will show up in your spread view.'
    : 'Only people you invite directly can RSVP.',
);

/** The words that travel with the link in a message or an email. */
const message = computed(() => {
  const p = party.value;
  if (!p) return inviteLink.value;
  const where = venueWhere.value === 'TBD' ? '' : ` at ${venueWhere.value}`;
  return `You're invited to ${p.name} — ${partyDateShort.value}${where}. Let me know if you're coming: ${inviteLink.value}`;
});

const qrFileName = computed(
  () =>
    `${(party.value?.name ?? 'party').replace(/[^\w-]+/g, '-').toLowerCase()}-invite.png`,
);

function handleClose() {
  store.closeShare();
}
</script>

<template>
  <Modal
    :open="store.state.shareOpen"
    variant="sheet"
    max-width="460px"
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
          <Icon name="share" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Invite to {{ party?.name ?? '' }}
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

      <!-- Preview card -->
      <div
        style="
          border-radius: var(--rs);
          overflow: hidden;
          border: 1px solid var(--border);
          margin-bottom: 16px;
        "
      >
        <div
          style="
            height: 74px;
            display: flex;
            align-items: flex-end;
            padding: 10px;
          "
          :style="{ background: cover.grad }"
        >
          <span style="font-size: 24px">{{ cover.emoji }}</span>
        </div>
        <div style="padding: 12px 14px; background: var(--surface2)">
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 700;
              font-size: 15px;
            "
          >
            {{ party?.name ?? '' }}
          </div>
          <div style="font-size: 12px; color: var(--dim); margin-top: 2px">
            {{ venueWhere }} · {{ partyDateShort }}
          </div>
          <div
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              color: var(--faint);
              margin-top: 8px;
            "
          >
            <Icon name="link" :size="12" />
            <span v-if="publishing">Creating your link…</span>
            <span v-else-if="publishFailed" style="color: var(--bad)">
              Couldn't reach the server — try again in a moment.
            </span>
            <span
              v-else
              style="user-select: all; overflow-wrap: anywhere"
              data-testid="invite-link"
              >{{ inviteLinkLabel }}</span
            >
          </div>
        </div>
      </div>

      <!--
        The sheet closes by unmounting, so the channels' notice and QR start
        fresh on every open without a reset of their own.
      -->
      <ShareChannels
        :link="inviteLink"
        :message="message"
        :email-subject="`You're invited: ${party?.name ?? 'a party'}`"
        :share-title="party?.name ?? ''"
        :qr-file-name="qrFileName"
        sent-note=" — watch the RSVPs roll in."
      />

      <!-- Allow forward toggle -->
      <div
        style="
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          border-radius: var(--rs);
          background: var(--surface2);
        "
        :style="{
          border: `1px solid ${allowForward ? 'var(--accent)' : 'var(--border)'}`,
        }"
        @click="store.update((p) => (p.allowForward = !p.allowForward))"
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 9px;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          "
          :style="{
            background: allowForward ? 'var(--accent-soft)' : 'var(--track)',
            color: allowForward ? 'var(--accent)' : 'var(--faint)',
          }"
        >
          <Icon name="share" :size="16" />
        </span>
        <div style="flex: 1">
          <div style="font-size: 13px; font-weight: 600">
            Let guests invite friends
          </div>
          <div style="font-size: 11px; color: var(--faint)">
            Your invite gets a "+ bring a friend" button
          </div>
        </div>
        <!-- Toggle switch -->
        <span
          style="
            display: flex;
            align-items: center;
            width: 42px;
            height: 24px;
            border-radius: 999px;
            padding: 3px;
            transition: background 0.2s;
            flex-shrink: 0;
          "
          :style="{
            background: allowForward ? 'var(--accent)' : 'var(--track)',
          }"
        >
          <span
            style="
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #fff;
              transition: transform 0.2s;
            "
            :style="{
              transform: allowForward ? 'translateX(18px)' : 'translateX(0)',
            }"
          />
        </span>
      </div>

      <!-- Footer hint -->
      <div
        style="
          font-size: 11px;
          color: var(--faint);
          text-align: center;
          margin-top: 12px;
        "
      >
        {{ shareHint }}
      </div>
    </div>
  </Modal>
</template>
