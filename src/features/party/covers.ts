/**
 * The party covers: the gradient and emoji a party is shown with, on the
 * planner and on every page a guest opens.
 *
 * Its own module, with no imports, because the guest pages (invite, ticket,
 * join) need it and must not pull in the planner's store and database.
 */

/** A cover. A party stores the index of its own; see {@link coverOf}. */
export interface Cover {
  grad: string;
  emoji: string;
  label: string;
}

export const COVERS: Cover[] = [
  {
    grad: 'linear-gradient(135deg,#FF7A3D,#FF3D77)',
    emoji: '🌇',
    label: 'Sunset',
  },
  {
    grad: 'linear-gradient(135deg,#7C3AED,#22D3EE)',
    emoji: '🪩',
    label: 'Neon',
  },
  {
    grad: 'linear-gradient(135deg,#0EA5E9,#22D3EE)',
    emoji: '🏖️',
    label: 'Pool',
  },
  {
    grad: 'linear-gradient(135deg,#16A34A,#84CC16)',
    emoji: '🌿',
    label: 'Garden',
  },
  {
    grad: 'linear-gradient(135deg,#1E293B,#6366F1)',
    emoji: '🌙',
    label: 'Midnight',
  },
  {
    grad: 'linear-gradient(135deg,#F59E0B,#EF4444)',
    emoji: '✨',
    label: 'Gold',
  },
];

/** The cover at `index`, or the first one for a missing or unknown index. */
export function coverOf(index: number | null | undefined): Cover {
  return COVERS[index ?? 0] ?? COVERS[0];
}
