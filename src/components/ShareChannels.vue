<script setup lang="ts">
import { ref, watch } from 'vue';
import { brandedQrDataUrl } from '../lib/qr';
import Icon from './Icon.vue';

/**
 * The ways to pass a link on: Copy, WhatsApp, Email, Messages, Instagram, and a
 * QR code.
 *
 * Deliberately knows nothing about the store. The host's share sheet uses it
 * for their own link, and the guest invite page — which has no account, no
 * store and no IndexedDB — uses it for a guest's forward link. Everything it
 * needs arrives as props.
 */
const props = withDefaults(
  defineProps<{
    /** The link to share, or '' while it is still being created. */
    link: string;
    /** The text that travels with the link; it should contain the link. */
    message: string;
    emailSubject: string;
    /** Title for the system share sheet. */
    shareTitle?: string;
    qrFileName: string;
    /** Added after "Opened WhatsApp" and friends, e.g. " — watch the RSVPs roll in." */
    sentNote?: string;
  }>(),
  { shareTitle: '', sentNote: '.' },
);

/** What the last channel did, in a line — or null before one is used. */
const notice = ref<string | null>(null);
/** Set when copying failed, so the link can be shown to select by hand. */
const copyFailed = ref(false);
const qrDataUrl = ref<string | null>(null);

async function copyLink(then: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.link);
    copyFailed.value = false;
    notice.value = then;
  } catch {
    // Clipboard access can be refused (an insecure origin, a denied
    // permission). Show the link instead so it can be selected by hand.
    copyFailed.value = true;
    notice.value = "Couldn't copy — select the link below instead.";
  }
}

/** Opens another app with the message filled in. */
function openApp(url: string, app: string, newTab = false): void {
  if (newTab) window.open(url, '_blank', 'noopener');
  else window.location.href = url;
  copyFailed.value = false;
  notice.value = `Opened ${app}${props.sentNote}`;
}

interface Channel {
  label: string;
  iconName: string;
  color: string;
  onClick: () => void | Promise<void>;
}

const channels: Channel[] = [
  {
    label: 'Copy link',
    iconName: 'link',
    color: 'var(--accent)',
    onClick: () => copyLink('Link copied — paste it anywhere.'),
  },
  {
    label: 'WhatsApp',
    iconName: 'message',
    color: '#25D366',
    onClick: () =>
      openApp(
        `https://wa.me/?text=${encodeURIComponent(props.message)}`,
        'WhatsApp',
        true,
      ),
  },
  {
    label: 'Email',
    iconName: 'mail',
    color: '#60A5FA',
    onClick: () =>
      openApp(
        `mailto:?subject=${encodeURIComponent(props.emailSubject)}&body=${encodeURIComponent(props.message)}`,
        'your email app',
      ),
  },
  {
    label: 'Messages',
    iconName: 'message',
    color: '#34D399',
    // `sms:?&body=` is the spelling both iOS and Android accept.
    onClick: () =>
      openApp(`sms:?&body=${encodeURIComponent(props.message)}`, 'Messages'),
  },
  {
    label: 'Instagram',
    iconName: 'instagram',
    color: '#E1306C',
    onClick: async () => {
      // Instagram has no link that opens a DM with text in it. On a phone the
      // system share sheet lists it; anywhere else, copy and say where to put it.
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: props.shareTitle,
            text: props.message,
          });
          copyFailed.value = false;
          notice.value = `Shared${props.sentNote}`;
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }
      await copyLink('Link copied — paste it into a DM or your story.');
    },
  },
  {
    label: 'QR code',
    iconName: 'qr',
    color: '#A78BFA',
    onClick: async () => {
      if (qrDataUrl.value) {
        qrDataUrl.value = null;
        return;
      }
      qrDataUrl.value = await brandedQrDataUrl(props.link, 480);
      notice.value = null;
    },
  },
].map((ch) => ({
  ...ch,
  onClick: () => {
    // Nothing to share until the link exists — sharing a blank link is worse
    // than the button doing nothing for the second it takes.
    if (!props.link) return;
    return ch.onClick();
  },
}));

// A QR drawn for one link must not stay on screen as another's.
watch(
  () => props.link,
  () => {
    qrDataUrl.value = null;
    copyFailed.value = false;
  },
);
</script>

<template>
  <div>
    <!-- What the last channel did -->
    <div
      v-if="notice"
      role="status"
      style="
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 11px 13px;
        border-radius: var(--rs);
        background: var(--good-soft);
        border: 1px solid var(--good);
        color: var(--good);
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 12px;
      "
      :style="
        copyFailed
          ? {
              background: 'var(--surface2)',
              borderColor: 'var(--border)',
              color: 'var(--dim)',
            }
          : {}
      "
    >
      <Icon :name="copyFailed ? 'info' : 'check'" :size="16" />
      {{ notice }}
    </div>
    <div
      v-if="copyFailed"
      data-testid="share-link-fallback"
      style="
        font-size: 12px;
        color: var(--text);
        padding: 10px 12px;
        border-radius: var(--rs);
        background: var(--surface2);
        border: 1px solid var(--border);
        margin-bottom: 12px;
        user-select: all;
        overflow-wrap: anywhere;
      "
    >
      {{ link }}
    </div>

    <div
      style="
        font-size: 12px;
        color: var(--dim);
        font-weight: 600;
        margin-bottom: 9px;
      "
    >
      Share via
    </div>
    <div
      style="
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 9px;
        margin-bottom: 16px;
      "
    >
      <button
        v-for="ch in channels"
        :key="ch.label"
        type="button"
        :disabled="!link"
        style="
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          padding: 14px 6px;
          border-radius: var(--rs);
          border: 1.5px solid var(--border);
          background: var(--surface2);
          color: var(--text);
          font-family: inherit;
        "
        :style="{ opacity: link ? 1 : 0.5 }"
        @click="ch.onClick"
      >
        <span
          style="
            display: flex;
            width: 38px;
            height: 38px;
            border-radius: 11px;
            align-items: center;
            justify-content: center;
          "
          :style="{
            background: ch.color + '22',
            color: ch.color,
          }"
        >
          <Icon :name="ch.iconName" :size="18" />
        </span>
        <span style="font-size: 11px; font-weight: 600">{{ ch.label }}</span>
      </button>
    </div>

    <!-- QR code, for a poster or a phone held up at the bar -->
    <div
      v-if="qrDataUrl"
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 14px;
        border-radius: var(--rs);
        border: 1px solid var(--border);
        background: var(--surface2);
        margin-bottom: 16px;
      "
    >
      <img
        :src="qrDataUrl"
        alt="QR code for the link"
        width="200"
        height="200"
        style="border-radius: 8px; background: #fff"
      />
      <a
        :href="qrDataUrl"
        :download="qrFileName"
        style="
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
        "
      >
        <Icon name="download" :size="13" />
        Download PNG
      </a>
    </div>
  </div>
</template>
