import { describe, expect, it } from 'vitest';
import { groupChatHint } from './groupChatHint';

describe('groupChatHint', () => {
  it('says which app it found', () => {
    expect(groupChatHint('chat.whatsapp.com/AbC')).toEqual({
      text: 'WhatsApp link: guests get a WhatsApp button.',
      error: false,
    });
    expect(groupChatHint('https://example.com/g').text).toContain(
      'plain button',
    );
  });

  it('flags a link that will not work, and stays quiet when empty', () => {
    expect(groupChatHint('javascript:alert(1)').error).toBe(true);
    expect(groupChatHint('  ').error).toBe(false);
  });
});
