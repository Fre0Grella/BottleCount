<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStore } from '../../store/store';
import {
  photoSrc,
  photosOffered,
  removePartyPhoto,
  setPartyPhoto,
} from './coverPhotoEdits';
import Icon from '../../components/ui/Icon.vue';

/**
 * The party's own photo or poster, on the Plan tab's cover. Shown whole, never
 * cropped: a poster with the details written on it is the common case, and its
 * text must survive. Absent on a deployment with no photo storage.
 */
const store = useStore();
const party = computed(() => store.activeParty());

const offered = computed(photosOffered);
const src = computed(() => photoSrc(party.value));

/** The photo this thumbnail failed to load, so a new one gets its chance. */
const failed = ref<string | null>(null);
const shown = computed(() => (src.value !== failed.value ? src.value : null));

const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

function choose(): void {
  error.value = null;
  fileInput.value?.click();
}

async function run(action: () => Promise<string | null>): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    error.value = await action();
  } finally {
    busy.value = false;
  }
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  // Cleared so picking the same file again still fires `change`.
  input.value = '';
  if (file) await run(() => setPartyPhoto(file));
}
</script>

<template>
  <div v-if="offered" class="photo">
    <a
      v-if="shown"
      :href="shown"
      target="_blank"
      rel="noopener"
      class="photo__thumb"
      aria-label="Open the party photo"
    >
      <img :src="shown" alt="" @error="failed = shown" />
    </a>

    <div class="photo__actions">
      <button type="button" class="photo__btn" :disabled="busy" @click="choose">
        <Icon :name="busy ? 'loader' : 'image'" :size="13" />
        {{ busy ? 'Saving…' : src ? 'Change' : 'Poster or photo' }}
      </button>
      <button
        v-if="src && !busy"
        type="button"
        class="photo__btn"
        aria-label="Remove the party photo"
        @click="run(removePartyPhoto)"
      >
        <Icon name="x" :size="13" />
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="photo__file"
      tabindex="-1"
      aria-hidden="true"
      @change="onFile"
    />
    <p v-if="error" class="photo__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.photo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

/* Contained, not cropped: a poster's text stays whole. */
.photo__thumb {
  display: flex;
  width: 72px;
  height: 72px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}

.photo__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.photo__actions {
  display: flex;
  gap: 6px;
}

/* On the cover, white in both Themes, like the cover picker beside it. */
.photo__btn {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 6px 11px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.photo__btn:disabled {
  cursor: progress;
  opacity: 0.8;
}

.photo__file {
  display: none;
}

.photo__error {
  margin: 0;
  max-width: 220px;
  padding: 6px 9px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  text-align: right;
}
</style>
