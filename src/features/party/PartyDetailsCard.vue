<script setup lang="ts">
import type { PartyDetails } from '../../../shared/details';
import { DESCRIPTION_MAX, INFO_KINDS, INFO_MAX } from '../../../shared/details';
import { INFO_FIELDS } from './partyDetails';
import { setDescription, setInfo } from './planEdits';
import Card from '../../components/ui/Card.vue';
import Field from '../../components/ui/Field.vue';
import Icon from '../../components/ui/Icon.vue';
import IconTile from '../../components/ui/IconTile.vue';

/**
 * What guests read on the invite page beyond the name, date and venue: a
 * description and a few practical lines. All optional; an empty one is not
 * shown.
 */
defineProps<{ details: PartyDetails; phone: boolean }>();

/** What an input event's field now holds. */
function typed(e: Event): string {
  return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
}
</script>

<template>
  <Card>
    <div class="card-head">
      <IconTile icon="doc" />
      <div class="card-head__title">For your guests</div>
    </div>

    <!-- ADR 0002: the invite page is public to anyone holding the link. -->
    <p class="public">
      <Icon name="info" :size="13" />
      Shown on the invite page: anyone with the link can read it.
    </p>

    <Field
      v-slot="{ id }"
      label="Description"
      optional="(optional)"
      size="sm"
      class="description"
    >
      <textarea
        :id="id"
        :value="details.description"
        :maxlength="DESCRIPTION_MAX"
        rows="4"
        placeholder="What's the party? Anything guests should know first."
        @input="setDescription(typed($event))"
      />
    </Field>

    <div class="cols info" :class="{ 'cols--one': phone }">
      <Field
        v-for="kind in INFO_KINDS"
        :key="kind"
        v-slot="{ id }"
        :label="INFO_FIELDS[kind].label"
        :icon="INFO_FIELDS[kind].icon"
        optional="(optional)"
        size="sm"
      >
        <input
          :id="id"
          type="text"
          :value="details.info[kind]"
          :maxlength="INFO_MAX"
          :placeholder="INFO_FIELDS[kind].placeholder"
          @input="setInfo(kind, typed($event))"
        />
      </Field>
    </div>
  </Card>
</template>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.card-head__title {
  font-family: var(--font-disp);
  font-weight: 600;
  font-size: 16px;
}

.public {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--faint);
}

.description {
  margin-bottom: 12px;
}

.description textarea {
  resize: vertical;
  min-height: 88px;
  line-height: 1.5;
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.cols--one {
  grid-template-columns: 1fr;
}
</style>
