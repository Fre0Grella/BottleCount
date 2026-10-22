import { describe, expect, it } from 'vitest';
import { deviceFor, watchDevice, type Device } from './device';

/** A window that is only a width and its resize listeners. */
class FakeWindow extends EventTarget {
  constructor(public innerWidth: number) {
    super();
  }

  resize(width: number): void {
    this.innerWidth = width;
    this.dispatchEvent(new Event('resize'));
  }
}

const fakeWindow = (width: number) => new FakeWindow(width);

describe('deviceFor', () => {
  it('is a phone below 700px and a desktop from there up', () => {
    expect(deviceFor(699)).toBe('phone');
    expect(deviceFor(700)).toBe('desktop');
  });
});

describe('watchDevice', () => {
  it('reports the layout at once and again on every resize', () => {
    const win = fakeWindow(1200);
    const seen: Device[] = [];
    watchDevice((d) => seen.push(d), win);
    win.resize(400);
    win.resize(900);
    expect(seen).toEqual(['desktop', 'phone', 'desktop']);
  });

  it('stops listening once it is stopped', () => {
    const win = fakeWindow(1200);
    const seen: Device[] = [];
    const stop = watchDevice((d) => seen.push(d), win);
    stop();
    win.resize(400);
    expect(seen).toEqual(['desktop']);
  });
});
