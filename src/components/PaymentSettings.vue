<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  formatIban,
  normaliseHolder,
  normaliseIban,
  normalisePaypal,
  normaliseRevolut,
  normaliseSatispay,
} from '../../shared/payments';
import type { PaymentDetails } from '../../shared/payments';
import { useStore } from '../lib/store';
import Icon from './Icon.vue';

/**
 * Where guests pay the host — the Plan tab's "Getting paid" card.
 *
 * Each field is a draft until it validates. Writing a half-typed IBAN to the
 * party would sync it to co-organisers and, worse, show it to guests; so the
 * party only changes on blur, and only to a value that passed the same check
 * the server makes.
 */

const store = useStore();
const party = computed(() => store.activeParty());

type Field = keyof PaymentDetails;

const drafts = ref<Record<Field, string>>({
  paypal: '',
  satispay: '',
  revolut: '',
  bank_holder: '',
  bank_iban: '',
});
const errors = ref<Partial<Record<Field, string>>>({});

function display(field: Field, value: string): string {
  return field === 'bank_iban' ? formatIban(value) : value;
}

// Reload the drafts when the party changes underneath them — switching party,
// or a co-organiser's edit arriving — but not while the host is mid-edit on
// the same one, which `errors` stands in for.
watch(
  () => [party.value?.id, party.value?.payment] as const,
  ([id], previous) => {
    // A different party's half-typed mistakes are not this one's.
    if (previous && previous[0] !== id) errors.value = {};
    const payment = party.value?.payment;
    if (!payment) return;
    for (const field of Object.keys(drafts.value) as Field[]) {
      if (errors.value[field]) continue;
      drafts.value[field] = display(field, payment[field]);
    }
  },
  { immediate: true, deep: true },
);

const MESSAGES: Record<Field, string> = {
  paypal: 'That isn’t a PayPal.me username — letters and numbers only.',
  satispay: 'Paste the link the Satispay app shares (it starts with https://).',
  revolut: 'Use your Revtag (like @yourname) or a revolut.me link.',
  bank_holder: '',
  bank_iban: 'That IBAN doesn’t add up. Check it against your banking app.',
};

function normalise(field: Field, input: string): string | null {
  switch (field) {
    case 'paypal':
      return normalisePaypal(input);
    case 'satispay':
      return normaliseSatispay(input);
    case 'revolut':
      return normaliseRevolut(input);
    case 'bank_holder':
      return normaliseHolder(input);
    case 'bank_iban':
      return normaliseIban(input);
  }
}

function commit(field: Field): void {
  const value = normalise(field, drafts.value[field]);
  if (value === null) {
    errors.value[field] = MESSAGES[field];
    return;
  }
  delete errors.value[field];
  drafts.value[field] = display(field, value);
  if (party.value?.payment[field] === value) return;
  store.update((p) => {
    p.payment[field] = value;
  });
}

/** An IBAN with nobody's name on it is refused by Italian banks, so say so. */
const holderMissing = computed(() => {
  const payment = party.value?.payment;
  return !!payment?.bank_iban && !payment.bank_holder;
});

const price = computed(() => party.value?.settings.ticket_price ?? 0);

const offered = computed(() => {
  const payment = party.value?.payment;
  if (!payment) return false;
  return !!(
    payment.paypal ||
    payment.satispay ||
    payment.revolut ||
    (payment.bank_iban && payment.bank_holder)
  );
});
</script>

<template>
  <section v-if="party" class="pay-card">
    <header class="pay-head">
      <span class="pay-head__icon"><Icon name="ticket" :size="17" /></span>
      <div>
        <h3>Getting paid</h3>
        <p>
          Guests who say they’re in get a button for each way you set up here,
          for €{{ price }} — the ticket price from The money.
        </p>
      </div>
    </header>

    <div class="pay-fields">
      <label class="pay-field">
        <span class="pay-label">PayPal.me username</span>
        <input
          v-model="drafts.paypal"
          class="pay-input"
          :class="{ 'pay-input--bad': errors.paypal }"
          placeholder="paypal.me/yourname"
          autocomplete="off"
          spellcheck="false"
          @blur="commit('paypal')"
          @keyup.enter="commit('paypal')"
        />
        <span v-if="errors.paypal" class="pay-error">{{ errors.paypal }}</span>
        <span v-else class="pay-hint">
          Guests get a PayPal button with €{{ price }} already filled in.
        </span>
      </label>

      <label class="pay-field">
        <span class="pay-label">Satispay link</span>
        <input
          v-model="drafts.satispay"
          class="pay-input"
          :class="{ 'pay-input--bad': errors.satispay }"
          placeholder="https://…satispay.com/…"
          autocomplete="off"
          spellcheck="false"
          inputmode="url"
          @blur="commit('satispay')"
          @keyup.enter="commit('satispay')"
        />
        <span v-if="errors.satispay" class="pay-error">{{
          errors.satispay
        }}</span>
        <span v-else class="pay-hint">
          In Satispay, tap your photo, then your name, then “Condividi importo
          personalizzato”. Enter €{{ price }} and paste the link here.
        </span>
      </label>

      <label class="pay-field">
        <span class="pay-label">Revolut</span>
        <input
          v-model="drafts.revolut"
          class="pay-input"
          :class="{ 'pay-input--bad': errors.revolut }"
          placeholder="@yourname or revolut.me/yourname"
          autocomplete="off"
          spellcheck="false"
          @blur="commit('revolut')"
          @keyup.enter="commit('revolut')"
        />
        <span v-if="errors.revolut" class="pay-error">{{
          errors.revolut
        }}</span>
        <span v-else class="pay-hint">
          Your Revtag is enough. Guests type the €{{ price }} themselves; those
          without Revolut can pay by card if your Revtag is discoverable.
        </span>
      </label>

      <div class="pay-pair">
        <label class="pay-field">
          <span class="pay-label">Account holder</span>
          <input
            v-model="drafts.bank_holder"
            class="pay-input"
            placeholder="Name on the account"
            autocomplete="name"
            maxlength="70"
            @blur="commit('bank_holder')"
            @keyup.enter="commit('bank_holder')"
          />
        </label>
        <label class="pay-field">
          <span class="pay-label">IBAN</span>
          <input
            v-model="drafts.bank_iban"
            class="pay-input pay-input--mono"
            :class="{ 'pay-input--bad': errors.bank_iban }"
            placeholder="IT60 X054 2811 1010 0000 0123 456"
            autocomplete="off"
            spellcheck="false"
            @blur="commit('bank_iban')"
            @keyup.enter="commit('bank_iban')"
          />
        </label>
      </div>
      <span v-if="errors.bank_iban" class="pay-error">{{
        errors.bank_iban
      }}</span>
      <span v-else-if="holderMissing" class="pay-error">
        Add the account holder’s name — banks refuse a transfer without it.
      </span>
      <span v-else class="pay-hint">
        Guests see these with copy buttons and a suggested causale with their
        name, so you can tell who paid.
      </span>
    </div>

    <p class="pay-note">
      <Icon name="info" :size="13" />
      <span>
        Anyone with your invite link who says they’re in can see these details.
        BottleCount never handles the money: guests pay you directly, and you
        mark them as paid.
      </span>
    </p>
    <p v-if="offered && price <= 0" class="pay-note pay-note--warn">
      <Icon name="info" :size="13" />
      <span>The ticket price is €0, so guests won’t see an amount.</span>
    </p>
  </section>
</template>

<style scoped>
.pay-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pay-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.pay-head__icon {
  display: flex;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.pay-head h3 {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 16px;
  margin: 0;
  line-height: 34px;
}
.pay-head p {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
  line-height: 1.5;
}

.pay-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pay-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.pay-pair {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 12px;
}
@media (max-width: 640px) {
  .pay-pair {
    grid-template-columns: 1fr;
  }
}

.pay-label {
  font-size: 12px;
  color: var(--dim);
  font-weight: 600;
}
.pay-input {
  font-family: var(--font-body);
  font-size: 14px;
  padding: 10px 12px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  width: 100%;
  min-width: 0;
}
.pay-input--mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.pay-input--bad {
  border-color: var(--bad);
}
.pay-hint,
.pay-error {
  font-size: 11px;
  line-height: 1.5;
}
.pay-hint {
  color: var(--faint);
}
.pay-error {
  color: var(--bad);
}

.pay-note {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--rs);
  background: var(--surface2);
  color: var(--dim);
  font-size: 11.5px;
  line-height: 1.5;
}
.pay-note :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}
.pay-note--warn {
  color: var(--bad);
}
</style>
