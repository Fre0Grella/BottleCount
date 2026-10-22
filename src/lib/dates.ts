/**
 * Calendar dates and clock times, in the device's own time zone.
 *
 * A party's date is a `YYYY-MM-DD` string with no zone — 14 November is 14
 * November wherever the host is. `new Date('2026-11-14')` reads that as
 * midnight *UTC*, which anywhere west of Greenwich is still the 13th: the
 * share sheet and the ticket message both said the day before. Every
 * `YYYY-MM-DD` is parsed and printed here, as local midnight, so none of them
 * can do that again.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → local midnight that day, or null when it is not a date. */
export function parseLocalDate(iso: string | null | undefined): Date | null {
  const match = ISO_DATE.exec(iso ?? '');
  if (!match) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  // `new Date` rolls 31 February over into March; a date that moved is not one.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** The local calendar day of `date` — today by default — as `YYYY-MM-DD`. */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `YYYY-MM-DD` for people to read, or '' when it is not a date — the caller
 * picks its own placeholder. `locale` left out is the browser's.
 */
export function formatLocalDate(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  return parseLocalDate(iso)?.toLocaleDateString(locale, options) ?? '';
}

/** `14 Nov` — short enough for a WhatsApp preview line or a ticket card. */
export function shortDate(iso: string | null | undefined): string {
  return formatLocalDate(iso, { day: 'numeric', month: 'short' }, 'en-GB');
}

/**
 * A check-in time as `HH:MM`. The server's are ISO timestamps; ones this
 * device recorded before it stored them as ISO were already `HH:MM`, and pass
 * through as they are. '' when there is none.
 */
export function formatClockTime(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
}
