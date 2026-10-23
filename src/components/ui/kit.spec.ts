/* eslint-disable vue/one-component-per-file -- small host components that bind v-model the way the screens do */
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import Toggle from './Toggle.vue';
import Stepper from './Stepper.vue';
import Field from './Field.vue';
import PillButton from './PillButton.vue';
import ProgressBar from './ProgressBar.vue';
import Card from './Card.vue';
import IconTile from './IconTile.vue';
import Slider from './Slider.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
});
function track<T extends VueWrapper>(w: T): T {
  mounted.push(w);
  return w;
}

/** A Toggle bound with v-model, the way the screens use it. */
function boundToggle(start = false) {
  const on = ref(start);
  const Host = defineComponent({
    setup: () => () =>
      h(
        Toggle,
        {
          modelValue: on.value,
          'onUpdate:modelValue': (v: boolean) => (on.value = v),
          icon: 'cart',
        },
        {
          default: () => 'Add snacks',
          description: () => 'Include nibbles in the shopping list',
        },
      ),
  });
  const w = track(mount(Host, { attachTo: document.body }));
  return { on, w, sw: () => w.get('[role="switch"]') };
}

describe('Toggle', () => {
  it('is a focusable switch named by its label and described by its hint', () => {
    const { sw } = boundToggle();
    const el = sw().element as HTMLElement;
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-checked')).toBe('false');
    const name = document.getElementById(el.getAttribute('aria-labelledby')!);
    expect(name?.textContent).toBe('Add snacks');
    const desc = document.getElementById(el.getAttribute('aria-describedby')!);
    expect(desc?.textContent?.trim()).toBe(
      'Include nibbles in the shopping list',
    );
  });

  it('flips on click, Space and Enter, once per press', async () => {
    const { on, sw } = boundToggle();
    await sw().trigger('click');
    expect(on.value).toBe(true);
    expect(sw().attributes('aria-checked')).toBe('true');
    await sw().trigger('keydown', { key: ' ' });
    expect(on.value).toBe(false);
    await sw().trigger('keydown', { key: 'Enter' });
    expect(on.value).toBe(true);
  });

  it('ignores other keys', async () => {
    const { on, sw } = boundToggle();
    await sw().trigger('keydown', { key: 'a' });
    await sw().trigger('keydown', { key: 'Tab' });
    expect(on.value).toBe(false);
  });

  it('a bare switch takes its name from `label`', () => {
    const w = track(
      mount(Toggle, { props: { modelValue: true, label: 'Snacks' } }),
    );
    const sw = w.get('[role="switch"]');
    expect(sw.attributes('aria-label')).toBe('Snacks');
    expect(sw.attributes('aria-labelledby')).toBeUndefined();
    expect(sw.attributes('aria-checked')).toBe('true');
  });
});

describe('Stepper', () => {
  function bound(start: number, min = 1, max = 3) {
    const n = ref(start);
    const Host = defineComponent({
      setup: () => () =>
        h(Stepper, {
          modelValue: n.value,
          'onUpdate:modelValue': (v: number) => (n.value = v),
          label: 'guests',
          min,
          max,
        }),
    });
    const w = track(mount(Host));
    const dec = () => w.get('button[aria-label="Decrease guests"]');
    const inc = () => w.get('button[aria-label="Increase guests"]');
    return { n, w, dec, inc };
  }

  it('names its buttons after what it counts', () => {
    const { dec, inc } = bound(2);
    expect(dec().text()).toBe('−');
    expect(inc().text()).toBe('+');
  });

  it('steps within min and max and disables the button at a bound', async () => {
    const { n, dec, inc } = bound(2);
    await inc().trigger('click');
    expect(n.value).toBe(3);
    expect(inc().attributes('disabled')).toBeDefined();
    await inc().trigger('click');
    expect(n.value).toBe(3);
    await dec().trigger('click');
    await dec().trigger('click');
    expect(n.value).toBe(1);
    expect(dec().attributes('disabled')).toBeDefined();
  });

  it('clamps a big step to the bound', async () => {
    const n = ref(25);
    const w = track(
      mount(Stepper, {
        props: {
          modelValue: n.value,
          label: 'gin',
          step: 10,
          min: 0,
          max: 30,
          unit: 'ml',
          'onUpdate:modelValue': (v: number) => (n.value = v),
        },
      }),
    );
    expect(w.text()).toContain('25 ml');
    await w.get('button[aria-label="Increase gin"]').trigger('click');
    expect(n.value).toBe(30);
  });
});

describe('Field', () => {
  it('wires the label, hint and error to the control', () => {
    const w = track(
      mount(Field, {
        props: {
          label: 'Email',
          optional: '(optional)',
          hint: 'Only for the ticket',
          error: 'Not an email',
        },
        slots: {
          default: `<template #default="{ id, describedBy, invalid }">
            <input :id="id" :aria-describedby="describedBy" :aria-invalid="invalid" />
          </template>`,
        },
      }),
    );
    const input = w.get('input');
    const label = w.get('label');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(label.text()).toContain('Email');
    expect(label.text()).toContain('(optional)');
    const ids = input.attributes('aria-describedby')!.split(' ');
    expect(ids.map((id) => w.get(`[id="${id}"]`).text())).toEqual([
      'Only for the ticket',
      'Not an email',
    ]);
    expect(input.attributes('aria-invalid')).toBe('true');
  });

  it('describes nothing when there is no hint or error', () => {
    const w = track(
      mount(Field, {
        props: { label: 'Name', id: 'guest-name' },
        slots: {
          default: `<template #default="{ id, describedBy }"><input :id="id" :aria-describedby="describedBy" /></template>`,
        },
      }),
    );
    expect(w.get('input').attributes('id')).toBe('guest-name');
    expect(w.get('input').attributes('aria-describedby')).toBeUndefined();
  });
});

describe('PillButton', () => {
  it('shows its label as text', () => {
    const w = track(
      mount(PillButton, {
        props: { label: 'Accept', icon: 'check', variant: 'good' },
      }),
    );
    expect(w.text()).toBe('Accept');
    expect(w.attributes('aria-label')).toBeUndefined();
    expect(w.attributes('type')).toBe('button');
  });

  it('an icon-only pill keeps its label as the accessible name', () => {
    const w = track(
      mount(PillButton, {
        props: { label: 'Accept', icon: 'check', iconOnly: true },
      }),
    );
    expect(w.text()).toBe('');
    expect(w.attributes('aria-label')).toBe('Accept');
  });

  it('reports pressed only when it is a toggle', () => {
    const plain = track(mount(PillButton, { props: { label: 'Send' } }));
    expect(plain.attributes('aria-pressed')).toBeUndefined();
    const paid = track(
      mount(PillButton, { props: { label: 'Paid', pressed: true } }),
    );
    expect(paid.attributes('aria-pressed')).toBe('true');
  });
});

describe('ProgressBar', () => {
  it('is a progressbar with its numbers', () => {
    const w = track(
      mount(ProgressBar, {
        props: { value: 3, max: 40, label: 'Checked in', valueText: '3 of 40' },
      }),
    );
    expect(w.attributes('role')).toBe('progressbar');
    expect(w.attributes('aria-label')).toBe('Checked in');
    expect(w.attributes('aria-valuemin')).toBe('0');
    expect(w.attributes('aria-valuemax')).toBe('40');
    expect(w.attributes('aria-valuenow')).toBe('3');
    expect(w.attributes('aria-valuetext')).toBe('3 of 40');
    expect(w.get('.bc-progress__fill').attributes('style')).toContain(
      'width: 7.5%',
    );
  });

  it('keeps the fill between empty and full', () => {
    const over = track(
      mount(ProgressBar, { props: { value: 9, max: 4, label: 'Paid' } }),
    );
    expect(over.attributes('aria-valuenow')).toBe('4');
    expect(over.get('.bc-progress__fill').attributes('style')).toContain(
      'width: 100%',
    );
    const none = track(
      mount(ProgressBar, { props: { value: 0, max: 0, label: 'Paid' } }),
    );
    expect(none.get('.bc-progress__fill').attributes('style')).toContain(
      'width: 0%',
    );
  });
});

describe('Card and IconTile', () => {
  it('a card renders as the element asked for', () => {
    const w = track(
      mount(Card, {
        props: { as: 'section', pad: 'lg', highlight: true },
        slots: { default: 'Body' },
      }),
    );
    expect(w.element.tagName).toBe('SECTION');
    expect(w.classes()).toEqual(
      expect.arrayContaining(['bc-card--lg', 'bc-card--highlight']),
    );
  });

  it('an icon tile is decorative', () => {
    const w = track(
      mount(IconTile, { props: { icon: 'cart', tone: 'muted' } }),
    );
    expect(w.attributes('aria-hidden')).toBe('true');
    expect(w.find('svg').exists()).toBe(true);
  });
});

describe('Slider', () => {
  interface SliderProps {
    label: string;
    valueText?: string;
    min?: number;
    max?: number;
    step?: number;
  }

  function boundSlider(props: SliderProps, start: number) {
    const value = ref(start);
    const Host = defineComponent({
      setup: () => () =>
        h(Slider, {
          ...props,
          modelValue: value.value,
          'onUpdate:modelValue': (v: number) => (value.value = v),
        }),
    });
    const w = track(mount(Host, { attachTo: document.body }));
    return { value, el: () => w.get('[role="slider"]') };
  }

  it('is a focusable, named slider that says its value', () => {
    const { el } = boundSlider({ label: 'Gin share', valueText: '35%' }, 0.35);
    expect(el().attributes('tabindex')).toBe('0');
    expect(el().attributes('aria-label')).toBe('Gin share');
    expect(el().attributes('aria-valuenow')).toBe('0.35');
    expect(el().attributes('aria-valuetext')).toBe('35%');
  });

  it('steps with the arrows and pages, and jumps to the ends', async () => {
    const { value, el } = boundSlider(
      { label: 'Expected guests', min: 1, max: 600, step: 1 },
      50,
    );
    await el().trigger('keydown', { key: 'ArrowRight' });
    expect(value.value).toBe(51);
    await el().trigger('keydown', { key: 'ArrowDown' });
    expect(value.value).toBe(50);
    await el().trigger('keydown', { key: 'PageUp' });
    expect(value.value).toBe(60);
    await el().trigger('keydown', { key: 'End' });
    expect(value.value).toBe(600);
    await el().trigger('keydown', { key: 'ArrowUp' });
    expect(value.value).toBe(600);
    await el().trigger('keydown', { key: 'Home' });
    expect(value.value).toBe(1);
  });

  it('steps a hundredth of the range when it has no step', async () => {
    const { value, el } = boundSlider({ label: 'Gin share' }, 0.5);
    await el().trigger('keydown', { key: 'ArrowLeft' });
    expect(value.value).toBeCloseTo(0.49);
  });

  it('leaves other keys alone', async () => {
    const { value, el } = boundSlider({ label: 'Gin share' }, 0.5);
    await el().trigger('keydown', { key: 'Tab' });
    expect(value.value).toBe(0.5);
  });
});
