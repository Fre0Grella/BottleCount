<script setup lang="ts">
import { computed } from 'vue';
import { useStore, COVERS, VIBES, BUFFERS } from '../../lib/store';
import Icon from '../Icon.vue';
import Slider from '../Slider.vue';

const store = useStore();

// ── Active party (reactive) ────────────────────────────────────────────────

const p = computed(() => store.activeParty());

// ── Venue hero ─────────────────────────────────────────────────────────────

const heroCover = computed(() => {
  const party = p.value;
  if (!party) return COVERS[0];
  return COVERS[party.cover ?? 0] ?? COVERS[0];
});

const venueWhere = computed(() => {
  const party = p.value;
  if (!party) return '';
  const parts = [party.venue.place, party.venue.city].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No venue set';
});

function onNameInput(e: Event): void {
  const val = (e.target as HTMLInputElement).value;
  store.update((party) => {
    party.name = val;
  });
}

function pickCover(i: number): void {
  store.update((party) => {
    party.cover = i;
  });
}

// ── Where & when ──────────────────────────────────────────────────────────

const isPhone = computed(() => store.state.device === 'phone');

function onVenuePlace(e: Event): void {
  const val = (e.target as HTMLInputElement).value;
  store.update((party) => {
    party.venue.place = val;
  });
}

function onVenueCity(e: Event): void {
  const val = (e.target as HTMLInputElement).value;
  store.update((party) => {
    party.venue.city = val;
  });
}

function onDate(e: Event): void {
  const val = (e.target as HTMLInputElement).value;
  store.update((party) => {
    party.date = val;
  });
}

function onTime(e: Event): void {
  const val = (e.target as HTMLInputElement).value;
  store.update((party) => {
    party.venue.time = val;
  });
}

// ── Who's coming ──────────────────────────────────────────────────────────

function guestMinus(): void {
  store.update((party) => {
    party.settings.guests = Math.max(10, party.settings.guests - 5);
  });
}

function guestPlus(): void {
  store.update((party) => {
    party.settings.guests = Math.min(600, party.settings.guests + 5);
  });
}

function onGuestsSlider(v: number): void {
  store.update((party) => {
    party.settings.guests = v;
  });
}

function pickVibe(ml: number): void {
  store.update((party) => {
    party.settings.alcohol_ml_per_person = ml;
  });
}

function pickBuffer(v: number): void {
  store.update((party) => {
    party.settings.buffer = v;
  });
}

// ~14 ml pure alcohol per standard drink; spirits ~40% ABV
// ml_per_person is total alcohol ml → std drinks = (ml * 0.4) / 14
// Keeping it simple: round(ml / 35) approximates real-world std drinks
const stdDrinks = computed(() => {
  const party = p.value;
  if (!party) return 0;
  return Math.round(party.settings.alcohol_ml_per_person / 14);
});

// ── The money ─────────────────────────────────────────────────────────────

function onTicketPrice(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value) || 0;
  store.update((party) => {
    party.settings.ticket_price = val;
  });
}

function onVenueCost(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value) || 0;
  store.update((party) => {
    party.settings.venue_cost = val;
  });
}

function onEquipmentCost(e: Event): void {
  const val = Number((e.target as HTMLInputElement).value) || 0;
  store.update((party) => {
    party.settings.equipment_cost = val;
  });
}

const calc = computed(() => store.calc());

function fmtEur(v: number): string {
  return '€' + Math.round(v).toLocaleString();
}

const pnlRows = computed(() => {
  const r = calc.value;
  const drinksAvg = (r.total_min + r.total_max) / 2;
  const profitAvg = (r.profit_min + r.profit_max) / 2;
  return [
    {
      label: 'Ticket revenue',
      v: fmtEur(r.revenue),
      lc: 'var(--text)',
      lw: '400',
      vc: 'var(--text)',
      size: '13px',
      bt: 'none',
    },
    {
      label: 'Drinks',
      v: fmtEur(drinksAvg),
      lc: 'var(--dim)',
      lw: '400',
      vc: 'var(--dim)',
      size: '13px',
      bt: '1px solid var(--border)',
    },
    {
      label: 'Fixed costs',
      v: fmtEur(r.fixed_costs),
      lc: 'var(--dim)',
      lw: '400',
      vc: 'var(--dim)',
      size: '13px',
      bt: '1px solid var(--border)',
    },
    {
      label: 'Net profit',
      v: fmtEur(profitAvg),
      lc: 'var(--text)',
      lw: '700',
      vc: profitAvg >= 0 ? 'var(--good)' : 'var(--bad)',
      size: '15px',
      bt: '1px solid var(--border)',
    },
  ];
});
</script>

<template>
  <div
    v-if="p"
    style="
      display: flex;
      flex-direction: column;
      gap: 18px;
      animation: bcFadeUp 0.3s ease both;
      padding-bottom: 32px;
    "
  >
    <!-- ── 1. Venue hero ──────────────────────────────────────────────── -->
    <div
      style="
        position: relative;
        overflow: hidden;
        border-radius: var(--r);
        border: 1px solid var(--border);
      "
    >
      <div
        :style="{ background: heroCover.grad }"
        style="
          position: relative;
          height: 190px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        "
      >
        <!-- dark scrim -->
        <div
          style="
            position: absolute;
            inset: 0;
            background: linear-gradient(
              180deg,
              rgba(0, 0, 0, 0.1),
              rgba(0, 0, 0, 0.5)
            );
          "
        />

        <!-- top row: emoji + cover picker -->
        <div
          style="
            position: relative;
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
          "
        >
          <span
            style="
              font-size: 40px;
              line-height: 1;
              filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.4));
            "
            >{{ heroCover.emoji }}</span
          >
          <div
            style="
              display: flex;
              gap: 6px;
              background: rgba(0, 0, 0, 0.3);
              border-radius: 999px;
              padding: 5px;
            "
          >
            <button
              v-for="(cover, i) in COVERS"
              :key="i"
              :title="cover.label"
              :style="{
                background: cover.grad,
                border:
                  p.cover === i ? '2px solid #fff' : '2px solid transparent',
              }"
              style="
                cursor: pointer;
                width: 22px;
                height: 22px;
                border-radius: 50%;
              "
              @click="pickCover(i)"
            />
          </div>
        </div>

        <!-- bottom row: party name + venue line -->
        <div style="position: relative; color: #fff">
          <input
            :value="p.name"
            placeholder="Party name"
            style="
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
            "
            @input="onNameInput"
          />
          <div
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              opacity: 0.92;
              margin-top: 2px;
            "
          >
            <span style="display: flex">
              <Icon name="mapPin" :size="13" />
            </span>
            {{ venueWhere }}
          </div>
        </div>
      </div>
    </div>

    <!-- ── 2. Where & when ───────────────────────────────────────────── -->
    <div
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: 18px;
      "
    >
      <!-- card header -->
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
          <Icon name="mapPin" :size="17" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 16px;
          "
        >
          Where &amp; when
        </div>
      </div>

      <!-- 2-col grid (1-col on phone) -->
      <div
        :style="{
          gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
        }"
        style="display: grid; gap: 12px"
      >
        <!-- Venue -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              text-transform: none;
              letter-spacing: normal;
            "
          >
            <span style="display: flex; color: var(--faint)">
              <Icon name="mapPin" :size="13" />
            </span>
            Venue
          </label>
          <input
            type="text"
            :value="p.venue.place"
            placeholder="Venue name"
            style="
              font-size: 14px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
              min-height: unset;
            "
            @input="onVenuePlace"
          />
        </div>

        <!-- City -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              text-transform: none;
              letter-spacing: normal;
            "
          >
            <span style="display: flex; color: var(--faint)">
              <Icon name="mapPin" :size="13" />
            </span>
            City
          </label>
          <input
            type="text"
            :value="p.venue.city"
            placeholder="City"
            style="
              font-size: 14px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
              min-height: unset;
            "
            @input="onVenueCity"
          />
        </div>

        <!-- Date -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              text-transform: none;
              letter-spacing: normal;
            "
          >
            <span style="display: flex; color: var(--faint)">
              <Icon name="calendar" :size="13" />
            </span>
            Date
          </label>
          <input
            type="date"
            :value="p.date"
            style="
              font-size: 14px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
              min-height: unset;
            "
            @input="onDate"
          />
        </div>

        <!-- Start time -->
        <div style="display: flex; flex-direction: column; gap: 6px">
          <label
            style="
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              color: var(--dim);
              font-weight: 600;
              text-transform: none;
              letter-spacing: normal;
            "
          >
            <span style="display: flex; color: var(--faint)">
              <Icon name="clock" :size="13" />
            </span>
            Start time
          </label>
          <input
            type="time"
            :value="p.venue.time"
            style="
              font-size: 14px;
              padding: 11px 13px;
              border-radius: var(--rs);
              border: 1px solid var(--border);
              background: var(--surface2);
              color: var(--text);
              min-height: unset;
            "
            @input="onTime"
          />
        </div>
      </div>
    </div>

    <!-- ── 3. Who's coming ───────────────────────────────────────────── -->
    <div
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: 18px;
      "
    >
      <!-- card header -->
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
          Who's coming
        </div>
      </div>

      <!-- stepper -->
      <div
        style="
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        "
      >
        <button
          style="
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--surface2);
            color: var(--text);
            font-size: 20px;
          "
          @click="guestMinus"
        >
          −
        </button>
        <div style="flex: 1; text-align: center">
          <div
            style="
              font-family: var(--font-disp);
              font-weight: 700;
              font-size: 36px;
              line-height: 1;
            "
          >
            {{ p.settings.guests }}
          </div>
          <div
            style="
              font-size: 11px;
              color: var(--faint);
              letter-spacing: 0.04em;
              text-transform: uppercase;
            "
          >
            expected guests
          </div>
        </div>
        <button
          style="
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--surface2);
            color: var(--text);
            font-size: 20px;
          "
          @click="guestPlus"
        >
          +
        </button>
      </div>

      <!-- guests slider -->
      <div style="margin-bottom: 20px">
        <Slider
          :model-value="p.settings.guests"
          :min="10"
          :max="600"
          :step="5"
          color="var(--accent)"
          track-color="var(--track)"
          @update:model-value="onGuestsSlider"
        />
      </div>

      <!-- how hard does it go -->
      <div
        style="
          font-size: 12px;
          color: var(--dim);
          font-weight: 600;
          margin-bottom: 8px;
        "
      >
        How hard does it go?
      </div>
      <div
        style="
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        "
      >
        <button
          v-for="vibe in VIBES"
          :key="vibe.ml"
          :style="{
            border:
              p.settings.alcohol_ml_per_person === vibe.ml
                ? '1.5px solid var(--accent)'
                : '1.5px solid var(--border)',
            background:
              p.settings.alcohol_ml_per_person === vibe.ml
                ? 'var(--accent-soft)'
                : 'var(--surface2)',
          }"
          style="
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            padding: 13px 6px;
            border-radius: var(--rs);
            min-height: 44px;
          "
          @click="pickVibe(vibe.ml)"
        >
          <span style="font-size: 20px; line-height: 1">{{ vibe.emoji }}</span>
          <span
            :style="{
              color:
                p.settings.alcohol_ml_per_person === vibe.ml
                  ? 'var(--accent)'
                  : 'var(--text)',
            }"
            style="font-size: 12px; font-weight: 700"
            >{{ vibe.label }}</span
          >
          <span style="font-size: 10px; color: var(--faint)">{{
            vibe.sub
          }}</span>
        </button>
      </div>

      <!-- buying buffer + hint -->
      <div
        style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap"
      >
        <span style="font-size: 12px; color: var(--dim); font-weight: 600"
          >Buying buffer</span
        >
        <div style="display: flex; gap: 6px">
          <button
            v-for="buf in BUFFERS"
            :key="buf.v"
            :style="{
              border:
                p.settings.buffer === buf.v
                  ? '1.5px solid var(--accent)'
                  : '1.5px solid var(--border)',
              background:
                p.settings.buffer === buf.v
                  ? 'var(--accent-soft)'
                  : 'var(--surface2)',
              color:
                p.settings.buffer === buf.v ? 'var(--accent)' : 'var(--dim)',
            }"
            style="
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
              padding: 8px 14px;
              border-radius: 999px;
              min-height: 36px;
            "
            @click="pickBuffer(buf.v)"
          >
            {{ buf.label }}
          </button>
        </div>
        <span style="margin-left: auto; font-size: 11px; color: var(--faint)"
          >≈ {{ stdDrinks }} std drinks each</span
        >
      </div>
    </div>

    <!-- ── 4. The money ──────────────────────────────────────────────── -->
    <div
      style="
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--r);
        padding: 18px;
      "
    >
      <!-- card header -->
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
          <Icon name="euro" :size="17" />
        </span>
        <div
          style="
            font-family: var(--font-disp);
            font-weight: 600;
            font-size: 16px;
          "
        >
          The money
        </div>
      </div>

      <!-- two-column layout (1-col on phone) -->
      <div
        :style="{
          gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr',
        }"
        style="display: grid; gap: 16px; align-items: start"
      >
        <!-- left: inputs -->
        <div style="display: grid; grid-template-columns: 1fr; gap: 12px">
          <!-- Ticket price -->
          <div style="display: flex; align-items: center; gap: 12px">
            <span
              style="
                display: flex;
                width: 32px;
                height: 32px;
                flex-shrink: 0;
                border-radius: 9px;
                align-items: center;
                justify-content: center;
                background: var(--surface2);
                color: var(--dim);
              "
            >
              <Icon name="ticket" :size="15" />
            </span>
            <div style="flex: 1; min-width: 0">
              <div style="font-size: 12px; color: var(--dim); font-weight: 600">
                Ticket price
              </div>
              <div style="font-size: 10px; color: var(--faint)">per person</div>
            </div>
            <div
              style="
                display: flex;
                align-items: center;
                border: 1px solid var(--border);
                border-radius: var(--rs);
                background: var(--surface2);
                overflow: hidden;
                width: 104px;
              "
            >
              <span
                style="
                  padding: 0 0 0 11px;
                  color: var(--faint);
                  font-size: 13px;
                "
                >€</span
              >
              <input
                inputmode="numeric"
                :value="p.settings.ticket_price"
                style="
                  font-weight: 600;
                  font-size: 15px;
                  padding: 10px 8px;
                  border: none;
                  background: transparent;
                  color: var(--text);
                  width: 100%;
                  min-width: 0;
                  min-height: unset;
                "
                @input="onTicketPrice"
              />
            </div>
          </div>

          <!-- Venue cost -->
          <div style="display: flex; align-items: center; gap: 12px">
            <span
              style="
                display: flex;
                width: 32px;
                height: 32px;
                flex-shrink: 0;
                border-radius: 9px;
                align-items: center;
                justify-content: center;
                background: var(--surface2);
                color: var(--dim);
              "
            >
              <Icon name="mapPin" :size="15" />
            </span>
            <div style="flex: 1; min-width: 0">
              <div style="font-size: 12px; color: var(--dim); font-weight: 600">
                Venue cost
              </div>
              <div style="font-size: 10px; color: var(--faint)">fixed fee</div>
            </div>
            <div
              style="
                display: flex;
                align-items: center;
                border: 1px solid var(--border);
                border-radius: var(--rs);
                background: var(--surface2);
                overflow: hidden;
                width: 104px;
              "
            >
              <span
                style="
                  padding: 0 0 0 11px;
                  color: var(--faint);
                  font-size: 13px;
                "
                >€</span
              >
              <input
                inputmode="numeric"
                :value="p.settings.venue_cost"
                style="
                  font-weight: 600;
                  font-size: 15px;
                  padding: 10px 8px;
                  border: none;
                  background: transparent;
                  color: var(--text);
                  width: 100%;
                  min-width: 0;
                  min-height: unset;
                "
                @input="onVenueCost"
              />
            </div>
          </div>

          <!-- Equipment cost -->
          <div style="display: flex; align-items: center; gap: 12px">
            <span
              style="
                display: flex;
                width: 32px;
                height: 32px;
                flex-shrink: 0;
                border-radius: 9px;
                align-items: center;
                justify-content: center;
                background: var(--surface2);
                color: var(--dim);
              "
            >
              <Icon name="tune" :size="15" />
            </span>
            <div style="flex: 1; min-width: 0">
              <div style="font-size: 12px; color: var(--dim); font-weight: 600">
                Equipment
              </div>
              <div style="font-size: 10px; color: var(--faint)">
                sound, lights, etc.
              </div>
            </div>
            <div
              style="
                display: flex;
                align-items: center;
                border: 1px solid var(--border);
                border-radius: var(--rs);
                background: var(--surface2);
                overflow: hidden;
                width: 104px;
              "
            >
              <span
                style="
                  padding: 0 0 0 11px;
                  color: var(--faint);
                  font-size: 13px;
                "
                >€</span
              >
              <input
                inputmode="numeric"
                :value="p.settings.equipment_cost"
                style="
                  font-weight: 600;
                  font-size: 15px;
                  padding: 10px 8px;
                  border: none;
                  background: transparent;
                  color: var(--text);
                  width: 100%;
                  min-width: 0;
                  min-height: unset;
                "
                @input="onEquipmentCost"
              />
            </div>
          </div>
        </div>

        <!-- right: P&L summary -->
        <div
          style="
            background: var(--surface2);
            border-radius: var(--rs);
            padding: 16px;
          "
        >
          <div
            style="
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.07em;
              color: var(--faint);
              margin-bottom: 12px;
            "
          >
            If everyone comes
          </div>
          <div
            v-for="(row, i) in pnlRows"
            :key="i"
            style="
              display: flex;
              align-items: baseline;
              justify-content: space-between;
              padding: 7px 0;
            "
            :style="{ borderTop: row.bt }"
          >
            <span
              :style="{ color: row.lc, fontWeight: row.lw }"
              style="font-size: 13px"
              >{{ row.label }}</span
            >
            <span
              :style="{ color: row.vc, fontSize: row.size }"
              style="font-weight: 600"
              >{{ row.v }}</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
