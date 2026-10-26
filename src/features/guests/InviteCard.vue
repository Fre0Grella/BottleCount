<script setup lang="ts">
import { computed } from 'vue';
import type { PhotoSlot } from '../../../shared/coverPhotos';
import type { InvitePartyDTO } from '../../../shared/invites';
import { coverOf } from '../party/covers';
import { infoLines } from '../party/partyDetails';
import { usePhotoLoads } from '../party/photoLoads';
import { mapsLink } from '../party/venue';
import { formatLocalDate } from '../../lib/dates';
import { timeSpan, venueWhere } from '../../lib/display';
import Card from '../../components/ui/Card.vue';
import Icon from '../../components/ui/Icon.vue';

/**
 * An invitation as a guest sees it: the cover or banner, when and where, the
 * poster, the description and the practical info, and whatever the page puts
 * in the slot below them (the answer buttons, the RSVP form).
 *
 * Shared by the guest's invite page and the planner's preview, so what a host
 * previews is what a guest gets. It also owns the look of the answer buttons
 * (`.invite-actions`, `.invite-btn`) for both of them.
 *
 * No store imports: the guest page has none.
 */
const props = defineProps<{
  party: InvitePartyDTO;
  /** Where a photo is fetched from: the guest's route, or the organiser's. */
  photoUrl: (slot: PhotoSlot, token: string) => string | null;
}>();

const base = import.meta.env.BASE_URL as string;

const cover = computed(() => coverOf(props.party.cover));

/** The host's banner and poster, each null when there is none or it failed. */
const photos = usePhotoLoads();
function photoOf(slot: PhotoSlot): string | null {
  const token = props.party.photos?.[slot];
  return photos.usable(token ? props.photoUrl(slot, token) : null);
}
const banner = computed(() => photoOf('banner'));
const poster = computed(() => photoOf('poster'));
const bannerShown = computed(() => photos.shown(banner.value));
const posterShown = computed(() => photos.shown(poster.value));

/** `Saturday 14 June · 21:00 – 03:00`, leaving out whatever the host left blank. */
const whenLabel = computed(() => {
  const { date, venue } = props.party;
  const day = formatLocalDate(date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return [day, timeSpan(venue.time, venue.endTime)].filter(Boolean).join(' · ');
});

const whereLabel = computed(() => venueWhere(props.party.venue));

const description = computed(
  () => props.party.details?.description.trim() ?? '',
);
const info = computed(() => infoLines(props.party.details));

/** Only when the host picked the venue on the map; a typed one has no pin. */
const pin = computed(() => props.party.venue.pin ?? null);
const mapsHref = computed(() => (pin.value ? mapsLink(pin.value) : null));
</script>

<template>
  <Card pad="none" class="invite-card">
    <div
      class="invite-cover"
      :class="{ 'invite-cover--photo': bannerShown }"
      :style="{ background: cover?.grad }"
    >
      <!-- The host's banner photo, cropped to the header like any other.
         Invisible until it has loaded; on failure it just goes away. -->
      <img
        v-if="banner"
        :src="banner"
        alt=""
        class="invite-cover__photo"
        @load="photos.onLoad(banner)"
        @error="photos.onError(banner)"
      />
      <div v-if="bannerShown" class="invite-cover__scrim" />
      <span v-else class="invite-emoji">{{ cover?.emoji }}</span>
      <h1 class="invite-title">{{ party.name }}</h1>
      <p class="invite-when">{{ whenLabel }}</p>
    </div>

    <div class="invite-body">
      <div v-if="whereLabel || mapsHref" class="invite-where">
        <Icon name="mapPin" :size="14" />
        <div class="invite-where__text">
          <span v-if="whereLabel">{{ whereLabel }}</span>
          <span v-if="pin?.address" class="invite-where__address">
            {{ pin.address }}
          </span>
          <a
            v-if="mapsHref"
            class="invite-where__maps"
            :href="mapsHref"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Maps
          </a>
        </div>
      </div>

      <!-- The poster, whole: its text is the point of it, so it is never
         cropped. Tapping opens it full size. -->
      <a
        v-if="poster"
        v-show="posterShown"
        class="invite-poster"
        :href="poster"
        target="_blank"
        rel="noopener"
        aria-label="Open the party poster full size"
      >
        <img
          :src="poster"
          :alt="`Poster for ${party.name}`"
          @load="photos.onLoad(poster)"
          @error="photos.onError(poster)"
        />
      </a>

      <p v-if="description" class="invite-description">{{ description }}</p>

      <dl v-if="info.length" class="invite-info">
        <div v-for="line in info" :key="line.kind" class="invite-info__row">
          <dt>
            <Icon :name="line.icon" :size="14" />
            {{ line.label }}
          </dt>
          <dd>{{ line.text }}</dd>
        </div>
      </dl>

      <slot />
    </div>

    <p class="invite-foot">
      <a :href="base">Planned with BottleCount</a>
    </p>
  </Card>
</template>

<style scoped>
/* The kit's card, at a phone's width, its cover clipped to the corners. */
.invite-card {
  width: 100%;
  max-width: 420px;
  overflow: hidden;
}
.invite-cover {
  position: relative;
  padding: 28px 22px 22px;
  color: #fff;
}
.invite-cover--photo .invite-cover__photo {
  opacity: 1;
}
/* With a banner, the header is tall enough to show it. */
.invite-cover--photo {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.invite-cover > .invite-title,
.invite-cover > .invite-when {
  position: relative;
}
.invite-poster {
  display: flex;
  justify-content: center;
  border-radius: var(--rs);
  overflow: hidden;
  background: #000;
}
/* As tall as it is, up to most of a phone's screen; never cropped. */
.invite-poster img {
  display: block;
  max-width: 100%;
  max-height: 75vh;
  object-fit: contain;
}
.invite-emoji {
  font-size: 30px;
  display: block;
  margin-bottom: 10px;
}
.invite-title {
  font-family: var(--font-disp);
  font-size: 26px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0;
}
.invite-when {
  margin: 6px 0 0;
  font-size: 13px;
  opacity: 0.92;
}
.invite-body {
  padding: 20px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.invite-where {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  font-size: 13px;
  color: var(--dim);
}
/* Lines the pin up with the first line of text, not the middle of three. */
.invite-where > .bc-icon {
  flex: none;
  margin-top: 2px;
}
/* The host's own line breaks, kept; never markup. */
.invite-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.invite-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--rs);
  background: var(--surface2);
}
.invite-info dt {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--dim);
}
.invite-info dd {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}
.invite-foot {
  margin: 0;
  padding: 0 22px 20px;
  text-align: center;
  font-size: 11px;
}
.invite-foot a {
  color: var(--faint);
  text-decoration: none;
}
.invite-cover__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.6));
}
.invite-where__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.invite-where__address {
  font-size: 12px;
  color: var(--faint);
}
.invite-where__maps {
  align-self: flex-start;
  margin-top: 4px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}
.invite-where__maps:hover {
  text-decoration: underline;
}
.invite-info__row {
  display: grid;
  grid-template-columns: minmax(0, 8.5em) 1fr;
  gap: 10px;
  font-size: 13px;
}
/* The banner photo fills the header behind its text, cropped to fit. It
   fades in once loaded and is never seen half-there or broken. */
.invite-cover__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s ease;
}

/* The answer buttons, slotted in by the invite page and the preview alike. */
:slotted(.invite-actions) {
  display: flex;
  gap: 9px;
}

:slotted(.invite-btn) {
  flex: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  padding: 13px 14px;
  border-radius: 999px;
  border: 1px solid transparent;
  min-height: 46px;
}

:slotted(.invite-btn:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

:slotted(.invite-btn--yes) {
  background: var(--accent);
  color: var(--on-accent);
}

:slotted(.invite-btn--no) {
  background: transparent;
  border-color: var(--border);
  color: var(--dim);
}
</style>
