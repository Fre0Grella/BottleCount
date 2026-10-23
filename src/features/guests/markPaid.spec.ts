import { beforeEach, describe, expect, it, vi } from 'vitest';
import { togglePaid, type PaidWindow } from './markPaid';
import type { Invite, Party } from '../../lib/types';

const link = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock('../tickets/ticketMessage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tickets/ticketMessage')>()),
  signedTicketLink: link,
}));

const party = { name: 'Gin night', date: '2026-11-07' } as Party;

function guest(over: Partial<Invite> = {}): Invite {
  return {
    id: 7,
    name: 'Bea',
    status: 'confirmed',
    depth: 0,
    referrer: null,
    used: false,
    ...over,
  };
}

/** The store's two actions, with a log of what was called in what order. */
function setup() {
  const calls: string[] = [];
  const tab = { location: { href: '' }, close: vi.fn() };
  const win = {
    open: vi.fn(() => {
      calls.push('open');
      return tab;
    }),
    location: { href: '' },
  };
  const actions = {
    setInvitePaid: vi.fn((_id: number, paid: boolean) => {
      calls.push(`paid:${paid}`);
      return Promise.resolve();
    }),
    openSendTicket: vi.fn(() => calls.push('sheet')),
  };
  return { calls, tab, win, actions };
}

beforeEach(() => {
  link.mockReset();
  link.mockResolvedValue('https://bottle.count/t/abc');
});

describe('togglePaid', () => {
  it('un-marking only un-marks', async () => {
    const { calls, actions, win } = setup();
    await togglePaid(
      actions,
      party,
      guest({ paidAt: '2026-10-20T10:00:00Z', phone: '+393331234567' }),
      win as unknown as PaidWindow,
    );
    expect(calls).toEqual(['paid:false']);
    expect(link).not.toHaveBeenCalled();
  });

  it('opens the Send sheet for a guest with both ways to reach them', async () => {
    const { calls, actions, win } = setup();
    await togglePaid(
      actions,
      party,
      guest({ email: 'bea@example.com', phone: '+393331234567' }),
      win as unknown as PaidWindow,
    );
    expect(calls).toEqual(['paid:true', 'sheet']);
    expect(actions.openSendTicket).toHaveBeenCalledWith(7);
  });

  it('opens the Send sheet for a guest with no contact yet', async () => {
    const { calls, actions, win } = setup();
    await togglePaid(actions, party, guest(), win as unknown as PaidWindow);
    expect(calls).toEqual(['paid:true', 'sheet']);
  });

  it('opens the WhatsApp tab inside the tap, then points it at the chat', async () => {
    const { calls, actions, win, tab } = setup();
    const done = togglePaid(
      actions,
      party,
      guest({ phone: '+39 333 123 4567' }),
      win as unknown as PaidWindow,
    );
    // Before anything is awaited, or a popup blocker swallows it.
    expect(calls).toEqual(['open', 'paid:true']);
    await done;
    expect(tab.location.href).toMatch(/^https:\/\/wa\.me\/393331234567\?text=/);
    expect(decodeURIComponent(tab.location.href)).toContain(
      'https://bottle.count/t/abc',
    );
    expect(win.location.href).toBe('');
  });

  it('sends a guest with only an email to the mail app', async () => {
    const { actions, win } = setup();
    await togglePaid(
      actions,
      party,
      guest({ email: 'bea@example.com' }),
      win as unknown as PaidWindow,
    );
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href).toMatch(/^mailto:bea@example\.com\?/);
  });

  it('closes the blank tab when the ticket cannot be made', async () => {
    const { actions, win, tab } = setup();
    link.mockRejectedValue(new Error('no key'));
    await togglePaid(
      actions,
      party,
      guest({ phone: '+393331234567' }),
      win as unknown as PaidWindow,
    );
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
    expect(actions.setInvitePaid).toHaveBeenCalledWith(7, true);
  });

  it('closes the blank tab when there is no party', async () => {
    const { win, tab, actions } = setup();
    await togglePaid(
      actions,
      null,
      guest({ phone: '+393331234567' }),
      win as unknown as PaidWindow,
    );
    expect(tab.close).toHaveBeenCalled();
  });
});
