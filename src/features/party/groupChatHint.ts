import {
  GROUP_APP_NAMES,
  groupApp,
  groupChatHref,
} from '../../../shared/groupChat';

/**
 * What the Plan tab says under the group chat's link as the host types it:
 * which app it found, or that the link will not work. The rules on what is
 * stored are in shared/groupChat.ts.
 */
export function groupChatHint(url: string): {
  text: string;
  error: boolean;
} {
  if (!url.trim()) {
    return {
      text: 'Paste the invite link from WhatsApp, Telegram, Discord, Signal, Messenger or any other app.',
      error: false,
    };
  }
  const href = groupChatHref(url);
  if (!href) {
    return {
      text: "That doesn't look like an invite link. It should start with https://",
      error: true,
    };
  }
  const name = GROUP_APP_NAMES[groupApp(href)];
  return name
    ? { text: `${name} link: guests get a ${name} button.`, error: false }
    : {
        text: 'Not an app we know: guests get a plain button.',
        error: false,
      };
}
