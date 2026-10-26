import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { VenuePin } from '../../../shared/collab';
import { ICONS } from '../../lib/icons';

/**
 * The Plan tab's map preview: Leaflet over OpenStreetMap's own tiles.
 *
 * Loaded with a dynamic import (see VenuePicker.vue), so the planner's bundle
 * does not carry Leaflet and a party with no pin never fetches it. OSM's tile
 * policy asks for the attribution Leaflet shows and for light use; one host
 * looking at one venue is that.
 */

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Street level: close enough to tell which door, far enough to find it. */
const ZOOM = 16;

/** The app's map pin, drawn as the marker so no image assets ship with it. */
const PIN_ICON = L.divIcon({
  className: 'venue-map__pin',
  html: `<svg viewBox="0 0 24 24" width="34" height="34" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.mapPin}</svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

export interface VenueMap {
  /** Moves the map and its marker to a pin picked somewhere else. */
  show(pin: Pick<VenuePin, 'lat' | 'lng'>): void;
  destroy(): void;
}

/**
 * A map in `el` centred on `pin`. Dragging the marker, or tapping the map,
 * reports the new spot through `onMove`.
 */
export function mountVenueMap(
  el: HTMLElement,
  pin: Pick<VenuePin, 'lat' | 'lng'>,
  onMove: (lat: number, lng: number) => void,
): VenueMap {
  const map = L.map(el, { scrollWheelZoom: false }).setView(
    [pin.lat, pin.lng],
    ZOOM,
  );
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

  const marker = L.marker([pin.lat, pin.lng], {
    icon: PIN_ICON,
    draggable: true,
    keyboard: false,
  }).addTo(map);

  marker.on('dragend', () => {
    const { lat, lng } = marker.getLatLng();
    onMove(lat, lng);
  });
  map.on('click', (e: L.LeafletMouseEvent) => {
    marker.setLatLng(e.latlng);
    onMove(e.latlng.lat, e.latlng.lng);
  });

  return {
    show(next) {
      const at = L.latLng(next.lat, next.lng);
      if (marker.getLatLng().equals(at)) return;
      marker.setLatLng(at);
      map.setView(at, Math.max(map.getZoom(), ZOOM));
    },
    destroy() {
      map.remove();
    },
  };
}
