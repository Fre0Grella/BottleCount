<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../../store/store';
import { COVERS, coverOf } from './covers';
import { VIBES, BUFFERS } from './planPresets';
import { runsBar } from './core';
import {
  MAX_GUESTS,
  capFromInput,
  guestsFromInput,
  pnlRows,
  stdDrinks,
  type CostKey,
} from './plan';
import {
  renameParty,
  setBuffer,
  setCost,
  setCover,
  setDate,
  setDrinkStrength,
  setGuests,
  setMaxCapacity,
  setVenue,
  toggleMaxCapacity,
} from './planEdits';
import { formatEuro, venueWhere as whereOf } from '../../lib/display';
import type { IconName } from '../../lib/icons';
import type { Party } from '../../lib/types';
import Card from '../../components/ui/Card.vue';
import Field from '../../components/ui/Field.vue';
import Icon from '../../components/ui/Icon.vue';
import IconTile from '../../components/ui/IconTile.vue';
import Slider from '../../components/ui/Slider.vue';
import Stepper from '../../components/ui/Stepper.vue';
import Toggle from '../../components/ui/Toggle.vue';
import PaymentSettings from '../payments/PaymentSettings.vue';

const store = useStore();

// ── Active party (reactive) ────────────────────────────────────────────────

const p = computed(() => store.activeParty());

/** False when the venue runs the bar: the drink settings below go away. */
const planningDrinks = computed(() => (p.value ? runsBar(p.value) : true));

const isPhone = computed(store.isPhone);

/** What an input event's field now holds. */
function typed(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

// ── Venue hero ─────────────────────────────────────────────────────────────

const heroCover = computed(() => coverOf(p.value?.cover));

const venueWhere = computed(() => {
  const party = p.value;
  if (!party) return '';
  return whereOf(party.venue) || 'No venue set';
});

// ── Where & when ──────────────────────────────────────────────────────────

const WHERE_FIELDS: {
  label: string;
  icon: IconName;
  type: 'text' | 'date' | 'time';
  placeholder?: string;
  value: (party: Party) => string;
  set: (value: string) => void;
}[] = [
  {
    label: 'Venue',
    icon: 'mapPin',
    type: 'text',
    placeholder: 'Venue name',
    value: (party) => party.venue.place,
    set: (v) => setVenue('place', v),
  },
  {
    label: 'City',
    icon: 'mapPin',
    type: 'text',
    placeholder: 'City',
    value: (party) => party.venue.city,
    set: (v) => setVenue('city', v),
  },
  {
    label: 'Date',
    icon: 'calendar',
    type: 'date',
    value: (party) => party.date,
    set: setDate,
  },
  {
    label: 'Start time',
    icon: 'clock',
    type: 'time',
    value: (party) => party.venue.time,
    set: (v) => setVenue('time', v),
  },
];

// ── Who's coming ──────────────────────────────────────────────────────────

function onGuestsInput(e: Event): void {
  const n = guestsFromInput(typed(e));
  if (n !== null) setGuests(n);
}

const maxCapOn = computed(() => p.value?.settings.max_capacity != null);

function onMaxCapInput(e: Event): void {
  const n = capFromInput(typed(e));
  if (n !== null) setMaxCapacity(n);
}

const drinksEach = computed(() =>
  stdDrinks(p.value?.settings.alcohol_ml_per_person ?? 0),
);

// ── The money ─────────────────────────────────────────────────────────────

const costFields = computed(
  (): {
    key: CostKey;
    label: string;
    sub: string;
    icon: IconName;
    inputmode: 'numeric' | 'decimal';
  }[] => [
    {
      key: 'ticket_price',
      label: 'Ticket price',
      sub: 'per person',
      icon: 'ticket',
      inputmode: 'numeric',
    },
    {
      key: 'venue_cost',
      label: 'Venue cost',
      sub: 'fixed fee',
      icon: 'mapPin',
      inputmode: 'numeric',
    },
    {
      key: 'venue_fee_per_person',
      label: 'Venue fee per guest',
      sub: planningDrinks.value
        ? 'if the venue charges per head'
        : 'what the venue asks per head for the bar',
      icon: 'users',
      inputmode: 'decimal',
    },
    {
      key: 'equipment_cost',
      label: 'Equipment',
      sub: 'sound, lights, etc.',
      icon: 'tune',
      inputmode: 'numeric',
    },
  ],
);

const pnl = computed(() =>
  p.value ? pnlRows(store.calc(), p.value.settings, planningDrinks.value) : [],
);
</script>

<template>
  <div v-if="p" class="plan">
    <!-- ── 1. Venue hero ──────────────────────────────────────────────── -->
    <div class="hero">
      <div class="hero__cover" :style="{ background: heroCover.grad }">
        <!-- dark scrim -->
        <div class="hero__scrim" />

        <!-- top row: emoji + cover picker -->
        <div class="hero__top">
          <span class="hero__emoji">{{ heroCover.emoji }}</span>
          <div class="hero__covers">
            <button
              v-for="(cover, i) in COVERS"
              :key="i"
              :title="cover.label"
              :aria-label="`${cover.label} cover`"
              :aria-pressed="p.cover === i"
              class="hero__swatch"
              :class="{ 'is-on': p.cover === i }"
              :style="{ background: cover.grad }"
              @click="setCover(i)"
            />
          </div>
        </div>

        <!-- bottom row: party name + venue line -->
        <div class="hero__bottom">
          <input
            :value="p.name"
            placeholder="Party name"
            aria-label="Party name"
            class="hero__name"
            @input="renameParty(typed($event))"
          />
          <div class="hero__where">
            <span class="hero__pin">
              <Icon name="mapPin" :size="13" />
            </span>
            {{ venueWhere }}
          </div>
        </div>
      </div>
    </div>

    <!-- ── 2. Where & when ───────────────────────────────────────────── -->
    <Card>
      <div class="card-head">
        <IconTile icon="mapPin" />
        <div class="card-head__title">Where &amp; when</div>
      </div>

      <!-- 2-col grid (1-col on phone) -->
      <div class="cols where" :class="{ 'cols--one': isPhone }">
        <Field
          v-for="f in WHERE_FIELDS"
          :key="f.label"
          v-slot="{ id }"
          :label="f.label"
          :icon="f.icon"
          size="sm"
        >
          <input
            :id="id"
            :type="f.type"
            :value="f.value(p)"
            :placeholder="f.placeholder"
            @input="f.set(typed($event))"
          />
        </Field>
      </div>
    </Card>

    <!-- ── 3. Who's coming ───────────────────────────────────────────── -->
    <Card>
      <div class="card-head">
        <IconTile icon="users" />
        <div class="card-head__title">Who's coming</div>
      </div>

      <!-- stepper -->
      <Stepper
        class="gap-below"
        :model-value="p.settings.guests"
        label="guests"
        :min="1"
        :max="MAX_GUESTS"
        size="lg"
        @update:model-value="setGuests"
      >
        <input
          type="number"
          :value="p.settings.guests"
          min="1"
          :max="MAX_GUESTS"
          aria-label="Expected guests"
          class="guests__input"
          @input="onGuestsInput"
        />
        <div class="guests__caption">expected guests</div>
      </Stepper>

      <!-- guests slider -->
      <div class="gap-below">
        <Slider
          :model-value="p.settings.guests"
          label="Expected guests"
          :min="1"
          :max="MAX_GUESTS"
          :step="1"
          color="var(--accent)"
          track-color="var(--track)"
          @update:model-value="setGuests"
        />
      </div>

      <!-- max capacity toggle + slider -->
      <div class="setting cap" :class="{ 'is-on': maxCapOn }">
        <!-- toggle row -->
        <Toggle
          :model-value="maxCapOn"
          icon="users"
          @update:model-value="toggleMaxCapacity()"
        >
          Cap the headcount
          <template #description>
            Set a hard limit on how many guests can fit
          </template>
        </Toggle>

        <!-- expanded slider -->
        <div v-if="maxCapOn" class="cap__body">
          <div class="cap__row">
            <span class="small-label">Max capacity</span>
            <span class="cap__value">
              <input
                type="number"
                :value="p.settings.max_capacity"
                min="1"
                :max="MAX_GUESTS"
                aria-label="Max capacity"
                class="cap__input"
                @input="onMaxCapInput"
              />
              <span class="cap__unit">guests</span>
            </span>
          </div>
          <Slider
            :model-value="p.settings.max_capacity ?? p.settings.guests"
            label="Max capacity"
            :min="1"
            :max="MAX_GUESTS"
            :step="1"
            color="var(--accent)"
            track-color="var(--track)"
            @update:model-value="setMaxCapacity"
          />
        </div>
      </div>

      <!-- who runs the bar -->
      <Toggle
        :model-value="!planningDrinks"
        icon="glass"
        class="setting bar"
        :class="{ 'is-on': !planningDrinks }"
        @update:model-value="store.toggleBarManaged()"
      >
        The venue runs the bar
        <template #description>
          <template v-if="planningDrinks">
            Turn on to skip drink planning — no menu, shopping list or drink
            costs
          </template>
          <template v-else>
            Drink planning is off. Your menu is kept — turn this off to bring it
            back
          </template>
        </template>
      </Toggle>

      <template v-if="planningDrinks">
        <!-- how hard does it go -->
        <div class="small-label vibes__title">How hard does it go?</div>
        <div class="vibes">
          <button
            v-for="vibe in VIBES"
            :key="vibe.ml"
            class="vibe"
            :class="{ 'is-on': p.settings.alcohol_ml_per_person === vibe.ml }"
            :aria-pressed="p.settings.alcohol_ml_per_person === vibe.ml"
            @click="setDrinkStrength(vibe.ml)"
          >
            <span class="vibe__emoji">{{ vibe.emoji }}</span>
            <span class="vibe__label">{{ vibe.label }}</span>
            <span class="vibe__sub">{{ vibe.sub }}</span>
          </button>
        </div>

        <!-- buying buffer + hint -->
        <div class="buffer">
          <span class="small-label">Buying buffer</span>
          <div class="buffer__chips">
            <button
              v-for="buf in BUFFERS"
              :key="buf.v"
              class="chip"
              :class="{ 'is-on': p.settings.buffer === buf.v }"
              :aria-pressed="p.settings.buffer === buf.v"
              @click="setBuffer(buf.v)"
            >
              {{ buf.label }}
            </button>
          </div>
          <span class="buffer__hint">≈ {{ drinksEach }} std drinks each</span>
        </div>
      </template>
    </Card>

    <!-- ── 4. The money ──────────────────────────────────────────────── -->
    <Card>
      <div class="card-head">
        <IconTile icon="euro" />
        <div class="card-head__title">The money</div>
      </div>

      <!-- two-column layout (1-col on phone) -->
      <div class="cols money" :class="{ 'cols--one': isPhone }">
        <!-- left: inputs -->
        <div class="costs">
          <div v-for="f in costFields" :key="f.key" class="cost">
            <IconTile
              :icon="f.icon"
              :size="32"
              :icon-size="15"
              tone="neutral"
            />
            <div class="cost__text">
              <div class="small-label">{{ f.label }}</div>
              <div class="cost__sub">{{ f.sub }}</div>
            </div>
            <div class="cost__box">
              <span class="cost__currency">€</span>
              <input
                :inputmode="f.inputmode"
                :aria-label="f.label"
                :value="p.settings[f.key] ?? 0"
                class="cost__input"
                @input="setCost(f.key, typed($event))"
              />
            </div>
          </div>
        </div>

        <!-- right: P&L summary -->
        <div class="pnl">
          <div class="pnl__title">If everyone comes</div>
          <div
            v-for="row in pnl"
            :key="row.label"
            class="pnl__row"
            :class="[
              `pnl__row--${row.kind}`,
              { 'is-loss': row.kind === 'profit' && row.amount < 0 },
            ]"
          >
            <span class="pnl__label">{{ row.label }}</span>
            <span class="pnl__value">{{ formatEuro(row.amount) }}</span>
          </div>
        </div>
      </div>
    </Card>

    <!-- ── 5. Getting paid ───────────────────────────────────────────── -->
    <PaymentSettings />
  </div>
</template>

<style scoped>
.plan {
  display: flex;
  flex-direction: column;
  gap: 18px;
  animation: bcFadeUp 0.3s ease both;
  padding-bottom: 32px;
}

/* ── Venue hero ── */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: var(--r);
  border: 1px solid var(--border);
}

.hero__cover {
  position: relative;
  height: 190px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.hero__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.5));
}

.hero__top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.hero__emoji {
  font-size: 40px;
  line-height: 1;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.4));
}

.hero__covers {
  display: flex;
  gap: 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 999px;
  padding: 5px;
}

.hero__swatch {
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
}

.hero__swatch.is-on {
  border-color: #fff;
}

/* The name and venue sit on the cover photo, white in both Themes. */
.hero__bottom {
  position: relative;
  color: #fff;
}

.hero__name {
  width: 100%;
  background: transparent;
  border: none;
  color: #fff;
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 26px;
  letter-spacing: -0.02em;
  padding: 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  outline: none;
}

.hero__where {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.92;
  margin-top: 2px;
}

.hero__pin {
  display: flex;
}

/* ── Cards ── */
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.card-head__title {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 16px;
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.cols--one {
  grid-template-columns: 1fr;
}

.small-label {
  font-size: 12px;
  color: var(--dim);
  font-weight: 600;
}

.gap-below {
  margin-bottom: 16px;
}

/* ── Where & when ── */
.where {
  gap: 12px;
}

/* ── Who's coming ── */
.guests__input {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 36px;
  line-height: 1;
  background: transparent;
  border: none;
  color: var(--text);
  text-align: center;
  width: 100%;
  padding: 0;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.guests__caption {
  font-size: 11px;
  color: var(--faint);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* A setting row on its own frame: the accent border when it is on. */
.setting {
  border: 1px solid var(--border);
  background: var(--surface2);
  padding: 12px 14px;
}

.setting.is-on {
  border-color: var(--accent);
}

.cap {
  border-radius: var(--rs);
  margin-bottom: 20px;
}

.cap__body {
  margin-top: 14px;
  animation: bcFadeUp 0.2s ease both;
}

.cap__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cap__value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.cap__input {
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 18px;
  line-height: 1;
  background: transparent;
  border: none;
  color: var(--accent);
  text-align: right;
  width: 56px;
  padding: 0;
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.cap__unit {
  font-size: 11px;
  color: var(--faint);
}

/* With the venue running the bar nothing follows it in the card. */
.bar {
  margin-bottom: 20px;
}

.bar.is-on {
  margin-bottom: 0;
}

.vibes__title {
  margin-bottom: 8px;
}

.vibes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.vibe {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 13px 6px;
  border-radius: var(--rs);
  min-height: 44px;
  border: 1.5px solid var(--border);
  background: var(--surface2);
}

.vibe__emoji {
  font-size: 20px;
  line-height: 1;
}

.vibe__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}

.vibe__sub {
  font-size: 10px;
  color: var(--faint);
}

.buffer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.buffer__chips {
  display: flex;
  gap: 6px;
}

.chip {
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 999px;
  min-height: 36px;
  border: 1.5px solid var(--border);
  background: var(--surface2);
  color: var(--dim);
}

.vibe.is-on,
.chip.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.vibe.is-on .vibe__label,
.chip.is-on {
  color: var(--accent);
}

.buffer__hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--faint);
}

/* ── The money ── */
.money {
  gap: 16px;
  align-items: start;
}

.costs {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.cost {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cost__text {
  flex: 1;
  min-width: 0;
}

.cost__sub {
  font-size: 10px;
  color: var(--faint);
}

.cost__box {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--rs);
  background: var(--surface2);
  overflow: hidden;
  width: 104px;
}

.cost__currency {
  padding: 0 0 0 11px;
  color: var(--faint);
  font-size: 13px;
}

.cost__input {
  font-weight: 600;
  font-size: 15px;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: var(--text);
  width: 100%;
  min-width: 0;
  min-height: unset;
}

.pnl {
  background: var(--surface2);
  border-radius: var(--rs);
  padding: 16px;
}

.pnl__title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--faint);
  margin-bottom: 12px;
}

.pnl__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 7px 0;
}

.pnl__row + .pnl__row {
  border-top: 1px solid var(--border);
}

.pnl__label {
  font-size: 13px;
  color: var(--dim);
}

.pnl__value {
  font-weight: 600;
  font-size: 13px;
  color: var(--dim);
}

.pnl__row--revenue .pnl__label,
.pnl__row--revenue .pnl__value,
.pnl__row--profit .pnl__label {
  color: var(--text);
}

.pnl__row--profit .pnl__label {
  font-weight: 700;
}

.pnl__row--profit .pnl__value {
  font-size: 15px;
  color: var(--good);
}

.pnl__row--profit.is-loss .pnl__value {
  color: var(--bad);
}
</style>
