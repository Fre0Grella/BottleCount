<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../../lib/store';
import Icon from '../Icon.vue';

const store = useStore();

const newGuestName = ref('');

const party = computed(() => store.activeParty());
const invites = computed(() => party.value?.invites ?? []);

const accepted = computed(() =>
  invites.value.filter((i) => i.status === 'accepted'),
);
const pending = computed(() =>
  invites.value.filter((i) => i.status === 'pending'),
);
const declined = computed(() =>
  invites.value.filter((i) => i.status === 'declined'),
);
const direct = computed(() => invites.value.filter((i) => i.depth === 0));
const viral = computed(() => invites.value.filter((i) => i.depth > 0));

const capacity = computed(() => party.value?.settings.guests ?? 1);

const acceptedW = computed(
  () => `${Math.min(100, (accepted.value.length / capacity.value) * 100)}%`,
);
const pendingW = computed(() => {
  const used = (accepted.value.length / capacity.value) * 100;
  const pct = (pending.value.length / capacity.value) * 100;
  return `${Math.min(pct, 100 - used)}%`;
});

const spreadFactor = computed(() => {
  const total = invites.value.length;
  const d = Math.max(1, direct.value.length);
  return (total / d).toFixed(1) + '×';
});

const SEG_COLORS = [
  'var(--seg-0)',
  'var(--seg-1)',
  'var(--seg-2)',
  'var(--seg-3)',
  'var(--seg-4)',
];

function avatarColor(id: number) {
  return SEG_COLORS[id % 5];
}

function avatarOpacity(status: 'accepted' | 'pending' | 'declined') {
  if (status === 'accepted') return 1;
  if (status === 'pending') return 0.55;
  return 0.35;
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase();
}

function referrerFirst(referrer: string | null) {
  if (!referrer) return '';
  return referrer.trim().split(' ')[0];
}

function addGuest() {
  const name = newGuestName.value.trim();
  if (!name) return;
  store.addInvite(name);
  newGuestName.value = '';
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') addGuest();
}

const isPhone = computed(() => store.state.device === 'phone');
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
        Share your invite link — anyone who opens it RSVPs
        <strong style="color: var(--text); font-weight: 600"
          >with their own name</strong
        >
        and lands in the guest list below. You never type them in.
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
            {{ accepted.length }}
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
            {{ pending.length }}
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
        Against {{ capacity }} capacity — solid is confirmed, faded is still
        maybe
      </div>
      <div
        style="
          display: flex;
          height: 14px;
          border-radius: 999px;
          overflow: hidden;
          background: var(--track);
        "
      >
        <div :style="{ width: acceptedW, background: 'var(--good)' }"></div>
        <div
          :style="{
            width: pendingW,
            background: 'var(--good)',
            opacity: '0.32',
          }"
        ></div>
      </div>
      <div
        style="
          font-size: 11px;
          color: var(--dim);
          margin-top: 6px;
          font-weight: 600;
        "
      >
        {{ accepted.length }}/{{ capacity }}
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
        style="display: flex; align-items: stretch; gap: 8px; margin-top: 14px"
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
                  background: avatarColor(inv.id),
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
                  background: avatarColor(inv.id),
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

      <!-- simulate button -->
      <button
        style="
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          width: 100%;
          margin-top: 10px;
          padding: 10px;
          border-radius: var(--rs);
          border: 1px solid var(--border);
          background: transparent;
          color: var(--dim);
          font-size: 12px;
          font-weight: 600;
          min-height: 40px;
        "
        @click="store.simulateSpread()"
      >
        <span style="display: flex"><Icon name="zap" :size="14" /></span>
        Simulate guests forwarding
      </button>
    </div>

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

      <!-- add row -->
      <div style="display: flex; gap: 8px; margin-bottom: 6px">
        <input
          v-model="newGuestName"
          placeholder="Add a guest by name…"
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
          @keydown="onKeyDown"
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
          v-for="inv in invites"
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
              background: avatarColor(inv.id),
              opacity:
                inv.status === 'accepted'
                  ? '1'
                  : inv.status === 'pending'
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
                >{{ inv.name }}</span
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
              v-if="inv.used && inv.status === 'accepted'"
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
              Checked in · {{ inv.usedAt }}
            </div>
            <div
              v-else-if="inv.status === 'accepted'"
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
            </div>
            <div
              v-else-if="inv.status === 'pending'"
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
          </div>

          <!-- action buttons -->
          <div style="display: flex; gap: 6px; flex-shrink: 0">
            <!-- pending: Accept + Decline -->
            <template v-if="inv.status === 'pending'">
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
                  border: 1px solid var(--good);
                  background: var(--good-soft);
                  color: var(--good);
                  min-height: 36px;
                "
                @click="store.setInviteStatus(inv.id, 'accepted')"
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

            <!-- accepted: Ticket + Send -->
            <template v-else-if="inv.status === 'accepted'">
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
                @click="store.openTicket(inv.name)"
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
                @click="store.openSendTicket(inv.name)"
              >
                <span style="display: flex"
                  ><Icon name="mail" :size="13"
                /></span>
                <span v-if="!isPhone">Send</span>
              </button>
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
                @click="store.setInviteStatus(inv.id, 'pending')"
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
