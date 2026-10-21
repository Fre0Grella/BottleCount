/**
 * Links that open another app with a message already written — and, when we
 * know who it is for, already addressed to them.
 *
 * This is how tickets reach guests: the organiser's own phone sends them, one
 * tap each, from their own WhatsApp or mail app. Nothing is sent by a server,
 * so there is no email provider, no sending domain, no daily limit, and no
 * automated WhatsApp traffic for anyone to ban. Pressing send in the other app
 * is the confirmation.
 */

/** E.164 without the `+`, which is what `wa.me` and `sms:` address by. */
function digits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** Opens WhatsApp on the guest's chat, or on the contact picker without a number. */
export function whatsappUrl(message: string, phone?: string | null): string {
  return `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}`;
}

/** Opens the mail app with the recipient, subject and body filled in. */
export function mailtoUrl(
  subject: string,
  body: string,
  email?: string | null,
): string {
  // The address is encoded like any other part of the URL — a `?` or `&` in it
  // would otherwise end it early — but `@` is left readable, since some mail
  // apps show the raw recipient.
  const to = email ? encodeURIComponent(email).replace(/%40/g, '@') : '';
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens Messages. `?&body=` is the spelling both iOS and Android accept. */
export function smsUrl(message: string, phone?: string | null): string {
  const to = digits(phone);
  return `sms:${to ? `+${to}` : ''}?&body=${encodeURIComponent(message)}`;
}
