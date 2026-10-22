/**
 * The one way the app talks to the Worker.
 *
 * Every call resolves — none throws — to either the parsed body or an
 * {@link ApiError} saying which of three things went wrong. Callers branch on
 * that type rather than on strings, so "the server said 404" and "the phone is
 * offline" cannot be confused: the ticket page forgets a link on the first and
 * reopens its cached copy on the second.
 */

/** Why a request failed. */
export type ApiError =
  /** The server answered with a non-2xx status. */
  | {
      kind: 'http';
      status: number;
      /** The server's `error` field, when the body had one. */
      code: string | null;
      /** The parsed error body, for the few answers that carry data. */
      body: unknown;
    }
  /** The request never got an answer: offline, DNS, CORS, an aborted fetch. */
  | { kind: 'network' }
  /**
   * A 2xx whose body is not what the endpoint returns — an HTML page from a
   * Pages project with no backend behind it, say.
   */
  | { kind: 'bad_response' };

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON. Leave out for a request with no body. */
  body?: unknown;
}

function codeOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const { error } = body as { error?: unknown };
  return typeof error === 'string' ? error : null;
}

/**
 * Calls the Worker and reads its JSON answer.
 *
 * A 2xx with an empty body (a 204, or a DELETE that returns nothing) resolves
 * to `undefined`, so `T` is `void` for those endpoints.
 */
export async function request<T>(
  path: string,
  { method = 'GET', body }: RequestOptions = {},
): Promise<ApiResult<T>> {
  let res: Response;
  let text: string;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    text = await res.text();
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  let parsed: unknown;
  let parsedOk = true;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsedOk = false;
  }

  if (res.ok) {
    return parsedOk
      ? { ok: true, value: parsed as T }
      : { ok: false, error: { kind: 'bad_response' } };
  }
  return {
    ok: false,
    error: {
      kind: 'http',
      status: res.status,
      code: codeOf(parsed),
      body: parsedOk ? parsed : null,
    },
  };
}

/**
 * Reshapes a successful answer, turning one that lacks what the endpoint
 * promised into a `bad_response` rather than a success with nothing in it.
 */
export function mapResult<T, U>(
  result: ApiResult<T>,
  pick: (value: T) => U | undefined,
): ApiResult<U> {
  if (!result.ok) return result;
  const value = pick(result.value);
  return value === undefined
    ? { ok: false, error: { kind: 'bad_response' } }
    : { ok: true, value };
}

/** Whether the server said the thing asked for does not exist (any more). */
export function isNotFound(error: ApiError): boolean {
  return error.kind === 'http' && error.status === 404;
}

/**
 * The error as one string, for state that holds a reason rather than a branch
 * (`publishError`, `syncError`) and for message tables keyed by the server's
 * codes: the server's code, else `http_<status>`, `network_error` or
 * `bad_response`.
 */
export function errorCode(error: ApiError): string {
  switch (error.kind) {
    case 'http':
      return error.code ?? `http_${error.status}`;
    case 'network':
      return 'network_error';
    case 'bad_response':
      return 'bad_response';
  }
}
