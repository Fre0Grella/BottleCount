import { vi } from 'vitest';

/** What a mocked Worker answers: a JSON value, raw text, or no answer at all. */
export type FakeAnswer =
  | { status?: number; json: unknown }
  | { status?: number; text: string | null }
  | 'offline';

/**
 * Replaces `fetch` with one that answers each call in turn (the last answer
 * repeats). Undo with `vi.unstubAllGlobals()`.
 */
export function fakeWorker(...answers: FakeAnswer[]): ReturnType<typeof vi.fn> {
  let call = 0;
  const fake = vi.fn(() => {
    const answer = answers[Math.min(call++, answers.length - 1)];
    if (answer === undefined || answer === 'offline') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    const body = 'json' in answer ? JSON.stringify(answer.json) : answer.text;
    return Promise.resolve(
      new Response(body, { status: answer.status ?? 200 }),
    );
  });
  vi.stubGlobal('fetch', fake);
  return fake;
}

/** The method, path and JSON body of the `n`th call to the fake. */
export function sent(
  fake: ReturnType<typeof vi.fn>,
  n = 0,
): { method: string; path: string; body: unknown } {
  const [path, init] = fake.mock.calls[n] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    path,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  };
}
