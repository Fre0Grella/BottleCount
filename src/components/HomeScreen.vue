<script setup lang="ts">
import { computed } from 'vue';
import { useStore, COVERS } from '../lib/store';
import Icon from './Icon.vue';
import type { Party } from '../lib/types';

const store = useStore();

const base = import.meta.env.BASE_URL as string;

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
  profitColor: string;
  bar: { w: string; c: string }[];
  party: Party;
}

const partyCards = computed<PartyCard[]>(() => {
  return store.state.parties.map((p) => {
    const cv = COVERS[p.cover ?? 0] ?? COVERS[0];
    const where =
      [p.venue?.place, p.venue?.city].filter(Boolean).join(', ') || '—';
    const dateLabel = p.date
      ? new Date(p.date + 'T00:00:00').toLocaleDateString(undefined, {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—';

    const accepted = p.invites.filter((i) => i.status === 'accepted').length;
    const r = store.calcForParty(p);
    const avgProfit = (r.profit_min + r.profit_max) / 2;
    const profitColor = avgProfit >= 0 ? 'var(--good)' : 'var(--bad)';
    const profit = '€' + Math.round(avgProfit).toLocaleString();

    // macro split bar
    const SEG_COLORS = [
      'var(--seg-0)',
      'var(--seg-1)',
      'var(--seg-2)',
      'var(--seg-3)',
      'var(--seg-4)',
    ];
    const bar = Object.values(p.menu).map((cat, i) => ({
      w: (cat.macro_pct * 100).toFixed(1) + '%',
      c: SEG_COLORS[i % SEG_COLORS.length],
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
      profitColor,
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
  <div
    style="
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      background: var(--bg);
    "
  >
    <!-- header -->
    <div
      style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
      "
    >
      <a
        :href="base"
        style="
          display: flex;
          align-items: center;
          gap: 9px;
          text-decoration: none;
        "
      >
        <span
          style="
            display: flex;
            width: 28px;
            height: 28px;
            border-radius: 8px;
            align-items: center;
            justify-content: center;
            background: var(--accent);
            color: var(--on-accent);
          "
        >
          <Icon name="bottle" :size="16" />
        </span>
        <span
          style="
            font-family: var(--font-disp);
            font-weight: 700;
            font-size: 18px;
            color: var(--text);
          "
        >
          Bottle<span style="color: var(--accent)">Count</span>
        </span>
      </a>
      <div style="display: flex; align-items: center; gap: 8px">
        <a
          :href="`${base}docs`"
          style="
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 600;
            padding: 8px 13px;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: transparent;
            color: var(--dim);
            text-decoration: none;
          "
        >
          <Icon name="doc" :size="14" />
          Docs
        </a>
        <button
          style="
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
          "
          @click="store.toggleTheme()"
        >
          <Icon
            :name="store.state.theme === 'dark' ? 'sparkle' : 'zap'"
            :size="16"
          />
        </button>
      </div>
    </div>

    <!-- content -->
    <div
      style="
        width: 100%;
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 20px;
        width: 100%;
      "
    >
      <div
        style="
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin: 6px 0 20px 0;
          flex-wrap: wrap;
        "
      >
        <div>
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 700;
              font-size: 32px;
              line-height: 1.05;
              letter-spacing: -0.02em;
              color: var(--text);
            "
          >
            Your parties
          </div>
          <div style="margin-top: 6px; font-size: 13px; color: var(--dim)">
            {{ summary }}
          </div>
        </div>
      </div>

      <!-- grid -->
      <div
        style="display: grid; gap: 16px; padding-bottom: 32px"
        :style="{
          gridTemplateColumns:
            store.state.device === 'desktop'
              ? 'repeat(auto-fill,minmax(260px,1fr))'
              : '1fr',
        }"
      >
        <!-- party cards -->
        <div
          v-for="p in partyCards"
          :key="p.id"
          style="
            position: relative;
            cursor: pointer;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--r);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: bcFadeUp 0.35s ease both;
          "
          @click="store.openParty(p.id)"
        >
          <!-- cover -->
          <div
            style="
              position: relative;
              height: 96px;
              display: flex;
              align-items: flex-end;
              padding: 12px;
            "
            :style="{ background: p.cover }"
          >
            <div
              style="
                position: absolute;
                inset: 0;
                background: linear-gradient(
                  180deg,
                  rgba(0, 0, 0, 0.05),
                  rgba(0, 0, 0, 0.45)
                );
              "
            />
            <div
              style="
                position: absolute;
                top: 10px;
                left: 12px;
                font-size: 30px;
                line-height: 1;
                filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
              "
            >
              {{ p.emoji }}
            </div>
            <button
              style="
                position: absolute;
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
              "
              @click.stop="handleDelete($event, p.id)"
            >
              <Icon name="trash" :size="14" />
            </button>
            <div style="position: relative; color: #fff">
              <div
                style="
                  font-family: var(--font-disp);
                  font-weight: 700;
                  font-size: 18px;
                  letter-spacing: -0.01em;
                  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                "
              >
                {{ p.name }}
              </div>
              <div
                style="
                  display: flex;
                  align-items: center;
                  gap: 5px;
                  font-size: 11px;
                  opacity: 0.92;
                  margin-top: 2px;
                "
              >
                <Icon name="mapPin" :size="11" />
                {{ p.where }}
              </div>
            </div>
          </div>

          <!-- body -->
          <div
            style="
              padding: 14px 16px 16px 16px;
              display: flex;
              flex-direction: column;
              gap: 12px;
            "
          >
            <div
              style="
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: var(--dim);
              "
            >
              <Icon name="calendar" :size="13" style="color: var(--faint)" />
              {{ p.dateLabel }}
            </div>

            <!-- macro bar -->
            <div
              style="
                display: flex;
                height: 7px;
                border-radius: 999px;
                overflow: hidden;
                background: var(--track);
              "
            >
              <div
                v-for="(s, i) in p.bar"
                :key="i"
                :style="{ width: s.w, background: s.c }"
              />
            </div>

            <!-- KPI row -->
            <div style="display: flex; gap: 16px; align-items: baseline">
              <div style="display: flex; align-items: center; gap: 5px">
                <Icon name="users" :size="13" style="color: var(--faint)" />
                <span
                  style="font-weight: 600; font-size: 14px; color: var(--text)"
                  >{{ p.guests }}</span
                >
              </div>
              <div style="display: flex; align-items: center; gap: 5px">
                <Icon name="heart" :size="13" style="color: var(--faint)" />
                <span
                  style="font-weight: 600; font-size: 14px; color: var(--good)"
                  >{{ p.accepted }}</span
                >
                <span style="font-size: 11px; color: var(--faint)">in</span>
              </div>
              <div
                style="margin-left: auto; display: flex; align-items: center"
              >
                <span
                  style="font-weight: 600; font-size: 14px"
                  :style="{ color: p.profitColor }"
                  >{{ p.profit }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- new party card -->
        <button
          style="
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
          "
          @click="store.createParty()"
        >
          <span
            style="
              display: flex;
              width: 46px;
              height: 46px;
              border-radius: 14px;
              align-items: center;
              justify-content: center;
              background: var(--accent-soft);
              color: var(--accent);
            "
          >
            <Icon name="plus" :size="22" />
          </span>
          <span style="font-size: 14px; font-weight: 600">New party</span>
        </button>
      </div>
    </div>
  </div>
</template>
