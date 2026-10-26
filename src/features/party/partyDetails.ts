import type { InfoKind, PartyDetails } from '../../../shared/details';
import { INFO_KINDS } from '../../../shared/details';
import type { IconName } from '../../lib/icons';

/**
 * How the practical info reads, in the Plan tab where the host fills it in and
 * on the invite page where guests read it. The rules on what is stored are in
 * shared/details.ts.
 *
 * No store or database imports: the invite page pulls this in.
 */

interface InfoField {
  label: string;
  icon: IconName;
  placeholder: string;
}

export const INFO_FIELDS: Record<InfoKind, InfoField> = {
  dress_code: {
    label: 'Dress code',
    icon: 'sparkle',
    placeholder: 'e.g. All white',
  },
  bring: {
    label: 'What to bring',
    icon: 'cart',
    placeholder: 'e.g. A swimsuit and your own cup',
  },
  getting_there: {
    label: 'Getting there',
    icon: 'pin',
    placeholder: 'e.g. Free parking behind the building',
  },
  entry: {
    label: 'Entry',
    icon: 'key',
    placeholder: 'e.g. 18+, bring an ID',
  },
};

export interface InfoLine extends InfoField {
  kind: InfoKind;
  text: string;
}

/** The lines the host filled in, in the fixed order, for guests to read. */
export function infoLines(
  details: PartyDetails | null | undefined,
): InfoLine[] {
  const lines: InfoLine[] = [];
  for (const kind of INFO_KINDS) {
    const text = details?.info[kind]?.trim() ?? '';
    if (text) lines.push({ kind, text, ...INFO_FIELDS[kind] });
  }
  return lines;
}
