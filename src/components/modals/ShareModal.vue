<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { useStore, COVERS } from '../../lib/store';
import Modal from '../Modal.vue';
import Icon from '../Icon.vue';
import { inviteUrl } from '../../../shared/invites';

const store = useStore();

/** What the last channel did, in a line — or null before one is used. */
const notice = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);

const party = computed(() => store.activeParty());

const cover = computed(() => {
  const p = party.value;
  if (!p) return COVERS[0];
  return COVERS[p.cover] ?? COVERS[0];
});

/**
 * The host's own link, or '' until the party has been published.
 *
 * The slug is the server's, not one derived from the party name: renaming the
 * party must not change a link already sent, and only the server knows which
 * slug it handed out. `openShare` publishes on open, so this fills in a moment
 * after the sheet appears — `publishing` covers the gap.
 */
const publication = computed(() => party.value?.publication ?? null);

const inviteLink = computed(() => {
  const pub = publication.value;
  if (!pub) return '';
  // `window` is always there: the whole app mounts under `client:only`, so this
  // never renders on the server. Reading the live origin is also what makes a
  // preview deployment and a self-hosted domain each hand out links that point
  // back at themselves — scheme included, so `http://localhost` works too.
  return inviteUrl(
    window.location.origin,
    import.meta.env.BASE_URL as string,
    pub.slug,
    pub.rootToken,
  );
});

/** The link as the card shows it: without the scheme, which nobody reads. */
const inviteLinkLabel = computed(() =>
  inviteLink.value.replace(/^https?:\/\//, ''),
);

const publishing = computed(() => store.state.publishing);
const publishFailed = computed(
  () => !publishing.value && !publication.value && store.state.publishError,
);

const venueWhere = computed(() => {
  const p = party.value;
  if (!p) return '';
  const parts = [p.venue.place, p.venue.city].filter(Boolean);
  return parts.join(', ') || 'TBD';
});

const partyDateShort = computed(() => {
  const p = party.value;
  if (!p) return '';
  return new Date(p.date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
});

const allowForward = computed(() => party.value?.allowForward ?? false);

const shareHint = computed(() =>
  allowForward.value
    ? 'Friends-of-friends will show up in your spread view.'
    : 'Only people you invite directly can RSVP.',
);

/** The words that travel with the link in a message or an email. */
const message = computed(() => {
  const p = party.value;
  if (!p) return inviteLink.value;
  const where = venueWhere.value === 'TBD' ? '' : ` at ${venueWhere.value}`;
  return `You're invited to ${p.name} — ${partyDateShort.value}${where}. Let me know if you're coming: ${inviteLink.value}`;
});

async function copyLink(then: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    notice.value = then;
  } catch {
    // Clipboard access can be refused (an insecure origin, a denied
    // permission). The link is on the card, so point there instead.
    notice.value = "Couldn't copy — select the link on the card instead.";
  }
}

/** Opens another app with the invite filled in. */
function handOff(url: string, app: string): void {
  window.open(url, '_blank', 'noopener');
  notice.value = `Opened ${app} — watch the RSVPs roll in.`;
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
      handOff(
        `https://wa.me/?text=${encodeURIComponent(message.value)}`,
        'WhatsApp',
      ),
  },
  {
    label: 'Email',
    iconName: 'mail',
    color: '#60A5FA',
    onClick: () => {
      const subject = `You're invited: ${party.value?.name ?? 'a party'}`;
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.value)}`;
      notice.value = 'Opened your email app — watch the RSVPs roll in.';
    },
  },
  {
    label: 'Messages',
    iconName: 'message',
    color: '#34D399',
    onClick: () => {
      // `sms:?&body=` is the spelling both iOS and Android accept.
      window.location.href = `sms:?&body=${encodeURIComponent(message.value)}`;
      notice.value = 'Opened Messages — watch the RSVPs roll in.';
    },
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
            title: party.value?.name,
            text: message.value,
          });
          notice.value = 'Shared — watch the RSVPs roll in.';
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
      qrDataUrl.value = await QRCode.toDataURL(inviteLink.value, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      notice.value = null;
    },
  },
].map((ch) => ({
  ...ch,
  onClick: () => {
    // Nothing to share until the party is published — sharing a blank link is
    // worse than the button doing nothing for the second it takes.
    if (!inviteLink.value) return;
    return ch.onClick();
  },
}));

const qrFileName = computed(
  () =>
    `${(party.value?.name ?? 'party').replace(/[^\w-]+/g, '-').toLowerCase()}-invite.png`,
);

function reset(): void {
  notice.value = null;
  qrDataUrl.value = null;
}

function handleClose() {
  reset();
  store.closeShare();
}

watch(
  () => store.state.shareOpen,
  (open) => {
    if (!open) reset();
  },
);

// A link minted for another party must not stay on screen as this one's.
watch(inviteLink, () => (qrDataUrl.value = null));
</script>

<template>
  <Modal
    :open="store.state.shareOpen"
    variant="sheet"
    max-width="460px"
    @close="handleClose"
  >
    <div style="padding: 22px">
      <!-- Header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        "
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 10px;
            align-items: center;
            justify-content: center;
            background: var(--accent-soft);
            color: var(--accent);
          "
        >
          <Icon name="share" :size="18" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 17px;
          "
        >
          Invite to {{ party?.name ?? '' }}
        </div>
        <button
          style="
            margin-left: auto;
            cursor: pointer;
            display: flex;
            width: 32px;
            height: 32px;
            align-items: center;
            justify-content: center;
            border: none;
            background: transparent;
            color: var(--dim);
          "
          @click="handleClose"
        >
          <Icon name="x" :size="18" />
        </button>
      </div>

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
          margin-bottom: 14px;
        "
      >
        <Icon name="check" :size="16" />
        {{ notice }}
      </div>

      <!-- Preview card -->
      <div
        style="
          border-radius: var(--rs);
          overflow: hidden;
          border: 1px solid var(--border);
          margin-bottom: 16px;
        "
      >
        <div
          style="
            height: 74px;
            display: flex;
            align-items: flex-end;
            padding: 10px;
          "
          :style="{ background: cover.grad }"
        >
          <span style="font-size: 24px">{{ cover.emoji }}</span>
        </div>
        <div style="padding: 12px 14px; background: var(--surface2)">
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 700;
              font-size: 15px;
            "
          >
            {{ party?.name ?? '' }}
          </div>
          <div style="font-size: 12px; color: var(--dim); margin-top: 2px">
            {{ venueWhere }} · {{ partyDateShort }}
          </div>
          <div
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              color: var(--faint);
              margin-top: 8px;
            "
          >
            <Icon name="link" :size="12" />
            <span v-if="publishing">Creating your link…</span>
            <span v-else-if="publishFailed" style="color: var(--bad)">
              Couldn't reach the server — try again in a moment.
            </span>
            <span
              v-else
              style="user-select: all; overflow-wrap: anywhere"
              data-testid="invite-link"
              >{{ inviteLinkLabel }}</span
            >
          </div>
        </div>
      </div>

      <!-- Share via -->
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
          "
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
          alt="QR code for the invite link"
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

      <!-- Allow forward toggle -->
      <div
        style="
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          border-radius: var(--rs);
          background: var(--surface2);
        "
        :style="{
          border: `1px solid ${allowForward ? 'var(--accent)' : 'var(--border)'}`,
        }"
        @click="store.update((p) => (p.allowForward = !p.allowForward))"
      >
        <span
          style="
            display: flex;
            width: 34px;
            height: 34px;
            border-radius: 9px;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          "
          :style="{
            background: allowForward ? 'var(--accent-soft)' : 'var(--track)',
            color: allowForward ? 'var(--accent)' : 'var(--faint)',
          }"
        >
          <Icon name="share" :size="16" />
        </span>
        <div style="flex: 1">
          <div style="font-size: 13px; font-weight: 600">
            Let guests invite friends
          </div>
          <div style="font-size: 11px; color: var(--faint)">
            Your invite gets a "+ bring a friend" button
          </div>
        </div>
        <!-- Toggle switch -->
        <span
          style="
            display: flex;
            align-items: center;
            width: 42px;
            height: 24px;
            border-radius: 999px;
            padding: 3px;
            transition: background 0.2s;
            flex-shrink: 0;
          "
          :style="{
            background: allowForward ? 'var(--accent)' : 'var(--track)',
          }"
        >
          <span
            style="
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #fff;
              transition: transform 0.2s;
            "
            :style="{
              transform: allowForward ? 'translateX(18px)' : 'translateX(0)',
            }"
          />
        </span>
      </div>

      <!-- Footer hint -->
      <div
        style="
          font-size: 11px;
          color: var(--faint);
          text-align: center;
          margin-top: 12px;
        "
      >
        {{ shareHint }}
      </div>
    </div>
  </Modal>
</template>
