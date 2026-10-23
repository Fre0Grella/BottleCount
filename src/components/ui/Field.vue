<script setup lang="ts">
import { computed, useId } from 'vue';
import Icon from './Icon.vue';
import type { IconName } from '../../lib/icons';

/**
 * A label, the control it names, and an optional hint and error under it.
 *
 * The control goes in the default slot, which hands it `id` (for the label's
 * `for`), `describedBy` (the hint and error) and `invalid`. Inputs, textareas
 * and selects in the slot get the standard field look.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    /** Quieter text after the label, such as "(optional)". */
    optional?: string;
    icon?: IconName;
    hint?: string;
    error?: string | null;
    /** Use this id instead of a generated one. */
    id?: string;
    /** sm: 14px text, for the denser forms (the Plan tab). */
    size?: 'md' | 'sm';
  }>(),
  {
    optional: undefined,
    icon: undefined,
    hint: undefined,
    error: undefined,
    id: undefined,
    size: 'md',
  },
);

const generated = useId();
const fieldId = computed(() => props.id ?? generated);
const hintId = computed(() => `${fieldId.value}-hint`);
const errorId = computed(() => `${fieldId.value}-error`);
const describedBy = computed(
  () =>
    [props.hint && hintId.value, props.error && errorId.value]
      .filter(Boolean)
      .join(' ') || undefined,
);
</script>

<template>
  <div class="bc-field" :class="`bc-field--${size}`">
    <!-- The control comes through the slot; `for` points at its id. -->
    <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
    <label :for="fieldId" class="bc-field__label">
      <span v-if="icon" class="bc-field__icon"
        ><Icon :name="icon" :size="13"
      /></span>
      {{ label }}
      <span v-if="optional" class="bc-field__optional">{{ optional }}</span>
    </label>
    <slot :id="fieldId" :described-by="describedBy" :invalid="!!error" />
    <p v-if="hint" :id="hintId" class="bc-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="bc-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.bc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bc-field__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dim);
}

.bc-field__icon {
  display: flex;
  color: var(--faint);
}

.bc-field__optional {
  font-weight: 500;
  color: var(--faint);
}

.bc-field :slotted(input),
.bc-field :slotted(textarea),
.bc-field :slotted(select) {
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 15px;
  padding: 11px 13px;
  border-radius: var(--rs);
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
}

.bc-field--sm :slotted(input),
.bc-field--sm :slotted(textarea),
.bc-field--sm :slotted(select) {
  font-size: 14px;
}

.bc-field :slotted([aria-invalid='true']) {
  border-color: var(--bad);
}

.bc-field__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--faint);
}

.bc-field__error {
  margin: 0;
  font-size: 12px;
  color: var(--bad);
}
</style>
