import type { IconName } from './icons';
import type { IngredientType } from './types';

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
