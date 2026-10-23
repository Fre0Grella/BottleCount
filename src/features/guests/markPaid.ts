import { mailtoUrl, whatsappUrl } from '../sharing/sendLinks';
import {
  sendRoute,
  signedTicketLink,
  ticketEmailSubject,
  ticketMessage,
} from '../tickets/ticketMessage';
import type { Invite, Party } from '../../lib/types';

/** What marking a guest as paid needs from the store. */
export interface PaidActions {
  setInvitePaid(id: number, paid: boolean): Promise<unknown>;
  openSendTicket(id: number): void;
}

/** The browser, as far as sending a ticket goes. */
export type PaidWindow = Pick<Window, 'open'> & {
  location: Pick<Location, 'href'>;
};

/**
 * Marks a guest as paid and, since the ticket is what they paid for, starts
 * sending it: straight into WhatsApp or the mail app when they left only one
 * way to reach them, the Send sheet otherwise. Un-marking only un-marks.
 *
 * Paid is set on this device first (see `setInvitePaid`), which is what lets
 * the ticket be made at all. The WhatsApp tab is opened here, inside the tap,
 * and pointed at the chat once the ticket is signed — opened after the await,
 * a popup blocker would swallow it.
 */
export async function togglePaid(
  actions: PaidActions,
  party: Party | null | undefined,
  inv: Invite,
  win: PaidWindow = window,
): Promise<void> {
  if (inv.paidAt) {
    void actions.setInvitePaid(inv.id, false);
    return;
  }

  const route = sendRoute(inv);
  const tab = route === 'whatsapp' ? win.open('', '_blank') : null;
  const marked = actions.setInvitePaid(inv.id, true);

  if (route === 'sheet') {
    actions.openSendTicket(inv.id);
    await marked;
    return;
  }

  try {
    if (!party) throw new Error('no party');
    const link = await signedTicketLink(party, inv.id);
    const message = ticketMessage(party, inv.name, link);
    if (route === 'whatsapp') {
      const url = whatsappUrl(message, inv.phone);
      if (tab) tab.location.href = url;
      else win.location.href = url;
    } else {
      win.location.href = mailtoUrl(
        ticketEmailSubject(party),
        message,
        inv.email,
      );
    }
  } catch {
    // No ticket to send: close the blank tab rather than leave it behind. The
    // guest stays marked paid, and the Send button is there to try again.
    tab?.close();
  }
  await marked;
}
