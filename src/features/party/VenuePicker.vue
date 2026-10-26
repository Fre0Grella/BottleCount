<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { Venue } from '../../../shared/collab';
import { MIN_QUERY_LENGTH, searchVenues, type VenueHit } from './venue';
import type { VenueMap } from './venueMap';
import { clearPin, movePin, pickVenue } from './planEdits';
import Field from '../../components/ui/Field.vue';
import PillButton from '../../components/ui/PillButton.vue';

/**
 * Find the venue on a map. Optional on purpose: the typed Venue and City
 * fields beside it keep working offline and without a pin, and picking a
 * result only fills them in and drops the pin.
 */
const props = defineProps<{ venue: Venue }>();

/** How long typing has to pause before the search goes out. */
const DEBOUNCE_MS = 350;

const query = ref('');
const hits = ref<VenueHit[]>([]);
const status = ref<'idle' | 'searching' | 'empty' | 'offline'>('idle');

let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: AbortController | null = null;

function onQuery(e: Event): void {
  query.value = (e.target as HTMLInputElement).value;
  clearTimeout(timer);
  inflight?.abort();
  hits.value = [];
  if (query.value.trim().length < MIN_QUERY_LENGTH) {
    status.value = 'idle';
    return;
  }
  status.value = 'searching';
  timer = setTimeout(runSearch, DEBOUNCE_MS);
}

async function runSearch(): Promise<void> {
  const controller = new AbortController();
  inflight = controller;
  const found = await searchVenues(query.value, controller.signal);
  if (controller.signal.aborted) return;
  inflight = null;
  hits.value = found ?? [];
  status.value = found === null ? 'offline' : found.length ? 'idle' : 'empty';
}

function choose(hit: VenueHit): void {
  pickVenue(hit);
  query.value = '';
  hits.value = [];
  status.value = 'idle';
}

// ── The map ───────────────────────────────────────────────────────────────

const mapEl = ref<HTMLElement | null>(null);
let map: VenueMap | null = null;

/**
 * Mounts the map the first time there is a pin and an element to put it in,
 * then follows the pin — picked here, dragged, or synced from a co-organiser.
 */
watch(
  [() => props.venue.pin, mapEl],
  async ([pin, el]) => {
    if (!pin || !el) {
      map?.destroy();
      map = null;
      return;
    }
    if (map) {
      map.show(pin);
      return;
    }
    const { mountVenueMap } = await import('./venueMap');
    // The pin may have been removed while Leaflet was loading.
    if (!props.venue.pin || mapEl.value !== el || map) return;
    map = mountVenueMap(el, props.venue.pin, movePin);
  },
  { immediate: true, deep: true },
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  inflight?.abort();
  map?.destroy();
});
</script>

<template>
  <div class="picker">
    <Field
      v-slot="{ id, describedBy }"
      label="Find on the map"
      optional="(optional)"
      icon="mapPin"
      size="sm"
      hint="Searches OpenStreetMap. You can also just type the venue below."
    >
      <input
        :id="id"
        type="search"
        :value="query"
        placeholder="Search a venue or an address"
        autocomplete="off"
        :aria-describedby="describedBy"
        @input="onQuery"
      />
    </Field>

    <p v-if="status !== 'idle'" class="picker__status" role="status">
      <template v-if="status === 'searching'">Searching…</template>
      <template v-else-if="status === 'empty'">No places found.</template>
      <template v-else>
        The search can't be reached right now. Type the venue below instead.
      </template>
    </p>

    <ul v-if="hits.length" class="picker__hits" aria-label="Places found">
      <li v-for="(hit, i) in hits" :key="i">
        <button type="button" class="picker__hit" @click="choose(hit)">
          <span class="picker__hit-name">{{ hit.place }}</span>
          <span class="picker__hit-address">{{ hit.pin.address }}</span>
        </button>
      </li>
    </ul>

    <div v-if="venue.pin" class="picker__pinned">
      <div ref="mapEl" class="picker__map" />
      <div class="picker__pin-row">
        <span class="picker__address">
          {{ venue.pin.address || 'Pinned on the map' }}
          <span class="picker__tip">Drag the pin to the exact door.</span>
        </span>
        <PillButton label="Remove pin" icon="x" @click="clearPin" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.picker__status {
  margin: 0;
  font-size: 12px;
  color: var(--faint);
}

.picker__hits {
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--rs);
  background: var(--surface2);
}

.picker__hit {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: none;
  border-radius: calc(var(--rs) - 4px);
  background: transparent;
  text-align: left;
}

.picker__hit:hover,
.picker__hit:focus-visible {
  background: var(--accent-soft);
}

.picker__hit-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.picker__hit-address {
  font-size: 12px;
  color: var(--dim);
}

.picker__map {
  position: relative;
  height: 200px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  overflow: hidden;
  /* Under the app's sticky header and modals, which Leaflet's panes outrank. */
  z-index: 0;
}

.picker__pin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}

.picker__address {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
  color: var(--dim);
}

.picker__tip {
  font-size: 11px;
  color: var(--faint);
}

/* Leaflet builds the marker outside Vue, so it is styled through :deep. */
.picker__map :deep(.venue-map__pin) {
  color: var(--accent);
  background: transparent;
  border: none;
}

.picker__map :deep(.venue-map__pin svg) {
  fill: var(--surface);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}
</style>
