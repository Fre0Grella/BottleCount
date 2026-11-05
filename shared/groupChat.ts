/**
 * The party's group chat: a link the host pastes (a WhatsApp group, a Telegram
 * channel...) and the text on the button guests tap to join. Shared by the
 * Worker, which stores and hands it out, and the frontend, which edits and
 * draws it.
 *
 * Only guests who have said yes get it, like how to pay (`payments.ts`):
 * anyone holding a group link can join the group, and the invite link travels
 * further than the host's own contacts.
 */

/** The apps whose links get their own button: colour, mark and wording. */
const GROUP_APPS = [
  'whatsapp',
  'telegram',
  'discord',
  'signal',
  'messenger',
] as const;

/** One of {@link GROUP_APPS}, or `other` for any other https link. */
export type GroupApp = (typeof GROUP_APPS)[number] | 'other';

/** How the app is named on the button and in the editor. */
export const GROUP_APP_NAMES: Record<GroupApp, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  discord: 'Discord',
  signal: 'Signal',
  messenger: 'Messenger',
  other: '',
};

/** The hosts each app's invite links live on, subdomains included. */
const APP_HOSTS: Record<Exclude<GroupApp, 'other'>, readonly string[]> = {
  whatsapp: ['whatsapp.com', 'wa.me'],
  telegram: ['t.me', 'telegram.me', 'telegram.dog'],
  discord: ['discord.gg', 'discord.com', 'discordapp.com'],
  signal: ['signal.group', 'signal.me'],
  messenger: ['m.me', 'messenger.com'],
};

/** Room for the longest real invite link, bounded because guests open it. */
export const GROUP_URL_MAX = 300;
/** One short line on a button. */
export const GROUP_LABEL_MAX = 40;

/** What the party document stores. '' is no group chat / the default text. */
export interface GroupChat {
  url: string;
  label: string;
}

/** What a confirmed guest's page gets: a link it can use as it is. */
export interface GroupChatDTO {
  /** Always `https://`. */
  url: string;
  label: string;
  app: GroupApp;
}

export function emptyGroupChat(): GroupChat {
  return { url: '', label: '' };
}

/**
 * The link a guest is sent to, or null when `input` is not one: https only (a
 * host pasting `chat.whatsapp.com/...` without it gets it added), a host with
 * a dot in it, no username or password. Anything else, `javascript:` included,
 * never reaches a page.
 */
export function groupChatHref(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > GROUP_URL_MAX || /\s/.test(trimmed)) {
    return null;
  }
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.') || url.username || url.password) return null;
  return url.href;
}

/** Which app a link belongs to, by its host. */
export function groupApp(href: string): GroupApp {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  for (const app of GROUP_APPS) {
    const hosts = APP_HOSTS[app];
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return app;
  }
  return 'other';
}

/** The button's text when the host has not written one. */
export function defaultGroupLabel(app: GroupApp): string {
  const name = GROUP_APP_NAMES[app];
  return name ? `Join the ${name} group` : 'Join the group chat';
}

/**
 * Any value, as a group chat. Total like `normaliseDocument`, which calls it:
 * a link that is not one is dropped rather than stored, since it ends up as a
 * button on every confirmed guest's page.
 */
export function normaliseGroupChat(value: unknown): GroupChat {
  const g = (typeof value === 'object' && value !== null ? value : {}) as {
    url?: unknown;
    label?: unknown;
  };
  const url = typeof g.url === 'string' ? g.url.trim() : '';
  const label = typeof g.label === 'string' ? g.label : '';
  return {
    url: groupChatHref(url) ? url : '',
    label: label.trim().slice(0, GROUP_LABEL_MAX),
  };
}

/** The button a guest's page draws, or null when the party has no group chat. */
export function groupChatFor(
  chat: GroupChat | null | undefined,
): GroupChatDTO | null {
  const url = groupChatHref(chat?.url ?? '');
  if (!url) return null;
  const app = groupApp(url);
  return {
    url,
    app,
    label: chat?.label.trim() || defaultGroupLabel(app),
  };
}
