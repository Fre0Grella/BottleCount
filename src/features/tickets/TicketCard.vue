<script setup lang="ts">
import { computed } from 'vue';
import { coverOf } from '../party/covers';
import { usePhotoLoads } from '../party/photoLoads';
import { formatLocalDate } from '../../lib/dates';
import Card from '../../components/ui/Card.vue';
import Icon from '../../components/ui/Icon.vue';

/**
 * A ticket as a guest sees it: the party's cover, the QR the door scans, the
 * guest's name and code, and whatever the page puts in the slot below them
 * (the "Save to my phone" button).
 *
 * Shared by the guest's ticket page and the planner's preview, so what a host
 * previews is what a guest gets. The cover is the party's banner photo when
 * it has one, over the emoji and gradient it falls back to.
 *
 * No store imports: the ticket page has none.
 */
const props = defineProps<{
  /** The party's name, or '' for a ticket that does not carry one. */
  party: string;
  /** ISO date, `YYYY-MM-DD`, or ''. */
  date: string;
  time: string;
  cover: number;
  /** Where the banner photo is fetched from, or null for none. */
  banner: string | null;
  guestName: string;
  code: string;
  /** The QR as a data URL, or null while it is being drawn. */
  qr: string | null;
  expired: boolean;
}>();

const base = import.meta.env.BASE_URL as string;

const coverStyle = computed(() => coverOf(props.cover));

const photos = usePhotoLoads();
const banner = computed(() => photos.usable(props.banner));
const bannerShown = computed(() => photos.shown(banner.value));

const dateLabel = computed(() =>
  formatLocalDate(props.date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }),
);
</script>

<template>
  <Card pad="none" class="ticket-card">
    <div
      class="ticket-cover"
      :class="{ 'ticket-cover--photo': bannerShown }"
      :style="{ background: coverStyle.grad }"
    >
      <!-- The host's banner photo, cropped to the header like the invite's.
         Invisible until it has loaded; on failure it just goes away. -->
      <img
        v-if="banner"
        :src="banner"
        alt=""
        class="ticket-cover__photo"
        @load="photos.onLoad(banner)"
        @error="photos.onError(banner)"
      />
      <div v-if="bannerShown" class="ticket-cover__scrim" />
      <span v-else class="ticket-emoji">{{ coverStyle.emoji }}</span>
      <h1 class="ticket-title">{{ party || 'Your ticket' }}</h1>
      <p v-if="dateLabel" class="ticket-when">
        {{ dateLabel }}<template v-if="time"> · {{ time }}</template>
      </p>
    </div>

    <div class="ticket-body">
      <div class="ticket-qr" :class="{ 'ticket-qr--expired': expired }">
        <img
          v-if="qr"
          :src="qr"
          :alt="`Entry QR code for ${guestName}`"
          width="260"
          height="260"
        />
      </div>

      <div class="ticket-guest">{{ guestName }}</div>
      <div class="ticket-code" aria-label="Ticket code">{{ code }}</div>

      <p v-if="expired" class="ticket-note ticket-note--warn" role="status">
        <Icon name="info" :size="14" />
        This ticket has expired.
      </p>
      <p v-else class="ticket-note">
        Show this at the door. Turn your screen brightness up — and if the QR
        won't scan, read out the code.
      </p>

      <slot />
    </div>

    <p class="ticket-foot">
      <a :href="base">Planned with BottleCount</a>
    </p>
  </Card>
</template>

<style scoped>
/* The kit's card, at a phone's width, its cover clipped to the corners. */
.ticket-card {
  width: 100%;
  max-width: 420px;
  overflow: hidden;
}

.ticket-cover {
  position: relative;
  padding: 28px 22px 22px;
  color: #fff;
}
/* With a banner, the header is tall enough to show it. */
.ticket-cover--photo {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.ticket-cover > .ticket-title,
.ticket-cover > .ticket-when {
  position: relative;
}
/* The banner fills the header behind its text, cropped to fit, and fades in
   once loaded. */
.ticket-cover__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.ticket-cover--photo .ticket-cover__photo {
  opacity: 1;
}
.ticket-cover__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.6));
}
.ticket-emoji {
  font-size: 30px;
  display: block;
  margin-bottom: 10px;
}
.ticket-title {
  font-family: var(--font-disp);
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
  overflow-wrap: anywhere;
}
.ticket-when {
  margin: 6px 0 0;
  font-size: 13px;
  opacity: 0.92;
}

.ticket-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

/* Always white: a QR needs its light background whatever the Theme. */
.ticket-qr {
  width: min(100%, 280px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border-radius: 16px;
  background: #ffffff;
}
.ticket-qr img {
  width: 100%;
  height: auto;
  display: block;
}
.ticket-qr--expired {
  opacity: 0.35;
}

.ticket-guest {
  margin-top: 6px;
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 20px;
  overflow-wrap: anywhere;
}
.ticket-code {
  font-family: ui-monospace, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--accent);
}

.ticket-note {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--dim);
  display: flex;
  align-items: center;
  gap: 7px;
}
.ticket-note--warn {
  color: var(--bad);
  font-weight: 600;
}

.ticket-foot {
  margin: 0;
  padding: 0 22px 18px;
  text-align: center;
  font-size: 11px;
}
.ticket-foot a {
  color: var(--faint);
  text-decoration: none;
}
</style>
