/**
 * What the host tells guests about the party beyond its name, date and venue,
 * shared by the Worker and the frontend.
 *
 * All of it is shown on the invite page, which anyone with the link can open
 * (ADR 0002), so the server bounds every string and keeps only the kinds of
 * practical info it knows. Nothing here is ever rendered as markup or a link.
 */

/**
 * The practical lines a host can fill in. A fixed set rather than lines of
 * their own: the document has to stay free of arrays for merge patches to work
 * (see `patch.ts`), and a known kind is what lets the invite page give each
 * line its label and icon.
 */
export const INFO_KINDS = [
  'dress_code',
  'bring',
  'getting_there',
  'entry',
] as const;

export type InfoKind = (typeof INFO_KINDS)[number];

export interface PartyDetails {
  /** Free text: what the party is, anything guests should read first. */
  description: string;
  /** One short line per kind. '' means not shown. */
  info: Record<InfoKind, string>;
}

/** Long enough for a few paragraphs; bounded because it is public. */
export const DESCRIPTION_MAX = 1000;
/** One line: "Free parking behind the building", not an essay. */
export const INFO_MAX = 120;

export function emptyDetails(): PartyDetails {
  return {
    description: '',
    info: { dress_code: '', bring: '', getting_there: '', entry: '' },
  };
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * Any value, as details. Total like `normaliseDocument`, which calls it: a
 * missing field is empty, an unknown kind is dropped.
 */
export function normaliseDetails(value: unknown): PartyDetails {
  const d = (typeof value === 'object' && value !== null ? value : {}) as {
    description?: unknown;
    info?: unknown;
  };
  const info = (
    typeof d.info === 'object' && d.info !== null ? d.info : {}
  ) as Record<string, unknown>;

  const details = emptyDetails();
  details.description = text(d.description, DESCRIPTION_MAX);
  for (const kind of INFO_KINDS) {
    details.info[kind] = text(info[kind], INFO_MAX);
  }
  return details;
}
