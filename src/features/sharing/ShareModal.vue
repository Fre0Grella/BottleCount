<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../../store/store';
import { coverOf } from '../party/covers';
import ModalShell from '../../components/ui/ModalShell.vue';
import Icon from '../../components/ui/Icon.vue';
import Toggle from '../../components/ui/Toggle.vue';
import ShareChannels from './ShareChannels.vue';
import { inviteUrl, linkLabel } from '../../../shared/urls';
import { shortDate } from '../../lib/dates';
import { venueWhere as whereOf } from '../../lib/display';

const store = useStore();

const party = computed(() => store.activeParty());

const cover = computed(() => coverOf(party.value?.cover));

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

const inviteLinkLabel = computed(() => linkLabel(inviteLink.value));

const publishing = computed(() => store.state.publishing);
const publishFailed = computed(
  () => !publishing.value && !publication.value && store.state.publishError,
);

const venueWhere = computed(() => {
  const p = party.value;
  if (!p) return '';
  return whereOf(p.venue) || 'TBD';
});

const partyDateShort = computed(() => {
  const p = party.value;
  if (!p) return '';
  return shortDate(p.date);
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
  <ModalShell
    :open="store.state.shareOpen"
    variant="sheet"
    size="md"
    icon="share"
    @close="handleClose"
  >
    <template #title>Invite to {{ party?.name ?? '' }}</template>

    <!-- Preview card -->
    <div class="share__card">
      <div class="share__cover" :style="{ background: cover.grad }">
        <span class="share__emoji">{{ cover.emoji }}</span>
      </div>
      <div class="share__body">
        <div class="share__name">
          {{ party?.name ?? '' }}
        </div>
        <div class="share__where">{{ venueWhere }} · {{ partyDateShort }}</div>
        <div class="share__link">
          <Icon name="link" :size="12" />
          <span v-if="publishing">Creating your link…</span>
          <span v-else-if="publishFailed" class="share__link-failed">
            Couldn't reach the server — try again in a moment.
          </span>
          <span v-else class="share__link-text" data-testid="invite-link">{{
            inviteLinkLabel
          }}</span>
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
    <Toggle
      :model-value="allowForward"
      icon="share"
      :tile-size="34"
      :icon-size="16"
      class="share__forward"
      :class="{ 'share__forward--on': allowForward }"
      @update:model-value="(on) => store.update((p) => (p.allowForward = on))"
    >
      Let guests invite friends
      <template #description>
        Your invite gets a "+ bring a friend" button
      </template>
    </Toggle>

    <!-- Footer hint -->
    <div class="share__hint">
      {{ shareHint }}
    </div>
  </ModalShell>
</template>

<style scoped>
.share__card {
  border-radius: var(--rs);
  overflow: hidden;
  border: 1px solid var(--border);
  margin-bottom: 16px;
}

.share__cover {
  height: 74px;
  display: flex;
  align-items: flex-end;
  padding: 10px;
}

.share__emoji {
  font-size: 24px;
}

.share__body {
  padding: 12px 14px;
  background: var(--surface2);
}

.share__name {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 15px;
}

.share__where {
  font-size: 12px;
  color: var(--dim);
  margin-top: 2px;
}

.share__link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--faint);
  margin-top: 8px;
}

.share__link-failed {
  color: var(--bad);
}

.share__link-text {
  user-select: all;
  overflow-wrap: anywhere;
}

.share__forward {
  padding: 13px 14px;
  border-radius: var(--rs);
  background: var(--surface2);
  border: 1px solid var(--border);
}
.share__forward--on {
  border-color: var(--accent);
}

.share__hint {
  font-size: 11px;
  color: var(--faint);
  text-align: center;
  margin-top: 12px;
}
</style>
