import { describe, expect, it } from 'vitest';
import {
  GROUP_LABEL_MAX,
  defaultGroupLabel,
  groupApp,
  groupChatFor,
  groupChatHref,
  normaliseGroupChat,
} from './groupChat';

describe('groupChatHref', () => {
  it('takes an https link, adding the scheme a pasted one lacks', () => {
    expect(groupChatHref(' https://chat.whatsapp.com/AbC123 ')).toBe(
      'https://chat.whatsapp.com/AbC123',
    );
    expect(groupChatHref('t.me/+xyz')).toBe('https://t.me/+xyz');
  });

  it('refuses anything a guest should not be sent to', () => {
    for (const bad of [
      '',
      'javascript:alert(1)',
      'http://chat.whatsapp.com/x',
      'data:text/html,hi',
      'chat',
      'https://user:pw@example.com/',
      'chat.whatsapp.com/a b',
      `https://example.com/${'x'.repeat(300)}`,
    ]) {
      expect(groupChatHref(bad), bad).toBeNull();
    }
  });
});

describe('groupApp', () => {
  it('knows the popular apps by their link', () => {
    expect(groupApp('https://chat.whatsapp.com/AbC')).toBe('whatsapp');
    expect(groupApp('https://wa.me/393331234567')).toBe('whatsapp');
    expect(groupApp('https://t.me/+AbC')).toBe('telegram');
    expect(groupApp('https://discord.gg/abc')).toBe('discord');
    expect(groupApp('https://discord.com/invite/abc')).toBe('discord');
    expect(groupApp('https://signal.group/#abc')).toBe('signal');
    expect(groupApp('https://m.me/j/abc')).toBe('messenger');
  });

  it('is other for anything else, lookalikes included', () => {
    expect(groupApp('https://example.com/group')).toBe('other');
    expect(groupApp('https://notwhatsapp.com/x')).toBe('other');
    expect(groupApp('https://t.me.evil.com/x')).toBe('other');
  });
});

describe('normaliseGroupChat', () => {
  it('drops a link that is not one and bounds the text', () => {
    expect(
      normaliseGroupChat({
        url: 'javascript:alert(1)',
        label: ` ${'a'.repeat(60)} `,
      }),
    ).toEqual({ url: '', label: 'a'.repeat(GROUP_LABEL_MAX) });
  });

  it('is empty for anything that is not a group chat', () => {
    expect(normaliseGroupChat(undefined)).toEqual({ url: '', label: '' });
    expect(normaliseGroupChat({ url: 4 })).toEqual({ url: '', label: '' });
  });
});

describe('groupChatFor', () => {
  it('is null without a link', () => {
    expect(groupChatFor({ url: '', label: 'Join us' })).toBeNull();
    expect(groupChatFor(undefined)).toBeNull();
  });

  it('names the app on the button unless the host wrote their own text', () => {
    expect(groupChatFor({ url: 'chat.whatsapp.com/AbC', label: '' })).toEqual({
      url: 'https://chat.whatsapp.com/AbC',
      app: 'whatsapp',
      label: 'Join the WhatsApp group',
    });
    expect(
      groupChatFor({ url: 'https://t.me/+x', label: ' Party crew ' })?.label,
    ).toBe('Party crew');
    expect(defaultGroupLabel('other')).toBe('Join the group chat');
  });
});
