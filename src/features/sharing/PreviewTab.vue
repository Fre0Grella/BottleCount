<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { generateTicketCode } from '../../../shared/tickets';
import { inviteUrl } from '../../../shared/urls';
import { brandedQrDataUrl } from '../../lib/drawing';
import { useStore } from '../../store/store';
import { previewInvite, previewPhotoUrl, sampleGuestName } from './preview';
import InviteCard from '../guests/InviteCard.vue';
import TicketCard from '../tickets/TicketCard.vue';
import Icon from '../../components/ui/Icon.vue';

/**
 * The invite and a ticket as guests get them, for the host to check before
 * sending anything. Both are the very components the guest pages render, fed
 * from this party, so what is previewed is what is sent.
 */
const store = useStore();
const party = computed(() => store.activeParty());
const isPhone = computed(store.isPhone);

const invite = computed(() =>
  party.value ? previewInvite(party.value) : null,
);
const photoUrl = computed(() =>
  party.value ? previewPhotoUrl(party.value) : () => null,
);
const ticketBanner = computed(() => {
  const token = party.value?.photos.banner;
  return token ? photoUrl.value('banner', token) : null;
});

/** The real invite, once the link is open, for a look at it in a new tab. */
const link = computed(() => {
  const slug = party.value?.publication?.slug;
  const base = import.meta.env.BASE_URL as string;
  return slug ? inviteUrl(window.location.origin, base, slug) : null;
});

// ── The sample ticket ──────────────────────────────────────────────────────

const guestName = computed(() =>
  party.value ? sampleGuestName(party.value) : 'Your guest',
);
/** A made-up code: this ticket is a picture of one, not one the door accepts. */
const code = generateTicketCode();
const qr = ref<string | null>(null);

// Drawn once: the QR does not change with the party, only the card around it.
watch(
  party,
  async (p) => {
    if (p && !qr.value) qr.value = await brandedQrDataUrl(`PREVIEW-${code}`);
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="party && invite" class="preview">
    <div class="preview__intro">
      <h2>What your guests see</h2>
      <p>
        The invite and a ticket, exactly as they open on a guest's phone. Change
        anything in Plan and it shows here.
      </p>
    </div>

    <div class="preview__cols" :class="{ 'preview__cols--one': isPhone }">
      <section class="preview__col" aria-labelledby="preview-invite">
        <div class="preview__head">
          <h3 id="preview-invite">The invite</h3>
          <a
            v-if="link"
            :href="link"
            target="_blank"
            rel="noopener"
            class="preview__open"
          >
            Open the real one
            <Icon name="link" :size="13" />
          </a>
        </div>
        <p class="preview__note">The answer buttons don't do anything here.</p>

        <InviteCard :party="invite" :photo-url="photoUrl">
          <!-- The first step a guest gets, inert: a picture of the buttons. -->
          <div class="invite-actions" inert>
            <button type="button" class="invite-btn invite-btn--yes">
              <Icon name="check" :size="15" />
              I'm in
            </button>
            <button type="button" class="invite-btn invite-btn--no">
              <Icon name="x" :size="15" />
              Can't make it
            </button>
          </div>
        </InviteCard>
      </section>

      <section class="preview__col" aria-labelledby="preview-ticket">
        <div class="preview__head">
          <h3 id="preview-ticket">A ticket</h3>
        </div>
        <p class="preview__note">
          What a guest gets once they're in, made out to {{ guestName }}. The QR
          is a sample the door won't accept.
        </p>

        <TicketCard
          :party="party.name"
          :date="party.date"
          :time="party.venue.time"
          :cover="party.cover"
          :banner="ticketBanner"
          :guest-name="guestName"
          :code="code"
          :qr="qr"
          :expired="false"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 32px;
  animation: bcFadeUp 0.3s ease both;
}

.preview__intro h2 {
  margin: 0;
  font-family: var(--font-disp);
  font-size: 20px;
  font-weight: 700;
}

.preview__intro p {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dim);
}

.preview__cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

.preview__cols--one {
  grid-template-columns: 1fr;
}

.preview__col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.preview__head {
  width: 100%;
  max-width: 420px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.preview__head h3 {
  margin: 0;
  font-family: var(--font-disp);
  font-size: 15px;
  font-weight: 600;
}

.preview__open {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}

.preview__note {
  width: 100%;
  max-width: 420px;
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--faint);
}
</style>
