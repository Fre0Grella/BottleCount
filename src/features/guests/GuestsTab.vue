<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { isPaidParty } from '../../../shared/payments';
import { ticketState } from '../../../shared/tickets';
import {
  funnelBar,
  funnelGroups,
  initial,
  isNameless,
  referrerFirst,
  rowAvatarOpacity,
  spreadAvatarOpacity,
  spreadFactor,
  venueFeeLine,
} from './funnel';
import { togglePaid } from './markPaid';
import type { Invite } from '../../lib/types';
import type { IconName } from '../../lib/icons';
import { useStore } from '../../store/store';
import { formatClockTime } from '../../lib/dates';
import { segColor } from '../../lib/display';
import Icon from '../../components/ui/Icon.vue';
import Card from '../../components/ui/Card.vue';
import IconTile from '../../components/ui/IconTile.vue';
import PillButton from '../../components/ui/PillButton.vue';
import ProgressBar from '../../components/ui/ProgressBar.vue';
import ProLock from '../account/ProLock.vue';

const store = useStore();

const guestSearch = ref('');

const party = computed(() => store.activeParty());
const invites = computed(() => party.value?.invites ?? []);
const filteredInvites = computed(() => {
  const q = guestSearch.value.trim().toLowerCase();
  if (!q) return invites.value;
  return invites.value.filter((i) => i.name.toLowerCase().includes(q));
});

const groups = computed(() => funnelGroups(invites.value));
const confirmed = computed(() => groups.value.confirmed);

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

function markPaid(inv: Invite): void {
  void togglePaid(store, party.value, inv);
}

const venueFee = computed(() => {
  const p = party.value;
  if (!p) return null;
  return venueFeeLine(
    p.settings,
    paidParty.value,
    confirmed.value.length,
    groups.value.paid,
  );
});

const capacity = computed(() => party.value?.settings.guests ?? 1);

// Optional hard cap. When set, the funnel scales to the cap and a marker shows
// where the expected headcount sits.
const hasMax = computed(() => party.value?.settings.max_capacity != null);
const maxCap = computed(
  () => party.value?.settings.max_capacity ?? capacity.value,
);
const bar = computed(() =>
  funnelBar(
    confirmed.value.length,
    groups.value.opened.length,
    capacity.value,
    hasMax.value ? maxCap.value : null,
  ),
);
const pct = (n: number) => `${n}%`;

const stats = computed<
  {
    label: string;
    icon: IconName;
    iconTone: string;
    value: number;
    tone: string;
  }[]
>(() => [
  {
    label: 'Reached',
    icon: 'users',
    iconTone: 'dim',
    value: invites.value.length,
    tone: 'text',
  },
  {
    label: 'Confirmed',
    icon: 'check',
    iconTone: 'good',
    value: confirmed.value.length,
    tone: 'good',
  },
  {
    label: 'Maybe',
    icon: 'hourglass',
    iconTone: 'dim',
    value: groups.value.opened.length,
    tone: 'text',
  },
  {
    label: 'Declined',
    icon: 'x',
    iconTone: 'faint',
    value: groups.value.declined.length,
    tone: 'faint',
  },
]);

const tiers = computed(() => [
  {
    key: 'direct',
    invites: groups.value.direct,
    name: 'Direct invites',
    sub: 'invited by you',
  },
  {
    key: 'viral',
    invites: groups.value.viral,
    name: 'Friends-of-friends',
    sub: 'forwarded by guests',
  },
]);

const spread = computed(() =>
  spreadFactor(invites.value.length, groups.value.direct.length),
);

function addGuest() {
  store.openAddGuest();
}

const isPhone = computed(() => store.state.device === 'phone');

// ── Live funnel ────────────────────────────────────────────────────────────

// Guests answer while the host is looking, so the open party's session polls
// the funnel (features/sync/partySession.ts). Opening this tab asks once more on top, so
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
  <div class="guests">
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
      <Card pad="lg">
        <div class="head head--funnel">
          <IconTile icon="users" />
          <div class="title">RSVP funnel</div>

          <!--
            Only shown once the link is live. Before that the numbers are all
            zero and a "last updated" stamp would suggest the page is waiting
            for something that is never coming.
          -->
          <span v-if="published && lastSyncedLabel" class="live">
            <span
              class="live-dot"
              :class="{ 'live-dot--syncing': store.state.funnelSyncing }"
            ></span>
            Live · {{ lastSyncedLabel }}
          </span>

          <PillButton
            label="Send invite"
            icon="share"
            variant="accent"
            size="lg"
            class="send-invite"
            :class="{ 'send-invite--after-live': published && lastSyncedLabel }"
            @click="store.openShare()"
          />
        </div>

        <div class="intro">
          <template v-if="published">
            Your link is live. Anyone who opens it RSVPs
            <strong>with their own name</strong>
            and lands in the guest list below — including the ones who look and
            never answer, which is what <em>Reached</em> counts.
          </template>
          <template v-else>
            Hit
            <strong>Send invite</strong>
            to create your link. Anyone who opens it RSVPs with their own name
            and lands in the guest list below. You never type them in.
          </template>
        </div>

        <!-- stat boxes: 2×2 on phone, 1×4 on desktop -->
        <div class="stats" :class="{ 'stats--phone': isPhone }">
          <div v-for="s in stats" :key="s.label" class="stat">
            <div class="stat-head">
              <span class="ico" :class="`tone-${s.iconTone}`"
                ><Icon :name="s.icon" :size="13"
              /></span>
              <span class="stat-label">{{ s.label }}</span>
            </div>
            <div class="stat-value" :class="`tone-${s.tone}`">
              {{ s.value }}
            </div>
          </div>
        </div>

        <!-- funnel bar -->
        <div class="bar-caption">
          <template v-if="hasMax">
            Filling {{ capacity }} expected toward a {{ maxCap }} cap — green is
            on target, amber is past expected
          </template>
          <template v-else>
            Against {{ capacity }} capacity — solid is confirmed, faded is still
            maybe
          </template>
        </div>
        <div class="funnel-bar">
          <!-- confirmed, within expected -->
          <div class="seg seg--good" :style="{ width: pct(bar.within) }"></div>
          <!-- confirmed, past expected but under cap -->
          <div
            v-if="hasMax"
            class="seg seg--accent"
            :style="{ width: pct(bar.over) }"
          ></div>
          <!-- still maybe -->
          <div
            class="seg seg--maybe"
            :class="hasMax ? 'seg--accent' : 'seg--good'"
            :style="{ width: pct(bar.maybe) }"
          ></div>
          <!-- expected-headcount marker (only when a cap is set) -->
          <div
            v-if="hasMax"
            class="marker"
            :style="{ left: pct(bar.marker) }"
          ></div>
        </div>
        <div class="bar-foot">
          <span class="bar-count">
            {{ confirmed.length }}/{{ hasMax ? maxCap : capacity }}
            {{ hasMax ? 'to cap' : '' }}
          </span>
          <span v-if="hasMax" class="bar-expected">
            {{ capacity }} expected
          </span>
        </div>
      </Card>

      <!-- ── Spread card ── -->
      <Card pad="lg">
        <div class="head head--spread">
          <IconTile icon="share" />
          <div>
            <div class="title">How far the word spread</div>
            <div class="subtitle">guests inviting their own friends</div>
          </div>
          <div class="factor">
            <div class="factor-value">{{ spread }}</div>
            <div class="factor-label">spread factor</div>
          </div>
        </div>

        <div class="tiers">
          <div class="tier">
            <div class="tier-avatars">
              <span class="star">★</span>
            </div>
            <div class="tier-value tier-value--you">1</div>
            <div class="tier-name">You</div>
            <div class="tier-sub">the host</div>
          </div>

          <div v-for="t in tiers" :key="t.key" class="tier">
            <div class="tier-avatars">
              <span
                v-for="inv in t.invites.slice(0, 4)"
                :key="inv.id"
                class="tier-avatar"
                :style="{
                  background: segColor(inv.id),
                  opacity: String(spreadAvatarOpacity(inv.status)),
                }"
                >{{ initial(inv.name) }}</span
              >
            </div>
            <div class="tier-value">{{ t.invites.length }}</div>
            <div class="tier-name">{{ t.name }}</div>
            <div class="tier-sub">{{ t.sub }}</div>
          </div>
        </div>

        <div class="spread-note">
          With
          <strong>"let guests invite friends"</strong>
          on, your guests can forward the invite to their own friends — anyone
          they bring lands in this tier.
        </div>
      </Card>
    </ProLock>

    <!-- ── Guest list card ── -->
    <Card pad="lg">
      <div class="head head--list">
        <div class="title title--list">Guest list</div>
        <PillButton
          label="Door mode"
          icon="scan"
          variant="outline"
          size="md"
          class="push-right"
          @click="store.openDoor()"
        />
      </div>

      <div class="meter">
        <div class="meter-head">
          <span class="meter-label">
            <span class="ico tone-good"><Icon name="check" :size="12" /></span>
            Checked in
          </span>
          <span class="meter-count tone-good">
            {{ groups.checkedIn }}/{{ confirmed.length }}
          </span>
        </div>
        <ProgressBar
          :value="groups.checkedIn"
          :max="confirmed.length"
          label="Checked in"
          :value-text="`${groups.checkedIn} of ${confirmed.length}`"
        />
      </div>

      <!-- paid progress bar, for a party guests pay for -->
      <div v-if="paidParty" class="meter meter--tucked">
        <div class="meter-head">
          <span class="meter-label">
            <span class="ico tone-accent"><Icon name="euro" :size="12" /></span>
            Paid
          </span>
          <span class="meter-count tone-accent" data-test="paid-count">
            {{ groups.paid }}/{{ confirmed.length }}
            <span v-if="confirmed.length > groups.paid" class="to-pay">
              · {{ confirmed.length - groups.paid }} to pay
            </span>
          </span>
        </div>
        <ProgressBar
          :value="groups.paid"
          :max="confirmed.length"
          label="Paid"
          :value-text="`${groups.paid} of ${confirmed.length}`"
          tone="accent"
        />
      </div>

      <!-- What the venue's per-head fee comes to for the guests counted. -->
      <div v-if="venueFee" data-test="venue-fee" class="venue-fee">
        Venue fee: {{ venueFee.guests }} {{ venueFee.who }} × €{{
          venueFee.fee
        }}
        =
        <strong>€{{ venueFee.total }}</strong>
      </div>

      <!-- add row -->
      <div class="add-row">
        <input
          v-model="guestSearch"
          class="search"
          placeholder="Search guests…"
          aria-label="Search guests"
          @keydown.escape="guestSearch = ''"
        />
        <button type="button" class="add" @click="addGuest">
          <span class="ico"><Icon name="plus" :size="14" /></span>
          Add
        </button>
      </div>

      <!-- invite rows -->
      <div class="rows">
        <div
          v-for="inv in filteredInvites"
          :key="inv.id"
          class="row"
          :class="{ 'row--declined': inv.status === 'declined' }"
        >
          <span
            class="avatar"
            :style="{
              background: segColor(inv.id),
              opacity: String(rowAvatarOpacity(inv.status)),
            }"
          >
            {{ initial(inv.name) }}
          </span>

          <!-- name + status -->
          <div class="row-main">
            <div class="name-line">
              <span class="name" :class="{ 'name--none': isNameless(inv) }">{{
                isNameless(inv) ? 'Opened the link' : inv.name
              }}</span>
              <!-- viral badge -->
              <span v-if="inv.depth > 0 && inv.referrer" class="via">
                <span class="ico"><Icon name="share" :size="9" /></span>
                via {{ referrerFirst(inv.referrer) }}
              </span>
            </div>

            <!-- status line -->
            <div
              v-if="inv.used && inv.status === 'confirmed'"
              class="status tone-good"
            >
              <span class="ico"><Icon name="check" :size="11" /></span>
              Checked in · {{ formatClockTime(inv.usedAt) }}
            </div>
            <div
              v-else-if="inv.status === 'confirmed'"
              class="status tone-good"
            >
              <span class="ico"><Icon name="check" :size="11" /></span>
              Coming
              <span v-if="paidParty && inv.paidAt" class="tone-accent">
                · Paid
              </span>
            </div>
            <div v-else-if="inv.status === 'opened'" class="status tone-dim">
              <span class="ico"><Icon name="hourglass" :size="11" /></span>
              Maybe
            </div>
            <div
              v-else-if="inv.status === 'declined'"
              class="status tone-faint"
            >
              <span class="ico"><Icon name="x" :size="11" /></span>
              Can't make it
            </div>

            <!--
              Where to send their ticket. Organisers only: the invite page
              never shows it, not even to the guest it belongs to.
            -->
            <div v-if="inv.email || inv.phone" class="contact">
              {{ [inv.email, inv.phone].filter(Boolean).join(' · ') }}
            </div>
            <div
              v-else-if="paidParty && inv.status === 'confirmed'"
              class="contact contact--none"
            >
              No email or phone yet
            </div>
            <button
              v-if="inv.source === 'manual'"
              type="button"
              class="contact-edit"
              @click="store.openGuestContact(inv.id)"
            >
              {{
                inv.email || inv.phone ? 'Edit contact' : 'Add email or phone'
              }}
            </button>
          </div>

          <!-- action buttons; on a phone only their icons show -->
          <div class="actions">
            <!--
              opened, no answer: the host can answer on their behalf — but only
              for someone with a name, since a confirmed guest gets a ticket
              made out to them.
            -->
            <template v-if="inv.status === 'opened'">
              <PillButton
                v-if="!isNameless(inv)"
                label="Accept"
                icon="check"
                variant="good"
                :icon-only="isPhone"
                @click="store.setInviteStatus(inv.id, 'confirmed')"
              />
              <PillButton
                label="Decline"
                icon="x"
                variant="quiet"
                :icon-only="isPhone"
                @click="store.setInviteStatus(inv.id, 'declined')"
              />
            </template>

            <!-- confirmed: Paid (when guests pay) + Ticket + Send -->
            <template v-else-if="inv.status === 'confirmed'">
              <PillButton
                v-if="paidParty"
                :label="inv.paidAt ? 'Paid' : 'Mark paid'"
                :icon="inv.paidAt ? 'check' : 'euro'"
                :variant="inv.paidAt ? 'accent' : 'outline'"
                :pressed="!!inv.paidAt"
                :icon-only="isPhone"
                :title="inv.paidAt ? 'Paid — tap to undo' : 'Mark as paid'"
                @click="markPaid(inv)"
              />
              <!-- The ticket is what the payment buys: none until it's in. -->
              <span v-if="unpaid(inv)" class="after-pay">
                <span v-if="!isPhone">Ticket after payment</span>
              </span>
              <template v-else>
                <PillButton
                  label="Ticket"
                  icon="ticket"
                  variant="outline"
                  :icon-only="isPhone"
                  @click="store.openTicket(inv.id)"
                />
                <PillButton
                  label="Send"
                  icon="mail"
                  :icon-only="isPhone"
                  @click="store.openSendTicket(inv.id)"
                />
              </template>
            </template>

            <!-- declined: Reset -->
            <template v-else-if="inv.status === 'declined'">
              <PillButton
                label="Reset"
                icon="arrowL"
                :icon-only="isPhone"
                @click="store.setInviteStatus(inv.id, 'opened')"
              />
            </template>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.guests {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 32px;
  animation: bcFadeUp 0.3s ease both;
}

.ico {
  display: flex;
}

.tone-text {
  color: var(--text);
}
.tone-dim {
  color: var(--dim);
}
.tone-faint {
  color: var(--faint);
}
.tone-good {
  color: var(--good);
}
.tone-accent {
  color: var(--accent);
}

/* ── card headers ── */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head--funnel {
  margin-bottom: 16px;
}
.head--spread {
  margin-bottom: 4px;
}
.head--list {
  margin-bottom: 12px;
}

.title {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 16px;
}
.title--list {
  font-size: 15px;
}
.subtitle {
  font-size: 11px;
  color: var(--faint);
}

.push-right {
  margin-left: auto;
}

/* ── funnel ── */
.live {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--faint);
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--good);
}
.live-dot--syncing {
  opacity: 0.4;
}

/* Wraps to two lines beside a long title on a phone, like the title does. */
.head .send-invite {
  margin-left: auto;
  white-space: normal;
}
.head .send-invite :deep(.bc-icon) {
  flex-shrink: 0;
}
.head .send-invite--after-live {
  margin-left: 0;
}

.intro {
  font-size: 11.5px;
  color: var(--dim);
  line-height: 1.55;
  margin-bottom: 13px;
}
.intro strong {
  color: var(--text);
  font-weight: 600;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
.stats--phone {
  grid-template-columns: 1fr 1fr;
}
.stat {
  background: var(--surface2);
  border-radius: var(--rs);
  padding: 12px 13px;
}
.stat-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}
.stat-value {
  margin-top: 5px;
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 22px;
}

.bar-caption {
  font-size: 11px;
  color: var(--faint);
  margin-bottom: 7px;
}
.funnel-bar {
  position: relative;
  display: flex;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--track);
}
.seg--good {
  background: var(--good);
}
.seg--accent {
  background: var(--accent);
}
.seg--maybe {
  opacity: 0.32;
}
.marker {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: var(--text);
  opacity: 0.55;
  transform: translateX(-1px);
}
.bar-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 6px;
}
.bar-count {
  font-size: 11px;
  color: var(--dim);
  font-weight: 600;
}
.bar-expected {
  font-size: 11px;
  color: var(--faint);
}

/* ── spread ── */
.factor {
  margin-left: auto;
  text-align: right;
}
.factor-value {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 20px;
  color: var(--accent);
}
.factor-label {
  font-size: 10px;
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tiers {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-top: 14px;
}
.tier {
  flex: 1;
  background: var(--surface2);
  border-radius: var(--rs);
  padding: 12px;
  text-align: center;
}
.tier-avatars {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
  min-height: 26px;
}
.star,
.tier-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
}
.star {
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12px;
}
.tier-avatar {
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border: 2px solid var(--surface2);
}
.tier-avatar + .tier-avatar {
  margin-left: -8px;
}
.tier-value {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 20px;
  color: var(--text);
}
.tier-value--you {
  color: var(--accent);
}
.tier-name {
  font-size: 10.5px;
  color: var(--dim);
  font-weight: 600;
}
.tier-sub {
  font-size: 9.5px;
  color: var(--faint);
  margin-top: 1px;
}

.spread-note {
  font-size: 11px;
  color: var(--faint);
  line-height: 1.55;
  margin-top: 13px;
}
.spread-note strong {
  color: var(--dim);
  font-weight: 600;
}

/* ── guest list ── */
.meter {
  margin-bottom: 14px;
}
.meter--tucked {
  margin: -4px 0 14px;
}
.meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
}
.meter-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dim);
}
.meter-count {
  font-size: 11px;
  font-weight: 700;
}
.to-pay {
  font-weight: 500;
  color: var(--faint);
}

.venue-fee {
  margin: -4px 0 14px;
  font-size: 11px;
  color: var(--faint);
}
.venue-fee strong {
  color: var(--dim);
}

.add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
.search {
  flex: 1;
  font-size: 14px;
  padding: 11px 13px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  min-width: 0;
  font-family: inherit;
}
.add {
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
}

.rows {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 2px;
  border-top: 1px solid var(--border);
  min-height: 56px;
}
.row--declined {
  opacity: 0.6;
}
.avatar {
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
}
.row-main {
  min-width: 0;
  flex: 1;
}
.name-line {
  display: flex;
  align-items: center;
  gap: 7px;
}
.name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name--none {
  font-style: italic;
  font-weight: 500;
  color: var(--dim);
}
.via {
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
}
.status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  margin-top: 1px;
}
.contact {
  font-size: 11px;
  color: var(--faint);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.contact--none {
  white-space: normal;
}
.contact-edit {
  cursor: pointer;
  padding: 0;
  margin-top: 2px;
  border: none;
  background: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}
.actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.after-pay {
  display: flex;
  align-items: center;
  font-size: 11px;
  color: var(--faint);
  padding: 0 4px;
}
</style>
