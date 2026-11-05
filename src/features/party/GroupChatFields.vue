<script setup lang="ts">
import { computed } from 'vue';
import type { GroupChat } from '../../../shared/groupChat';
import {
  GROUP_LABEL_MAX,
  GROUP_URL_MAX,
  defaultGroupLabel,
  groupApp,
  groupChatFor,
  groupChatHref,
} from '../../../shared/groupChat';
import { groupChatHint } from './groupChatHint';
import { setGroupChatLabel, setGroupChatUrl } from './planEdits';
import Field from '../../components/ui/Field.vue';
import Icon from '../../components/ui/Icon.vue';
import GroupChatButton from './GroupChatButton.vue';

/**
 * The party's group chat, a section of the "For your guests" card: the invite
 * link and the text on the button guests tap. Shown only to guests who say
 * yes, with a live copy of the button.
 */
const props = defineProps<{ chat: GroupChat; phone: boolean }>();

const hint = computed(() => groupChatHint(props.chat.url));
const app = computed(() => {
  const href = groupChatHref(props.chat.url);
  return href ? groupApp(href) : 'other';
});
const preview = computed(() => groupChatFor(props.chat));

/** What an input event's field now holds. */
function typed(e: Event): string {
  return (e.target as HTMLInputElement).value;
}
</script>

<template>
  <section class="group" aria-labelledby="group-chat-title">
    <h3 id="group-chat-title" class="group__title">
      <Icon name="message" :size="14" />
      Group chat
    </h3>

    <p class="private">
      <Icon name="lock" :size="13" />
      Only guests who say yes see it: anyone with the link can join.
    </p>

    <div class="cols" :class="{ 'cols--one': phone }">
      <Field
        v-slot="{ id, describedBy, invalid }"
        label="Invite link"
        icon="link"
        optional="(optional)"
        size="sm"
        :hint="hint.error ? undefined : hint.text"
        :error="hint.error ? hint.text : null"
      >
        <input
          :id="id"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          :value="chat.url"
          :maxlength="GROUP_URL_MAX"
          :aria-describedby="describedBy"
          :aria-invalid="invalid || undefined"
          placeholder="https://chat.whatsapp.com/..."
          @input="setGroupChatUrl(typed($event))"
        />
      </Field>
      <Field
        v-slot="{ id }"
        label="Button text"
        icon="pencil"
        optional="(optional)"
        size="sm"
      >
        <input
          :id="id"
          type="text"
          :value="chat.label"
          :maxlength="GROUP_LABEL_MAX"
          :placeholder="defaultGroupLabel(app)"
          @input="setGroupChatLabel(typed($event))"
        />
      </Field>
    </div>

    <div v-if="preview" class="preview">
      <span class="preview__caption">What guests see after they say yes</span>
      <GroupChatButton :chat="preview" />
    </div>
  </section>
</template>

<style scoped>
.group {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.group__title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
}

.private {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--faint);
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.cols--one {
  grid-template-columns: 1fr;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  max-width: 360px;
}

.preview__caption {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--faint);
}
</style>
