import { sign } from 'hono/jwt';
import { createApp, type Bindings } from '../../app';
import type { Repositories } from '../../repositories/repositories';

export const JWT_SECRET = 'test-secret';

/**
 * Bindings for a case. `db` is present only to satisfy the type — every test
 * passes fake repositories, so nothing ever reaches through it.
 */
export function testEnv(overrides: Partial<Bindings> = {}): Bindings {
  return {
    db: null as unknown as D1Database,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    JWT_SECRET,
    FRONTEND_URL: 'http://localhost:4321',
    ENVIRONMENT: 'test',
    ...overrides,
  };
}

/** A `session_token` cookie header for `userId`. */
export async function sessionCookie(userId: string): Promise<string> {
  const token = await sign(
    {
      sub: userId,
      email: 'host@example.com',
      name: 'Host',
      picture: null,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    JWT_SECRET,
    'HS256',
  );
  return `session_token=${token}`;
}

export interface RequestOptions {
  repositories: Repositories;
  env?: Partial<Bindings>;
  cookie?: string;
  method?: string;
  body?: unknown;
}

export async function request(
  path: string,
  { repositories, env, cookie, method = 'GET', body }: RequestOptions,
): Promise<Response> {
  const app = createApp({ repositories });
  const headers: Record<string, string> = {};
  if (cookie) headers['cookie'] = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return app.request(
    `http://localhost${path}`,
    {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    testEnv(env),
  );
}
