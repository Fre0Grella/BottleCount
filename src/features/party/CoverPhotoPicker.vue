<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import type { PhotoSlot } from '../../../shared/coverPhotos';
import {
  BANNER_ASPECT,
  BANNER_RECOMMENDED_WIDTH,
} from '../../../shared/coverPhotos';
import { useStore } from '../../store/store';
import {
  photoSrc,
  photosOffered,
  removePartyPhoto,
  setPartyPhoto,
} from './coverPhotoEdits';
import type { CropRect } from './bannerCrop';
import BannerCropModal from './BannerCropModal.vue';
import Icon from '../../components/ui/Icon.vue';

/**
 * One of the party's photos, on the Plan tab's cover: the banner, which the
 * cover itself then shows, or the poster, shown here as a thumbnail, whole and
 * never cropped, since its text must survive. Absent on a deployment with no
 * photo storage.
 */
/** Which photo: named `photo` because `slot` is Vue's own attribute. */
const props = defineProps<{ photo: PhotoSlot }>();

/** What each slot's buttons say. */
const LABELS: Record<PhotoSlot, { add: string; change: string; noun: string }> =
  {
    banner: { add: 'Banner photo', change: 'Change banner', noun: 'banner' },
    poster: { add: 'Poster', change: 'Change poster', noun: 'poster' },
  };
const label = computed(() => LABELS[props.photo]);

const store = useStore();
const party = computed(() => store.activeParty());

const offered = computed(photosOffered);
const src = computed(() => photoSrc(party.value, props.photo));
/** What a banner should be, in the units hosts' photo apps show. */
const bannerHint = `Best at ${BANNER_RECOMMENDED_WIDTH} × ${Math.round(
  BANNER_RECOMMENDED_WIDTH / BANNER_ASPECT,
)} px or larger`;

/** The banner needs no thumbnail: the cover behind these buttons is it. */
const thumbnail = computed(() => props.photo === 'poster');

/**
 * The thumbnail shows once loaded, and not at all if it fails (today's photo
 * budget spent, say). A new photo gets its own chance.
 */
const failed = ref<string | null>(null);
const loaded = ref<string | null>(null);
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
  if (!file) return;
  // A banner is framed first; a poster goes up whole.
  if (props.photo === 'banner') framing.value = file;
  else await run(() => setPartyPhoto(props.photo, file));
}

/**
 * The banner photo being framed, while the crop modal is open. Shallow: a File
 * wrapped in Vue's reactive proxy is refused by createImageBitmap and
 * URL.createObjectURL.
 */
const framing = shallowRef<Blob | null>(null);

async function onFramed(crop: CropRect): Promise<void> {
  const file = framing.value;
  framing.value = null;
  if (file) await run(() => setPartyPhoto('banner', file, crop));
}
</script>

<template>
  <div v-if="offered" class="photo">
    <a
      v-if="thumbnail && shown"
      v-show="loaded === shown"
      :href="shown"
      target="_blank"
      rel="noopener"
      class="photo__thumb"
      :aria-label="`Open the ${label.noun} full size`"
    >
      <img :src="shown" alt="" @load="loaded = shown" @error="failed = shown" />
    </a>

    <div class="photo__actions">
      <button type="button" class="photo__btn" :disabled="busy" @click="choose">
        <Icon :name="busy ? 'loader' : 'image'" :size="13" />
        {{ busy ? 'Saving…' : src ? label.change : label.add }}
      </button>
      <button
        v-if="src && !busy"
        type="button"
        class="photo__btn"
        :aria-label="`Remove the ${label.noun}`"
        @click="run(() => removePartyPhoto(photo))"
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
    <p v-if="photo === 'banner' && !error" class="photo__hint">
      {{ bannerHint }}
    </p>
    <p v-if="error" class="photo__error" role="alert">{{ error }}</p>

    <BannerCropModal
      v-if="photo === 'banner'"
      :file="framing"
      @cancel="framing = null"
      @confirm="onFramed"
    />
  </div>
</template>

<style scoped>
.photo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 6px;
  max-width: 100%;
}

/* Beside its buttons rather than above them, so the cover stays short.
   Contained, not cropped: a poster's text stays whole. */
.photo__thumb {
  display: flex;
  flex: none;
  width: 52px;
  height: 52px;
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

.photo__btn,
.photo__actions {
  flex: none;
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

/* Small, under the buttons, white on the cover like they are. */
.photo__hint {
  flex-basis: 100%;
  margin: 0;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.82);
  text-align: right;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.photo__error {
  flex-basis: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 6px 9px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  text-align: right;
}
</style>
