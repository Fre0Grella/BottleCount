/**
 * Which layout the planner uses: the phone one below 700px, the desktop one
 * above. Read from the window's width, not the user agent — a narrow desktop
 * window gets the phone layout, which is what fits it.
 */
export type Device = 'desktop' | 'phone';

const PHONE_MAX_WIDTH = 700;

/** The window the layout is read from. Just what is used, so a test can fake it. */
type DeviceWindow = Pick<
  Window,
  'innerWidth' | 'addEventListener' | 'removeEventListener'
>;

export function deviceFor(width: number): Device {
  return width < PHONE_MAX_WIDTH ? 'phone' : 'desktop';
}

/**
 * Calls `onChange` with the layout now and on every resize. Returns the
 * function that stops listening.
 */
export function watchDevice(
  onChange: (device: Device) => void,
  win: DeviceWindow = window,
): () => void {
  const read = () => onChange(deviceFor(win.innerWidth));
  read();
  win.addEventListener('resize', read);
  return () => win.removeEventListener('resize', read);
}
