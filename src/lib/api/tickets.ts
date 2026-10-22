import type { TicketLinkDTO } from '../../../shared/ticketLinks';
import { mapResult, request, type ApiResult } from './request';

/**
 * Hands the server a guest's signed ticket for their short link (#41) and
 * returns its slug. The same slug every time for the same guest.
 */
export async function storeTicketLink(
  partyId: string,
  inviteId: string,
  signed: string,
): Promise<ApiResult<string>> {
  const result = await request<{ slug?: string } | undefined>(
    `/api/parties/${encodeURIComponent(partyId)}/invites/${encodeURIComponent(inviteId)}/ticket`,
    { method: 'PUT', body: { signed } },
  );
  return mapResult(result, (body) => body?.slug || undefined);
}

/**
 * The ticket a short link names. A 404 (`isNotFound`) when it is gone or never
 * was; any other failure says nothing about the ticket itself.
 */
export function fetchTicketLink(
  slug: string,
): Promise<ApiResult<TicketLinkDTO>> {
  return request(`/ticket/${encodeURIComponent(slug)}`);
}
