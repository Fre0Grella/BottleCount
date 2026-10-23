import type { IconName } from '../../lib/icons';
import type { IngredientType } from '../../lib/types';

/**
 * How each ingredient type is named and drawn, everywhere the app groups by
 * type: the shopping list, the ingredient manager, the bottle picker, the menu.
 */
export const TYPE_META: Record<
  IngredientType,
  { label: string; icon: IconName }
> = {
  spirit: { label: 'Spirits', icon: 'bottle' },
  beer: { label: 'Beer', icon: 'beer' },
  wine: { label: 'Wine', icon: 'wine' },
  mixer: { label: 'Mixers & soft', icon: 'droplet' },
  extra: { label: 'Extras', icon: 'sparkle' },
  snack: { label: 'Snacks', icon: 'cart' },
};

/** A menu category's icon: beer, wine, or the spirits bottle for the rest. */
export function categoryIcon(cat: string): IconName {
  const n = cat.toLowerCase();
  if (n.includes('beer')) return TYPE_META.beer.icon;
  if (n.includes('wine')) return TYPE_META.wine.icon;
  return TYPE_META.spirit.icon;
}
