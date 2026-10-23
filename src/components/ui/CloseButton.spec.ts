import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CloseButton from './CloseButton.vue';

describe('CloseButton', () => {
  it('is a button named by its label', () => {
    const w = mount(CloseButton, { props: { label: 'Close ticket' } });
    const b = w.get('button');
    expect(b.attributes('type')).toBe('button');
    expect(b.attributes('aria-label')).toBe('Close ticket');
    expect(b.find('svg').exists()).toBe(true);
    expect(b.text()).toBe('');
  });

  it('passes its click and its class through', async () => {
    const onClick = vi.fn();
    const w = mount(CloseButton, {
      props: { label: 'Close' },
      attrs: { class: 'corner', onClick },
    });
    expect(w.get('button').classes()).toContain('corner');
    await w.get('button').trigger('click');
    expect(onClick).toHaveBeenCalledOnce();
  });
});
