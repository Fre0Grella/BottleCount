<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { isPaidParty } from '../../../shared/payments';
import { ticketState } from '../../../shared/tickets';
import { venueFeeFor, venueFeePerPerson } from '../../lib/core';
import { mailtoUrl, whatsappUrl } from '../../lib/sendLinks';
import {
  sendRoute,
  signedTicketLink,
  ticketEmailSubject,
  ticketMessage,
} from '../../lib/ticketMessage';
import type { Invite } from '../../lib/types';
import { useStore } from '../../store/store';
import { formatClockTime } from '../../lib/dates';
import { segColor } from '../../lib/display';
import Icon from '../../components/ui/Icon.vue';
import ProLock from '../account/ProLock.vue';
import type { InviteStatus } from '../../lib/types';

const store = useStore();

const guestSearch = ref('');

const party = computed(() => store.activeParty());
const invites = computed(() => party.value?.invites ?? []);
const filteredInvites = computed(() => {
  const q = guestSearch.value.trim().toLowerCase();
  if (!q) return invites.value;
  return invites.value.filter((i) => i.name.toLowerCase().includes(q));
});

const confirmed = computed(() =>
  invites.value.filter((i) => i.status === 'confirmed'),
);
const checkedIn = computed(() => confirmed.value.filter((i) => i.used).length);

/**
 * Whether guests pay for this party — a price and a way to pay the host. The
 * same test the invite page uses to ask for an email, so "paid" only appears
 * where guests were actually asked for money.
 */
const paidParty = computed(() => isPaidParty(party.value));
/** Coming, but no ticket until they have paid. */
function unpaid(inv: Invite): boolean {
  return ticketState(inv, party.value) === 'unpaid';
}

/**
 * Marks a guest as paid and, since the ticket is what they paid for, starts
 * sending it: straight into WhatsApp or the mail app when they left only one
 * way to reach them, the Send sheet otherwise. Un-marking only un-marks.
 *
 * Paid is set on this device first (see `setInvitePaid`), which is what lets
 * the ticket be made at all. The WhatsApp tab is opened here, inside the tap,
 * and pointed at the chat once the ticket is signed — opened after the await,
 * a popup blocker would swallow it.
 */
async function togglePaid(inv: Invite): Promise<void> {
  if (inv.paidAt) {
    void store.setInvitePaid(inv.id, false);
    return;
  }

  const route = sendRoute(inv);
  const tab = route === 'whatsapp' ? window.open('', '_blank') : null;
  const marked = store.setInvitePaid(inv.id, true);

  if (route === 'sheet') {
    store.openSendTicket(inv.id);
    await marked;
    return;
  }

  const p = party.value;
  try {
    if (!p) throw new Error('no party');
    const link = await signedTicketLink(p, inv.id);
    const message = ticketMessage(p, inv.name, link);
    if (route === 'whatsapp') {
      const url = whatsappUrl(message, inv.phone);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } else {
      window.location.href = mailtoUrl(
        ticketEmailSubject(p),
        message,
        inv.email,
      );
    }
  } catch {
    // No ticket to send: close the blank tab rather than leave it behind. The
    // guest stays marked paid, and the Send button is there to try again.
    tab?.close();
  }
  await marked;
}

const paidCount = computed(
  () => confirmed.value.filter((i) => i.paidAt).length,
);
/**
 * What the venue's per-person fee comes to for the guests the host is bringing.
 *
 * The Plan tab's figure is for the expected count. This one is what the host
 * commits to: on a party guests pay for, everyone marked as paid — a paid guest
 * who then stays home still counts, because the host told the venue a number
 * and pays for it. A free party has no paid marks, so it counts who is coming.
 */
const venueFee = computed(() => {
  const p = party.value;
  if (!p) return null;
  const fee = venueFeePerPerson(p.settings);
  if (fee === 0) return null;
  const guests = paidParty.value ? paidCount.value : confirmed.value.length;
  return {
    guests,
    who: paidParty.value ? 'paid' : 'coming',
    fee,
    total: venueFeeFor(p.settings, guests),
  };
});

const paidW = computed(() =>
  confirmed.value.length
    ? `${Math.min(100, (paidCount.value / confirmed.value.length) * 100)}%`
    : '0%',
);
// Opened the link and stopped there. The funnel's "maybe" column — not people
// the host invited and is waiting on, but people who looked and did not answer.
const opened = computed(() =>
  invites.value.filter((i) => i.status === 'opened'),
);
const declined = computed(() =>
  invites.value.filter((i) => i.status === 'declined'),
);
const direct = computed(() => invites.value.filter((i) => i.depth === 0));
const viral = computed(() => invites.value.filter((i) => i.depth > 0));

const capacity = computed(() => party.value?.settings.guests ?? 1);

// Optional hard cap. When set, the funnel scales to the cap and a marker shows
// where the expected headcount sits.
const hasMax = computed(() => party.value?.settings.max_capacity != null);
const maxCap = computed(
  () => party.value?.settings.max_capacity ?? capacity.value,
);
const barScale = computed(() => (hasMax.value ? maxCap.value : capacity.value));

// Confirmed guests up to the expected headcount (healthy / green).
const confirmedWithinW = computed(() => {
  const within = Math.min(confirmed.value.length, capacity.value);
  return `${Math.min(100, (within / barScale.value) * 100)}%`;
});
// Confirmed guests beyond expected but under the cap (accent / filling up).
const confirmedOverW = computed(() => {
  if (!hasMax.value) return '0%';
  const over = Math.max(
    0,
    Math.min(confirmed.value.length, maxCap.value) - capacity.value,
  );
  return `${Math.min(100, (over / barScale.value) * 100)}%`;
});
const openedW = computed(() => {
  const usedPct =
    (Math.min(confirmed.value.length, barScale.value) / barScale.value) * 100;
  const pct = (opened.value.length / barScale.value) * 100;
  return `${Math.max(0, Math.min(pct, 100 - usedPct))}%`;
});
// Position of the "expected headcount" marker along the capped bar.
const expectedMarkerLeft = computed(
  () => `${Math.min(100, (capacity.value / barScale.value) * 100)}%`,
);

const checkInW = computed(() =>
  confirmed.value.length
    ? `${Math.min(100, (checkedIn.value / confirmed.value.length) * 100)}%`
    : '0%',
);

const spreadFactor = computed(() => {
  const total = invites.value.length;
  const d = Math.max(1, direct.value.length);
  return (total / d).toFixed(1) + '×';
});

function avatarOpacity(status: InviteStatus) {
  if (status === 'confirmed') return 1;
  if (status === 'opened') return 0.55;
  return 0.35;
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Someone who opened the link and has not answered has not told anyone who
 * they are — the name only arrives with the answer. They are still a row,
 * because that is what "Reached" and "Maybe" count, so give them a label
 * rather than an empty line.
 */
function isNameless(inv: { name: string }) {
  return inv.name.trim() === '';
}

function referrerFirst(referrer: string | null) {
  if (!referrer) return '';
  return referrer.trim().split(' ')[0];
}

function addGuest() {
  store.openAddGuest();
}

const isPhone = computed(() => store.state.device === 'phone');

// ── Live funnel ────────────────────────────────────────────────────────────

// Guests answer while the host is looking, so the open party's session polls
// the funnel (lib/partySession.ts). Opening this tab asks once more on top, so
// the list is fresh now rather than at the next poll.
onMounted(() => void store.syncFunnel());

const published = computed(() => party.value?.publication != null);

const lastSyncedLabel = computed(() => {
  const iso = store.state.funnelSyncedAt;
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
});
</script>

<template>
  <div
    style="
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 32px;
      animation: bcFadeUp 0.3s ease both;
    "
  >
    <!--
      The funnel and the spread view both count people who arrived through an
      invite link. On the free tier no such link exists, so there is nothing
      for them to measure — they are gated together for that reason, not as an
      arbitrary split.
    -->
    <ProLock
      feature="rsvpFunnel"
      title="RSVP funnel and spread view"
      blurb="See who replied, who is still a maybe, and how far the invite travelled."
    >
      <!-- ── RSVP Funnel card ── -->
      <div
        style="
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 20px;
        "
      >
        <!-- header -->
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
            <Icon name="users" :size="17" />
          </span>
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 600;
              font-size: 16px;
            "
          >
            RSVP funnel
          </div>

          <!--
            Only shown once the link is live. Before that the numbers are all
            zero and a "last updated" stamp would suggest the page is waiting
            for something that is never coming.
          -->
          <span
            v-if="published && lastSyncedLabel"
            style="
              margin-left: auto;
              display: flex;
              align-items: center;
              gap: 5px;
              font-size: 10.5px;
              color: var(--faint);
            "
          >
            <span
              style="
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: var(--good);
              "
              :style="{ opacity: store.state.funnelSyncing ? 0.4 : 1 }"
            ></span>
            Live · {{ lastSyncedLabel }}
          </span>

          <button
            style="
              margin-left: auto;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 7px;
              font-size: 13px;
              font-weight: 700;
              padding: 9px 16px;
              border-radius: 999px;
              border: none;
              background: var(--accent);
              color: var(--on-accent);
              min-height: 40px;
            "
            :style="{ marginLeft: published && lastSyncedLabel ? '0' : 'auto' }"
            @click="store.openShare()"
          >
            <span style="display: flex"><Icon name="share" :size="14" /></span>
            Send invite
          </button>
        </div>

        <!-- explanation -->
        <div
          style="
            font-size: 11.5px;
            color: var(--dim);
            line-height: 1.55;
            margin-bottom: 13px;
          "
        >
          <template v-if="published">
            Your link is live. Anyone who opens it RSVPs
            <strong style="color: var(--text); font-weight: 600"
              >with their own name</strong
            >
            and lands in the guest list below — including the ones who look and
            never answer, which is what <em>Reached</em> counts.
          </template>
          <template v-else>
            Hit
            <strong style="color: var(--text); font-weight: 600"
              >Send invite</strong
            >
            to create your link. Anyone who opens it RSVPs with their own name
            and lands in the guest list below. You never type them in.
          </template>
        </div>

        <!-- stat boxes: 2×2 on phone, 1×4 on desktop -->
        <div
          style="gap: 10px; margin-bottom: 16px"
          :style="{
            display: 'grid',
            gridTemplateColumns: isPhone ? '1fr 1fr' : '1fr 1fr 1fr 1fr',
          }"
        >
          <!-- Reached -->
          <div
            style="
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px 13px;
            "
          >
            <div style="display: flex; align-items: center; gap: 6px">
              <span style="display: flex; color: var(--dim)"
                ><Icon name="users" :size="13"
              /></span>
              <span
                style="
                  font-size: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.06em;
                  color: var(--faint);
                "
                >Reached</span
              >
            </div>
            <div
              style="
                margin-top: 5px;
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 22px;
                color: var(--text);
              "
            >
              {{ invites.length }}
            </div>
          </div>

          <!-- Confirmed -->
          <div
            style="
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px 13px;
            "
          >
            <div style="display: flex; align-items: center; gap: 6px">
              <span style="display: flex; color: var(--good)"
                ><Icon name="check" :size="13"
              /></span>
              <span
                style="
                  font-size: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.06em;
                  color: var(--faint);
                "
                >Confirmed</span
              >
            </div>
            <div
              style="
                margin-top: 5px;
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 22px;
                color: var(--good);
              "
            >
              {{ confirmed.length }}
            </div>
          </div>

          <!-- Maybe -->
          <div
            style="
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px 13px;
            "
          >
            <div style="display: flex; align-items: center; gap: 6px">
              <span style="display: flex; color: var(--dim)"
                ><Icon name="hourglass" :size="13"
              /></span>
              <span
                style="
                  font-size: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.06em;
                  color: var(--faint);
                "
                >Maybe</span
              >
            </div>
            <div
              style="
                margin-top: 5px;
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 22px;
                color: var(--text);
              "
            >
              {{ opened.length }}
            </div>
          </div>

          <!-- Declined -->
          <div
            style="
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px 13px;
            "
          >
            <div style="display: flex; align-items: center; gap: 6px">
              <span style="display: flex; color: var(--faint)"
                ><Icon name="x" :size="13"
              /></span>
              <span
                style="
                  font-size: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.06em;
                  color: var(--faint);
                "
                >Declined</span
              >
            </div>
            <div
              style="
                margin-top: 5px;
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 22px;
                color: var(--faint);
              "
            >
              {{ declined.length }}
            </div>
          </div>
        </div>

        <!-- funnel bar -->
        <div style="font-size: 11px; color: var(--faint); margin-bottom: 7px">
          <template v-if="hasMax">
            Filling {{ capacity }} expected toward a {{ maxCap }} cap — green is
            on target, amber is past expected
          </template>
          <template v-else>
            Against {{ capacity }} capacity — solid is confirmed, faded is still
            maybe
          </template>
        </div>
        <div
          style="
            position: relative;
            display: flex;
            height: 14px;
            border-radius: 999px;
            overflow: hidden;
            background: var(--track);
          "
        >
          <!-- confirmed, within expected -->
          <div
            :style="{ width: confirmedWithinW, background: 'var(--good)' }"
          ></div>
          <!-- confirmed, past expected but under cap -->
          <div
            v-if="hasMax"
            :style="{ width: confirmedOverW, background: 'var(--accent)' }"
          ></div>
          <!-- still maybe -->
          <div
            :style="{
              width: openedW,
              background: hasMax ? 'var(--accent)' : 'var(--good)',
              opacity: '0.32',
            }"
          ></div>
          <!-- expected-headcount marker (only when a cap is set) -->
          <div
            v-if="hasMax"
            :style="{ left: expectedMarkerLeft }"
            style="
              position: absolute;
              top: -2px;
              bottom: -2px;
              width: 2px;
              background: var(--text);
              opacity: 0.55;
              transform: translateX(-1px);
            "
          ></div>
        </div>
        <div
          style="
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-top: 6px;
          "
        >
          <span style="font-size: 11px; color: var(--dim); font-weight: 600">
            {{ confirmed.length }}/{{ hasMax ? maxCap : capacity }}
            {{ hasMax ? 'to cap' : '' }}
          </span>
          <span v-if="hasMax" style="font-size: 11px; color: var(--faint)">
            {{ capacity }} expected
          </span>
        </div>
      </div>

      <!-- ── Spread card ── -->
      <div
        style="
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 20px;
        "
      >
        <!-- header -->
        <div
          style="
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 4px;
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
            <Icon name="share" :size="17" />
          </span>
          <div>
            <div
              style="
                font-family: var(--font-disp);
                font-weight: 600;
                font-size: 16px;
              "
            >
              How far the word spread
            </div>
            <div style="font-size: 11px; color: var(--faint)">
              guests inviting their own friends
            </div>
          </div>
          <!-- spread factor top-right -->
          <div style="margin-left: auto; text-align: right">
            <div
              style="
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 20px;
                color: var(--accent);
              "
            >
              {{ spreadFactor }}
            </div>
            <div
              style="
                font-size: 10px;
                color: var(--faint);
                text-transform: uppercase;
                letter-spacing: 0.05em;
              "
            >
              spread factor
            </div>
          </div>
        </div>

        <!-- tier boxes -->
        <div
          style="
            display: flex;
            align-items: stretch;
            gap: 8px;
            margin-top: 14px;
          "
        >
          <!-- You -->
          <div
            style="
              flex: 1;
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px;
              text-align: center;
            "
          >
            <div
              style="display: flex; justify-content: center; margin-bottom: 8px"
            >
              <span
                style="
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 26px;
                  height: 26px;
                  border-radius: 50%;
                  background: var(--accent);
                  color: #fff;
                  font-size: 12px;
                "
                >★</span
              >
            </div>
            <div
              style="
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 20px;
                color: var(--accent);
              "
            >
              1
            </div>
            <div style="font-size: 10.5px; color: var(--dim); font-weight: 600">
              You
            </div>
            <div style="font-size: 9.5px; color: var(--faint); margin-top: 1px">
              the host
            </div>
          </div>

          <!-- Direct invites -->
          <div
            style="
              flex: 1;
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px;
              text-align: center;
            "
          >
            <div
              style="
                display: flex;
                justify-content: center;
                margin-bottom: 8px;
                min-height: 26px;
              "
            >
              <template v-for="(inv, idx) in direct.slice(0, 4)" :key="inv.id">
                <span
                  style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 26px;
                    height: 26px;
                    border-radius: 50%;
                    color: #fff;
                    font-size: 10px;
                    font-weight: 700;
                    border: 2px solid var(--surface2);
                  "
                  :style="{
                    background: segColor(inv.id),
                    marginLeft: idx === 0 ? '0' : '-8px',
                    opacity: String(avatarOpacity(inv.status)),
                  }"
                  >{{ initial(inv.name) }}</span
                >
              </template>
            </div>
            <div
              style="
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 20px;
                color: var(--text);
              "
            >
              {{ direct.length }}
            </div>
            <div style="font-size: 10.5px; color: var(--dim); font-weight: 600">
              Direct invites
            </div>
            <div style="font-size: 9.5px; color: var(--faint); margin-top: 1px">
              invited by you
            </div>
          </div>

          <!-- Friends of friends -->
          <div
            style="
              flex: 1;
              background: var(--surface2);
              border-radius: var(--rs);
              padding: 12px;
              text-align: center;
            "
          >
            <div
              style="
                display: flex;
                justify-content: center;
                margin-bottom: 8px;
                min-height: 26px;
              "
            >
              <template v-for="(inv, idx) in viral.slice(0, 4)" :key="inv.id">
                <span
                  style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 26px;
                    height: 26px;
                    border-radius: 50%;
                    color: #fff;
                    font-size: 10px;
                    font-weight: 700;
                    border: 2px solid var(--surface2);
                  "
                  :style="{
                    background: segColor(inv.id),
                    marginLeft: idx === 0 ? '0' : '-8px',
                    opacity: String(avatarOpacity(inv.status)),
                  }"
                  >{{ initial(inv.name) }}</span
                >
              </template>
            </div>
            <div
              style="
                font-family: var(--font-disp);
                font-weight: 700;
                font-size: 20px;
                color: var(--text);
              "
            >
              {{ viral.length }}
            </div>
            <div style="font-size: 10.5px; color: var(--dim); font-weight: 600">
              Friends-of-friends
            </div>
            <div style="font-size: 9.5px; color: var(--faint); margin-top: 1px">
              forwarded by guests
            </div>
          </div>
        </div>

        <!-- explanation text -->
        <div
          style="
            font-size: 11px;
            color: var(--faint);
            line-height: 1.55;
            margin-top: 13px;
          "
        >
          With
          <strong style="color: var(--dim); font-weight: 600"
            >"let guests invite friends"</strong
          >
          on, your guests can forward the invite to their own friends — anyone
          they bring lands in this tier.
        </div>
      </div>
    </ProLock>

    <!-- ── Guest list card ── -->
    <div
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: 20px;
      "
    >
      <!-- header -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        "
      >
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 15px;
          "
        >
          Guest list
        </div>
        <button
          style="
            margin-left: auto;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 700;
            padding: 8px 14px;
            border-radius: 999px;
            border: 1px solid var(--accent);
            background: transparent;
            color: var(--accent);
            min-height: 36px;
          "
          @click="store.openDoor()"
        >
          <span style="display: flex"><Icon name="scan" :size="14" /></span>
          Door mode
        </button>
      </div>

      <!-- checked-in progress bar -->
      <div style="margin-bottom: 14px">
        <div
          style="
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 6px;
          "
        >
          <span
            style="
              display: flex;
              align-items: center;
              gap: 5px;
              font-size: 11px;
              font-weight: 600;
              color: var(--dim);
            "
          >
            <span style="display: flex; color: var(--good)"
              ><Icon name="check" :size="12"
            /></span>
            Checked in
          </span>
          <span style="font-size: 11px; font-weight: 700; color: var(--good)">
            {{ checkedIn }}/{{ confirmed.length }}
          </span>
        </div>
        <div
          style="
            height: 8px;
            border-radius: 999px;
            background: var(--track);
            overflow: hidden;
          "
        >
          <div
            :style="{ width: checkInW }"
            style="
              height: 100%;
              border-radius: 999px;
              background: var(--good);
              transition: width 0.25s ease;
            "
          ></div>
        </div>
      </div>

      <!-- paid progress bar, for a party guests pay for -->
      <div v-if="paidParty" style="margin: -4px 0 14px">
        <div
          style="
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 6px;
          "
        >
          <span
            style="
              display: flex;
              align-items: center;
              gap: 5px;
              font-size: 11px;
              font-weight: 600;
              color: var(--dim);
            "
          >
            <span style="display: flex; color: var(--accent)"
              ><Icon name="euro" :size="12"
            /></span>
            Paid
          </span>
          <span
            style="font-size: 11px; font-weight: 700; color: var(--accent)"
            data-test="paid-count"
          >
            {{ paidCount }}/{{ confirmed.length }}
            <span
              v-if="confirmed.length > paidCount"
              style="font-weight: 500; color: var(--faint)"
            >
              · {{ confirmed.length - paidCount }} to pay
            </span>
          </span>
        </div>
        <div
          style="
            height: 8px;
            border-radius: 999px;
            background: var(--track);
            overflow: hidden;
          "
        >
          <div
            :style="{ width: paidW }"
            style="
              height: 100%;
              border-radius: 999px;
              background: var(--accent);
              transition: width 0.25s ease;
            "
          ></div>
        </div>
      </div>

      <!-- What the venue's per-head fee comes to for the guests counted. -->
      <div
        v-if="venueFee"
        data-test="venue-fee"
        style="margin: -4px 0 14px; font-size: 11px; color: var(--faint)"
      >
        Venue fee: {{ venueFee.guests }} {{ venueFee.who }} × €{{
          venueFee.fee
        }}
        =
        <strong style="color: var(--dim)">€{{ venueFee.total }}</strong>
      </div>

      <!-- add row -->
      <div style="display: flex; gap: 8px; margin-bottom: 6px">
        <input
          v-model="guestSearch"
          placeholder="Search guests…"
          style="
            flex: 1;
            font-size: 14px;
            padding: 11px 13px;
            border-radius: var(--rs);
            border: 1px solid var(--border);
            background: var(--surface2);
            color: var(--text);
            min-width: 0;
            font-family: inherit;
          "
          @keydown.escape="guestSearch = ''"
        />
        <button
          style="
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 700;
            padding: 0 16px;
            border-radius: var(--rs);
            border: 1.5px solid var(--accent);
            background: transparent;
            color: var(--accent);
            min-height: 44px;
          "
          @click="addGuest"
        >
          <span style="display: flex"><Icon name="plus" :size="14" /></span>
          Add
        </button>
      </div>

      <!-- invite rows -->
      <div style="display: flex; flex-direction: column">
        <div
          v-for="inv in filteredInvites"
          :key="inv.id"
          style="
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 2px;
            border-top: 1px solid var(--border);
            min-height: 56px;
          "
          :style="{ opacity: inv.status === 'declined' ? '0.6' : '1' }"
        >
          <!-- avatar -->
          <span
            style="
              display: flex;
              flex-shrink: 0;
              width: 34px;
              height: 34px;
              border-radius: 50%;
              color: #fff;
              align-items: center;
              justify-content: center;
              font-size: 13px;
              font-weight: 700;
            "
            :style="{
              background: segColor(inv.id),
              opacity:
                inv.status === 'confirmed'
                  ? '1'
                  : inv.status === 'opened'
                    ? '0.7'
                    : '0.45',
            }"
          >
            {{ initial(inv.name) }}
          </span>

          <!-- name + status -->
          <div style="min-width: 0; flex: 1">
            <div style="display: flex; align-items: center; gap: 7px">
              <span
                style="
                  font-size: 14px;
                  font-weight: 600;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                "
                :style="
                  isNameless(inv)
                    ? {
                        fontStyle: 'italic',
                        fontWeight: 500,
                        color: 'var(--dim)',
                      }
                    : {}
                "
                >{{ isNameless(inv) ? 'Opened the link' : inv.name }}</span
              >
              <!-- viral badge -->
              <span
                v-if="inv.depth > 0 && inv.referrer"
                style="
                  display: flex;
                  align-items: center;
                  gap: 3px;
                  font-size: 9px;
                  font-weight: 600;
                  padding: 2px 6px;
                  border-radius: 999px;
                  background: var(--accent-soft);
                  color: var(--accent);
                  flex-shrink: 0;
                "
              >
                <span style="display: flex"
                  ><Icon name="share" :size="9"
                /></span>
                via {{ referrerFirst(inv.referrer) }}
              </span>
            </div>

            <!-- status line -->
            <div
              v-if="inv.used && inv.status === 'confirmed'"
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--good);
                font-weight: 600;
                margin-top: 1px;
              "
            >
              <span style="display: flex"
                ><Icon name="check" :size="11"
              /></span>
              Checked in · {{ formatClockTime(inv.usedAt) }}
            </div>
            <div
              v-else-if="inv.status === 'confirmed'"
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--good);
                font-weight: 600;
                margin-top: 1px;
              "
            >
              <span style="display: flex"
                ><Icon name="check" :size="11"
              /></span>
              Coming
              <span v-if="paidParty && inv.paidAt" style="color: var(--accent)">
                · Paid
              </span>
            </div>
            <div
              v-else-if="inv.status === 'opened'"
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--dim);
                font-weight: 600;
                margin-top: 1px;
              "
            >
              <span style="display: flex"
                ><Icon name="hourglass" :size="11"
              /></span>
              Maybe
            </div>
            <div
              v-else-if="inv.status === 'declined'"
              style="
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--faint);
                font-weight: 600;
                margin-top: 1px;
              "
            >
              <span style="display: flex"><Icon name="x" :size="11" /></span>
              Can't make it
            </div>

            <!--
              Where to send their ticket. Organisers only: the invite page
              never shows it, not even to the guest it belongs to.
            -->
            <div
              v-if="inv.email || inv.phone"
              style="
                font-size: 11px;
                color: var(--faint);
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              "
            >
              {{ [inv.email, inv.phone].filter(Boolean).join(' · ') }}
            </div>
            <div
              v-else-if="paidParty && inv.status === 'confirmed'"
              style="font-size: 11px; color: var(--faint); margin-top: 2px"
            >
              No email or phone yet
            </div>
            <button
              v-if="inv.source === 'manual'"
              style="
                cursor: pointer;
                padding: 0;
                margin-top: 2px;
                border: none;
                background: none;
                font-size: 11px;
                font-weight: 600;
                color: var(--accent);
              "
              @click="store.openGuestContact(inv.id)"
            >
              {{
                inv.email || inv.phone ? 'Edit contact' : 'Add email or phone'
              }}
            </button>
          </div>

          <!-- action buttons -->
          <div style="display: flex; gap: 6px; flex-shrink: 0">
            <!--
              opened, no answer: the host can answer on their behalf — but only
              for someone with a name, since a confirmed guest gets a ticket
              made out to them.
            -->
            <template v-if="inv.status === 'opened'">
              <button
                v-if="!isNameless(inv)"
                style="
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  font-size: 12px;
                  font-weight: 600;
                  padding: 8px 11px;
                  border-radius: 999px;
                  border: 1px solid var(--good);
                  background: var(--good-soft);
                  color: var(--good);
                  min-height: 36px;
                "
                @click="store.setInviteStatus(inv.id, 'confirmed')"
              >
                <span style="display: flex"
                  ><Icon name="check" :size="13"
                /></span>
                <span v-if="!isPhone">Accept</span>
              </button>
              <button
                style="
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  font-size: 12px;
                  font-weight: 600;
                  padding: 8px 11px;
                  border-radius: 999px;
                  border: 1px solid var(--border);
                  background: transparent;
                  color: var(--faint);
                  min-height: 36px;
                "
                @click="store.setInviteStatus(inv.id, 'declined')"
              >
                <span style="display: flex"><Icon name="x" :size="13" /></span>
                <span v-if="!isPhone">Decline</span>
              </button>
            </template>

            <!-- confirmed: Paid (when guests pay) + Ticket + Send -->
            <template v-else-if="inv.status === 'confirmed'">
              <button
                v-if="paidParty"
                :aria-pressed="!!inv.paidAt"
                :title="inv.paidAt ? 'Paid — tap to undo' : 'Mark as paid'"
                style="
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  font-size: 12px;
                  font-weight: 600;
                  padding: 8px 11px;
                  border-radius: 999px;
                  border: 1px solid var(--accent);
                  min-height: 36px;
                "
                :style="
                  inv.paidAt
                    ? { background: 'var(--accent)', color: 'var(--on-accent)' }
                    : { background: 'transparent', color: 'var(--accent)' }
                "
                @click="togglePaid(inv)"
              >
                <span style="display: flex"
                  ><Icon :name="inv.paidAt ? 'check' : 'euro'" :size="13"
                /></span>
                <span v-if="!isPhone">{{
                  inv.paidAt ? 'Paid' : 'Mark paid'
                }}</span>
              </button>
              <!-- The ticket is what the payment buys: none until it's in. -->
              <span
                v-if="unpaid(inv)"
                style="
                  display: flex;
                  align-items: center;
                  font-size: 11px;
                  color: var(--faint);
                  padding: 0 4px;
                "
              >
                <span v-if="!isPhone">Ticket after payment</span>
              </span>
              <template v-else>
                <button
                  style="
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                    font-weight: 600;
                    padding: 8px 11px;
                    border-radius: 999px;
                    border: 1px solid var(--accent);
                    background: transparent;
                    color: var(--accent);
                    min-height: 36px;
                  "
                  @click="store.openTicket(inv.id)"
                >
                  <span style="display: flex"
                    ><Icon name="ticket" :size="13"
                  /></span>
                  <span v-if="!isPhone">Ticket</span>
                </button>
                <button
                  style="
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                    font-weight: 600;
                    padding: 8px 11px;
                    border-radius: 999px;
                    border: 1px solid var(--border);
                    background: transparent;
                    color: var(--dim);
                    min-height: 36px;
                  "
                  @click="store.openSendTicket(inv.id)"
                >
                  <span style="display: flex"
                    ><Icon name="mail" :size="13"
                  /></span>
                  <span v-if="!isPhone">Send</span>
                </button>
              </template>
            </template>

            <!-- declined: Reset -->
            <template v-else-if="inv.status === 'declined'">
              <button
                style="
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  font-size: 12px;
                  font-weight: 600;
                  padding: 8px 11px;
                  border-radius: 999px;
                  border: 1px solid var(--border);
                  background: transparent;
                  color: var(--dim);
                  min-height: 36px;
                "
                @click="store.setInviteStatus(inv.id, 'opened')"
              >
                <span style="display: flex"
                  ><Icon name="arrowL" :size="13"
                /></span>
                <span v-if="!isPhone">Reset</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
