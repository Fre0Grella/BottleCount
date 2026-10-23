<script lang="ts">
// The dialogs open right now, innermost last. Only the top one answers Escape,
// so closing a dialog opened from another leaves the outer one standing.
const openStack: symbol[] = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
</script>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useSlots,
  watch,
} from 'vue';
import CloseButton from './CloseButton.vue';
import IconTile from './IconTile.vue';
import type { IconName } from '../../lib/icons';

/**
 * The frame every dialog sits in: scrim, panel, and the dialog semantics —
 * role=dialog, aria-modal, a name, Escape to close, Tab kept inside, and focus
 * handed back to whatever opened it.
 *
 * Give it a `title` (and an `icon`) and it draws the standard header: tile,
 * title and a labelled close button, with the content padded below. Without
 * one, the content is the whole panel: name the dialog by putting the slot's
 * `titleId` on its heading, or pass `label`.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    /** sheet: slides up from the bottom; center: a card; full: the whole screen. */
    variant?: 'sheet' | 'center' | 'full';
    /** Panel max width: xs 320px, sm 420px, md 460px, lg 520px. */
    size?: 'xs' | 'sm' | 'md' | 'lg';
    title?: string;
    icon?: IconName;
    /** The dialog's name when no element in it carries `titleId`. */
    label?: string;
    closeLabel?: string;
  }>(),
  {
    variant: 'sheet',
    size: 'md',
    title: undefined,
    icon: undefined,
    label: undefined,
    closeLabel: 'Close',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const slots = useSlots();
const titleId = useId();
const panel = ref<HTMLElement | null>(null);
const hasHeader = computed(() => !!props.title || !!slots.title);

const me = Symbol('dialog');
let opener: HTMLElement | null = null;
let active = false;

function onDocumentKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || openStack[openStack.length - 1] !== me) return;
  e.preventDefault();
  emit('close');
}

function focusables(): HTMLElement[] {
  if (!panel.value) return [];
  return [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[hidden], [style*="display: none"]'),
  );
}

/** Tab and Shift+Tab wrap around inside the panel instead of leaving it. */
function onPanelKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Tab' || !panel.value) return;
  const items = focusables();
  if (!items.length) {
    e.preventDefault();
    panel.value.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement;
  const inside = current instanceof Node && panel.value.contains(current);
  if (e.shiftKey && (current === first || current === panel.value || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (current === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

function activate(): void {
  if (active) return;
  active = true;
  opener =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  openStack.push(me);
  document.addEventListener('keydown', onDocumentKeydown);
  // A dialog that focuses its own first field (AddGuestModal) keeps it.
  const current = document.activeElement;
  if (
    panel.value &&
    !(current instanceof Node && panel.value.contains(current))
  ) {
    panel.value.focus({ preventScroll: true });
  }
}

function deactivate(): void {
  if (!active) return;
  active = false;
  const at = openStack.indexOf(me);
  if (at !== -1) openStack.splice(at, 1);
  document.removeEventListener('keydown', onDocumentKeydown);
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}

// `post`: the panel is in the DOM by then, so it can take focus.
watch(
  () => props.open,
  (open) => (open ? activate() : deactivate()),
  { flush: 'post' },
);
onMounted(() => {
  if (props.open) activate();
});
onBeforeUnmount(deactivate);
</script>

<template>
  <Teleport to="body">
    <Transition :name="variant === 'full' ? 'bc-modal-full' : 'bc-modal'">
      <div v-if="open" class="bc-modal" :class="`bc-modal--${variant}`">
        <!-- A pointer shortcut; Escape and the close button are the keyboard's. -->
        <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
        <div
          v-if="variant !== 'full'"
          class="bc-modal__scrim"
          @click="emit('close')"
        />
        <!-- The dialog itself: its keydown only keeps Tab inside. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div
          ref="panel"
          class="bc-modal__panel"
          :class="`bc-modal__panel--${size}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="label ? undefined : titleId"
          :aria-label="label"
          tabindex="-1"
          @keydown="onPanelKeydown"
        >
          <div v-if="hasHeader" class="bc-modal__body">
            <div class="bc-modal__header">
              <IconTile v-if="icon" :icon="icon" :icon-size="18" />
              <h2 :id="titleId" class="bc-modal__title">
                <slot name="title">{{ title }}</slot>
              </h2>
              <CloseButton
                class="bc-modal__close"
                :label="closeLabel"
                @click="emit('close')"
              />
            </div>
            <slot :title-id="titleId" />
          </div>
          <slot v-else :title-id="titleId" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bc-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bc-modal--center {
  align-items: center;
}

/* Door mode sits under the other dialogs, as it always has. */
.bc-modal--full {
  z-index: 60;
  align-items: stretch;
}

.bc-modal__scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim);
}

.bc-modal__panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-height: 90dvh;
  overflow-y: auto;
  background: var(--surface);
  border-radius: var(--r) var(--r) 0 0;
  box-shadow: var(--shadow);
}

.bc-modal__panel:focus {
  outline: none;
}

.bc-modal--center .bc-modal__panel {
  border-radius: var(--r);
}

.bc-modal--full .bc-modal__panel {
  max-width: none;
  max-height: none;
  display: flex;
  flex-direction: column;
  background: none;
  border-radius: 0;
  box-shadow: none;
  animation: bcPop 0.2s ease both;
}

.bc-modal__panel--xs {
  max-width: 320px;
}
.bc-modal__panel--sm {
  max-width: 420px;
}
.bc-modal__panel--md {
  max-width: 460px;
}
.bc-modal__panel--lg {
  max-width: 520px;
}

.bc-modal__body {
  padding: 22px;
}

.bc-modal__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.bc-modal__title {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 17px;
  line-height: normal;
}

.bc-modal__close {
  margin-left: auto;
  flex-shrink: 0;
}

.bc-modal-enter-active,
.bc-modal-leave-active {
  transition: opacity 0.2s ease;
}
.bc-modal-enter-from,
.bc-modal-leave-to {
  opacity: 0;
}
.bc-modal-enter-active .bc-modal__panel,
.bc-modal-leave-active .bc-modal__panel {
  transition: transform 0.25s ease;
}
.bc-modal-enter-from .bc-modal__panel,
.bc-modal-leave-to .bc-modal__panel {
  transform: translateY(32px);
}
</style>
