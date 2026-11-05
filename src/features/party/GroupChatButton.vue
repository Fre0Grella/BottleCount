<script setup lang="ts">
import type { GroupChatDTO } from '../../../shared/groupChat';
import BrandMark from '../../components/ui/BrandMark.vue';
import Icon from '../../components/ui/Icon.vue';

/**
 * The button a confirmed guest taps to join the party's group chat, dressed as
 * the app the link opens: WhatsApp green, Telegram blue, and so on. A link to
 * any other app gets the party's own accent and a chat bubble.
 *
 * The same button in the Plan tab's preview and on the invite page, so the
 * host sees exactly what guests get.
 */
defineProps<{ chat: GroupChatDTO }>();
</script>

<template>
  <a
    class="group-btn"
    :class="`group-btn--${chat.app}`"
    :href="chat.url"
    target="_blank"
    rel="noopener noreferrer"
  >
    <BrandMark v-if="chat.app !== 'other'" :name="chat.app" :size="18" />
    <Icon v-else name="message" :size="17" />
    <span class="group-btn__label">{{ chat.label }}</span>
  </a>
</template>

<style scoped>
/* Each app's own colour (Simple Icons), with the ink that reads on it. Brand
   colours: the same in both themes. */
.group-btn {
  --chat-bg: var(--accent);
  --chat-ink: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 12px 16px;
  border-radius: 999px;
  background: var(--chat-bg);
  color: var(--chat-ink);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition: filter 0.15s ease;
}
.group-btn:hover {
  filter: brightness(1.06);
}
.group-btn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
/* The host's own words: wrapped onto a second line on a phone, never cut. */
.group-btn__label {
  min-width: 0;
  text-align: center;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

/* WhatsApp's green is too light for white text: its own near-black instead. */
.group-btn--whatsapp {
  --chat-bg: #25d366;
  --chat-ink: #0b141a;
}
/* Telegram's blue, with a navy ink for the same reason. */
.group-btn--telegram {
  --chat-bg: #26a5e4;
  --chat-ink: #04243a;
}
.group-btn--discord {
  --chat-bg: #5865f2;
  --chat-ink: #fff;
}
.group-btn--signal {
  --chat-bg: #3b45fd;
  --chat-ink: #fff;
}
.group-btn--messenger {
  --chat-bg: #0866ff;
  --chat-ink: #fff;
}
</style>
