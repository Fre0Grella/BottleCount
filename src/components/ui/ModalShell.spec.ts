/* eslint-disable vue/one-component-per-file -- small host components that bind v-model the way the screens do */
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import ModalShell from './ModalShell.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
  document.body.innerHTML = '';
});

/**
 * A page with an opener button and a dialog holding two fields, wired the way
 * the app's dialogs are: `open` comes from state, `close` sets it back.
 */
function page(props: Record<string, unknown> = { title: 'Add a guest' }) {
  const open = ref(false);
  const Page = defineComponent({
    setup: () => () =>
      h('div', [
        h(
          'button',
          { id: 'opener', onClick: () => (open.value = true) },
          'Open',
        ),
        h(
          ModalShell,
          { open: open.value, ...props, onClose: () => (open.value = false) },
          {
            default: () => [
              h('input', { id: 'first' }),
              h('button', { id: 'last' }, 'Save'),
            ],
          },
        ),
      ]),
  });
  const wrapper = mount(Page, { attachTo: document.body });
  mounted.push(wrapper);
  return { open, wrapper };
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const byId = (id: string) => document.getElementById(id) as HTMLElement;

async function openFromOpener(open: { value: boolean }) {
  byId('opener').focus();
  open.value = true;
  await nextTick();
  await nextTick();
}

function press(key: string, target: EventTarget, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
}

describe('ModalShell', () => {
  it('is a modal dialog named by its title, with a labelled close button', async () => {
    const { open } = page();
    await openFromOpener(open);
    const d = dialog()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(d.getAttribute('aria-labelledby')!);
    expect(title?.textContent?.trim()).toBe('Add a guest');
    const close = d.querySelector('button[aria-label="Close"]');
    expect(close).not.toBeNull();
  });

  it('takes an aria-label instead when there is no title', async () => {
    const { open } = page({ label: 'Ticket for Giulia' });
    await openFromOpener(open);
    expect(dialog()!.getAttribute('aria-label')).toBe('Ticket for Giulia');
    expect(dialog()!.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('moves focus into the panel on open', async () => {
    const { open } = page();
    await openFromOpener(open);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape and hands focus back to the opener', async () => {
    const { open } = page();
    await openFromOpener(open);
    press('Escape', document.activeElement!);
    expect(open.value).toBe(false);
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(byId('opener'));
  });

  it('closes from the close button and the scrim', async () => {
    const { open } = page();
    await openFromOpener(open);
    dialog()!.querySelector<HTMLElement>('button[aria-label="Close"]')!.click();
    expect(open.value).toBe(false);
    await openFromOpener(open);
    document.querySelector<HTMLElement>('.bc-modal__scrim')!.click();
    expect(open.value).toBe(false);
  });

  it('keeps Tab inside the panel, both ways', async () => {
    const { open } = page();
    await openFromOpener(open);
    const close = dialog()!.querySelector<HTMLElement>(
      'button[aria-label="Close"]',
    )!;
    // Order inside: close button (header), #first, #last.
    byId('last').focus();
    const forward = press('Tab', byId('last'));
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);

    const back = press('Tab', close, { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('last'));

    // In the middle, Tab is left to the browser.
    byId('first').focus();
    expect(press('Tab', byId('first')).defaultPrevented).toBe(false);
  });

  it('does not take focus back from a field the dialog focuses itself', async () => {
    const open = ref(false);
    const Page = defineComponent({
      setup: () => () =>
        h(
          ModalShell,
          {
            open: open.value,
            title: 'Add',
            onClose: () => (open.value = false),
          },
          { default: () => h('input', { id: 'name' }) },
        ),
    });
    mounted.push(mount(Page, { attachTo: document.body }));
    open.value = true;
    await nextTick();
    byId('name').focus(); // what AddGuestModal does on nextTick
    await nextTick();
    expect(document.activeElement).toBe(byId('name'));
  });

  it('only the top dialog answers Escape', async () => {
    const outer = ref(true);
    const inner = ref(true);
    const Page = defineComponent({
      setup: () => () =>
        h('div', [
          h(ModalShell, {
            open: outer.value,
            title: 'Outer',
            onClose: () => (outer.value = false),
          }),
          h(ModalShell, {
            open: inner.value,
            title: 'Inner',
            onClose: () => (inner.value = false),
          }),
        ]),
    });
    mounted.push(mount(Page, { attachTo: document.body }));
    await nextTick();
    press('Escape', document.body);
    expect(inner.value).toBe(false);
    expect(outer.value).toBe(true);
    await nextTick();
    press('Escape', document.body);
    expect(outer.value).toBe(false);
  });

  it('stops listening for Escape once closed', async () => {
    const wrapper = mount(ModalShell, {
      props: { open: true, title: 'Add' },
      attachTo: document.body,
    });
    mounted.push(wrapper);
    await nextTick();
    await wrapper.setProps({ open: false });
    press('Escape', document.body);
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});
