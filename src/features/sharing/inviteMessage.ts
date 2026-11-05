import { shortDate } from '../../lib/dates';

/**
 * The words that travel with the host's invite link in a message or an email.
 *
 * Plain ASCII on purpose, smiley and all: an emoji or a long dash reached some
 * guests as a broken symbol, and a prefilled message has to read right on any
 * phone. The ticket and the forward messages follow the same rule.
 */
export function inviteMessage(
  party: { name: string; date: string },
  where: string,
  link: string,
): string {
  const at = where ? ` at ${where}` : '';
  return `You're invited to ${party.name} on ${shortDate(party.date)}${at} (^_^)/ Let me know if you're coming: ${link}`;
}
