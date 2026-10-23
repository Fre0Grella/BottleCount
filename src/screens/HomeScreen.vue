<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../store/store';
import { coverOf } from '../features/party/covers';
import { runsBar } from '../features/party/core';
import { formatLocalDate } from '../lib/dates';
import { formatEuro, segColor, venueWhere } from '../lib/display';
import Icon from '../components/ui/Icon.vue';
import IconTile from '../components/ui/IconTile.vue';
import Logo from '../components/ui/Logo.vue';
import AppFooter from '../components/site/AppFooter.vue';
import AccountButton from '../features/account/AccountButton.vue';
import type { Party } from '../lib/types';

const store = useStore();

const base = import.meta.env.BASE_URL as string;

/** Signed in on a phone the account chip needs the room: mark only. */
const compactHeader = computed(
  () => store.isPhone() && store.state.session.authenticated,
);

const summary = computed(() => {
  const n = store.state.parties.length;
  if (n === 0) return 'No parties yet — create your first one below.';
  if (n === 1) return '1 party';
  return `${n} parties`;
});

interface PartyCard {
  id: number;
  name: string;
  cover: string;
  emoji: string;
  where: string;
  dateLabel: string;
  guests: number;
  accepted: number;
  profit: string;
  /** Whether the expected profit is a loss, which shows in red. */
  loss: boolean;
  bar: { w: string; c: string }[];
  party: Party;
}

const partyCards = computed<PartyCard[]>(() => {
  return store.state.parties.map((p) => {
    const cv = coverOf(p.cover);
    const where = venueWhere(p.venue) || '—';
    const dateLabel =
      formatLocalDate(p.date, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }) || '—';

    const accepted = p.invites.filter((i) => i.status === 'confirmed').length;
    const r = store.calcForParty(p);
    const avgProfit = (r.profit_min + r.profit_max) / 2;
    const profit = formatEuro(avgProfit);

    // macro split bar
    // No drink split to show when the venue runs the bar.
    const bar = (runsBar(p) ? Object.values(p.menu) : []).map((cat, i) => ({
      w: (cat.macro_pct * 100).toFixed(1) + '%',
      c: segColor(i),
    }));

    return {
      id: p.id!,
      name: p.name,
      cover: cv.grad,
      emoji: cv.emoji,
      where,
      dateLabel,
      guests: p.settings.guests,
      accepted,
      profit,
      loss: avgProfit < 0,
      bar,
      party: p,
    };
  });
});

async function handleDelete(e: Event, id: number): Promise<void> {
  e.stopPropagation();
  await store.deleteParty(id);
}
</script>

<template>
  <div class="home">
    <!-- header -->
    <div class="home-header">
      <a :href="base" class="home-brand" aria-label="BottleCount home">
        <Logo :wordmark="!compactHeader" />
      </a>
      <div class="home-header__actions">
        <AccountButton />
        <button
          class="home-theme"
          aria-label="Switch theme"
          @click="store.toggleTheme()"
        >
          <Icon
            :name="store.state.theme === 'dark' ? 'sun' : 'moon'"
            :size="16"
          />
        </button>
      </div>
    </div>

    <!-- content -->
    <div class="home-content">
      <div class="home-heading">
        <div>
          <div class="home-title">Your parties</div>
          <div class="home-summary">
            {{ summary }}
          </div>
        </div>
      </div>

      <!-- grid -->
      <div
        class="home-grid"
        :class="{ 'home-grid--desktop': store.state.device === 'desktop' }"
      >
        <!-- party cards -->
        <div v-for="p in partyCards" :key="p.id" class="party-card">
          <!-- cover -->
          <div class="party-card__cover" :style="{ background: p.cover }">
            <div class="party-card__shade" />
            <div class="party-card__emoji">
              {{ p.emoji }}
            </div>
            <div class="party-card__heading">
              <div class="party-card__name">
                {{ p.name }}
              </div>
              <div class="party-card__where">
                <Icon name="mapPin" :size="11" />
                {{ p.where }}
              </div>
            </div>
          </div>

          <!-- body -->
          <div class="party-card__body">
            <div class="party-card__date">
              <Icon name="calendar" :size="13" class="party-card__icon" />
              {{ p.dateLabel }}
            </div>

            <!-- macro bar -->
            <div class="party-card__bar">
              <div
                v-for="(s, i) in p.bar"
                :key="i"
                :style="{ width: s.w, background: s.c }"
              />
            </div>

            <!-- KPI row -->
            <div class="party-card__kpis">
              <div class="party-card__kpi">
                <Icon name="users" :size="13" class="party-card__icon" />
                <span class="party-card__value">{{ p.guests }}</span>
              </div>
              <div class="party-card__kpi">
                <Icon name="heart" :size="13" class="party-card__icon" />
                <span class="party-card__value party-card__value--good">{{
                  p.accepted
                }}</span>
                <span class="party-card__unit">in</span>
              </div>
              <div class="party-card__profit">
                <span
                  class="party-card__value"
                  :class="
                    p.loss
                      ? 'party-card__value--bad'
                      : 'party-card__value--good'
                  "
                  >{{ p.profit }}</span
                >
              </div>
            </div>
          </div>

          <!-- The whole card opens the party; the delete button sits above. -->
          <button
            class="party-card__open"
            :aria-label="`Open ${p.name}`"
            @click="store.openParty(p.id)"
          />
          <button
            class="party-card__delete"
            :aria-label="`Delete ${p.name}`"
            @click.stop="handleDelete($event, p.id)"
          >
            <Icon name="trash" :size="14" />
          </button>
        </div>

        <!-- new party card -->
        <button class="home-new" @click="store.createParty()">
          <IconTile icon="plus" :size="46" :icon-size="22" />
          <span class="home-new__label">New party</span>
        </button>
      </div>
    </div>

    <AppFooter />
  </div>
</template>

<style scoped>
.home {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}
.home-brand {
  display: flex;
  text-decoration: none;
}
.home-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.home-theme {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--dim);
}

.home-content {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px;
}
.home-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 6px 0 20px 0;
  flex-wrap: wrap;
}
.home-title {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 32px;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--text);
}
.home-summary {
  margin-top: 6px;
  font-size: 13px;
  color: var(--dim);
}

.home-grid {
  display: grid;
  gap: 16px;
  padding-bottom: 32px;
  grid-template-columns: 1fr;
}
.home-grid--desktop {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.party-card {
  position: relative;
  cursor: pointer;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: bcFadeUp 0.35s ease both;
}
.party-card__cover {
  position: relative;
  height: 96px;
  display: flex;
  align-items: flex-end;
  padding: 12px;
}
.party-card__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.45));
}
.party-card__emoji {
  position: absolute;
  top: 10px;
  left: 12px;
  font-size: 30px;
  line-height: 1;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
}
.party-card__heading {
  position: relative;
  color: #fff;
}
.party-card__name {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.01em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.party-card__where {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  opacity: 0.92;
  margin-top: 2px;
}

.party-card__body {
  padding: 14px 16px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.party-card__date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dim);
}
.party-card__icon {
  color: var(--faint);
}
.party-card__bar {
  display: flex;
  height: 7px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--track);
}
.party-card__kpis {
  display: flex;
  gap: 16px;
  align-items: baseline;
}
.party-card__kpi {
  display: flex;
  align-items: center;
  gap: 5px;
}
.party-card__value {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.party-card__value--good {
  color: var(--good);
}
.party-card__value--bad {
  color: var(--bad);
}
.party-card__unit {
  font-size: 11px;
  color: var(--faint);
}
.party-card__profit {
  margin-left: auto;
  display: flex;
  align-items: center;
}

/* Covers the card, so the card is one button for the pointer and one tab stop
   for the keyboard; its focus ring is drawn inside the clipped card. */
.party-card__open {
  position: absolute;
  inset: 0;
  cursor: pointer;
  border: none;
  border-radius: inherit;
  background: transparent;
}
.party-card__open:focus-visible {
  outline-offset: -2px;
}
.party-card__delete {
  position: absolute;
  z-index: 1;
  top: 10px;
  right: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
}

.home-new {
  cursor: pointer;
  background: transparent;
  border: 1.5px dashed var(--border);
  border-radius: var(--r);
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--dim);
}
.home-new__label {
  font-size: 14px;
  font-weight: 600;
}
</style>
