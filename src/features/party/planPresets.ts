/** The Plan tab's presets: how much people drink, and how much spare to buy. */

export const VIBES: {
  ml: number;
  label: string;
  emoji: string;
  sub: string;
}[] = [
  { ml: 25, emoji: '🌿', label: 'Soft', sub: 'soft / barely-there' },
  { ml: 50, emoji: '🍹', label: 'Aperitivo', sub: 'chill / social' },
  { ml: 75, emoji: '🎉', label: 'Party', sub: 'classic / spirited' },
  { ml: 100, emoji: '🔥', label: 'Hardcore', sub: 'intense / open bar' },
];

export const BUFFERS: { v: number; label: string }[] = [
  { v: 1.0, label: 'Exact' },
  { v: 1.1, label: '+10%' },
  { v: 1.2, label: '+20%' },
];
