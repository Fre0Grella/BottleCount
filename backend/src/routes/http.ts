import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { INVITE_ERRORS } from '../repositories/inviteRepository';
import { LICENCE_ERRORS } from '../repositories/licenceRepository';
import { MEMBER_ERRORS } from '../repositories/memberRepository';
import { PARTY_ERRORS } from '../repositories/partyRepository';
import type { Result } from '../repositories/result';
import { USER_ERRORS } from '../repositories/userRepository';

/**
 * The HTTP status of every repository error a client may be told about.
 *
 * One table, so the same failure answers the same way on every route. Anything
 * not here is ours — a ticket code that could not be drawn, a write that came
 * back empty — and answers 500 rather than being dressed up as the client's
 * mistake. Errors a route deliberately hides (a revoked co-organiser link, a
 * closed invite link) are not here either: those routes say what to answer
 * themselves.
 */
const ERROR_STATUS: Partial<Record<string, ContentfulStatusCode>> = {
  [PARTY_ERRORS.NOT_FOUND]: 404,
  /** The party predates document storage: the client has to store it first. */
  [PARTY_ERRORS.NO_DOCUMENT]: 409,
  [INVITE_ERRORS.NOT_FOUND]: 404,
  [INVITE_ERRORS.PARTY_FULL]: 409,
  [INVITE_ERRORS.ALREADY_CHECKED_IN]: 409,
  [MEMBER_ERRORS.NOT_FOUND]: 404,
  [MEMBER_ERRORS.CANNOT_REMOVE_OWNER]: 409,
  [USER_ERRORS.NOT_FOUND]: 404,
  [LICENCE_ERRORS.UNKNOWN]: 404,
  [LICENCE_ERRORS.ALREADY_REDEEMED]: 409,
};

function errorStatus(error: string): ContentfulStatusCode {
  return ERROR_STATUS[error] ?? 500;
}

/** `{ error }` with the status the table gives it. */
export function fail(c: Context, error: string): Response {
  return c.json({ error }, errorStatus(error));
}

/** The result's value as JSON through `body`, or its error through `fail`. */
export async function respond<T>(
  c: Context,
  result: Result<T>,
  body: (value: T) => unknown,
): Promise<Response> {
  if (!result.ok) return fail(c, result.error);
  return c.json(await body(result.value));
}

/**
 * The request's JSON body as a record of fields to read with the readers
 * below. Anything else — no body, bad JSON, an array — reads as no fields, so
 * a route checks what it needs once instead of first asking whether there was
 * an object at all.
 */
export async function readBody(c: Context): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * The raw request body, or null when it is empty or longer than `max` bytes.
 *
 * Read a chunk at a time and abandoned at the limit, so a client that lies
 * about its length, or sends none, still cannot make the Worker hold more than
 * `max` bytes.
 */
export async function readBytes(
  c: Context,
  max: number,
): Promise<Uint8Array | null> {
  const declared = Number(c.req.header('content-length'));
  if (declared > max) return null;
  const stream = c.req.raw.body;
  if (!stream) return null;

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (size === 0) return null;

  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/** A string field, or '' when it is missing or is not a string. */
export function text(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  return typeof value === 'string' ? value : '';
}
