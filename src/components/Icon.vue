<script setup lang="ts">
defineProps<{ name: string; size?: number | string }>();

const icons: Record<string, string> = {
  bottle:
    '<path d="M10 2h4v3l1 3v12a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8l1-3z"/><path d="M9 12h6"/>',
  glass: '<path d="M4 4h16l-8 9-8-9z"/><path d="M12 13v7"/><path d="M8 20h8"/>',
  beer: '<path d="M6 8h9v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/><path d="M8 8V6a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v2"/>',
  wine: '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 17v3"/><path d="M9 21h6"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  calc: '<rect x="6" y="3" width="12" height="18" rx="1.5"/><path d="M8.5 7h7"/><path d="M8.5 11h2"/><path d="M8.5 15h2"/><path d="M13.5 11v4"/>',
  cart: '<path d="M3 4h2l2 12h11l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  users:
    '<path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="6.5" r="3.5"/><path d="M21 19v-1a4 4 0 0 0-3-3.87"/><path d="M16.5 3.13a4 4 0 0 1 0 7.75"/>',
  ticket:
    '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14"/>',
  mapPin:
    '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar:
    '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M4 9h16"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  euro: '<path d="M17.5 6.6a7 7 0 1 0 0 10.8"/><path d="M3 10h13"/><path d="M3 14h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  share:
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4"/><path d="M15.4 6.5l-6.8 4"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  zap: '<path d="M13 2 4 14h7l-2 8 9-12h-7z"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  sparkle:
    '<path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="M19 15l.6 2L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6z"/>',
  link: '<path d="M9 15l6-6"/><path d="M10 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M14 18l-1 1a4 4 0 0 1-6-6l1-1"/>',
  mail: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 7l8 6 8-6"/>',
  message:
    '<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 6.5h.01"/>',
  qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2z"/><path d="M18 14h2v2h-2z"/><path d="M14 18h2v2h-2z"/><path d="M18 18h2v2h-2z"/>',
  trophy:
    '<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 5H5v1a3 3 0 0 0 3 3"/><path d="M16 5h3v1a3 3 0 0 1-3 3"/><path d="M10 14h4v3h-4z"/><path d="M9 21h6"/><path d="M12 17v4"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  heart:
    '<path d="M12 20s-7-4.5-9.5-9A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9z"/>',
  trash:
    '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M9 7V4h6v3"/>',
  pin: '<path d="M12 17v5"/><path d="M9 3h6l-1 4 3 3v2H7v-2l3-3z"/>',
  pinS: '<path d="M12 17v5"/><path d="M9 3h6l-1 4 3 3v2H7v-2l3-3z"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  arrowL: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  arrowR: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  chevU: '<path d="M6 15l6-6 6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"/>',
  doc: '<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M8 13h7"/><path d="M8 17h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-6h4v6"/>',
  clipboard:
    '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2H9z"/><path d="M9 11h6"/><path d="M9 15h4"/>',
  hourglass:
    '<path d="M6 3h12"/><path d="M6 21h12"/><path d="M6 3c0 4 6 5 6 9s-6 5-6 9"/><path d="M18 3c0 4-6 5-6 9s6 5 6 9"/>',
  tune: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  pencil: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style="display: block"
    v-html="icons[name] ?? ''"
  />
</template>
