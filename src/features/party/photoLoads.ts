import { ref } from 'vue';

/**
 * Which photos on a page have loaded and which have failed, so each is shown
 * only once it has loaded (ADR 0007). Until then, and for good if it fails
 * (the host just replaced it, or today's photo budget is spent), the page is
 * the one it would be without it: the gradient and emoji. Nobody sees an
 * error, a broken image or its alt text for a photo.
 *
 * One per page or card, keyed by URL, so a list of cards shares one.
 *
 * No store imports: the invite and ticket pages pull this in.
 */
export function usePhotoLoads() {
  const loaded = ref<string[]>([]);
  const failed = ref<string[]>([]);

  return {
    /** `url`, or null when there is none or it has failed: what to render. */
    usable(url: string | null | undefined): string | null {
      return url && !failed.value.includes(url) ? url : null;
    },
    /** Whether `url` has loaded and should replace the emoji cover. */
    shown(url: string | null | undefined): boolean {
      return !!url && loaded.value.includes(url);
    },
    /** For the image's `load` event. */
    onLoad(url: string | null | undefined): void {
      if (url) loaded.value = [...loaded.value, url];
    },
    /** For the image's `error` event. */
    onError(url: string | null | undefined): void {
      if (url) failed.value = [...failed.value, url];
    },
  };
}
