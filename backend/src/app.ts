import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import type { AppVariables } from './appEnv';
import { repositoriesFor } from './composition';
import type { Repositories } from './repositories/repositories';
import auth from './routes/auth';
import devAuth from './routes/devAuth';
import licences from './routes/licences';
import session from './routes/session';

export type Bindings = {
  db: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  ENVIRONMENT: string;
  /** "true" on a self-hosted deployment — see shared/tiers.ts. */
  SELF_HOSTED?: string;
};

export type App = Hono<{ Bindings: Bindings; Variables: AppVariables }>;

/** `/api/*` paths served without a session. Trailing slashes are stripped first. */
const PUBLIC_API_PATHS = new Set(['/api/session']);

/** Test seam: substitute storage without standing up a D1 binding. */
export interface AppOverrides {
  repositories?: Repositories;
}

/**
 * Every route the Worker serves.
 *
 * A function rather than a module-level `app` so tests can build a fresh one
 * per case without a stale isolate's state leaking between them.
 */
export function createApp(overrides: AppOverrides = {}): App {
  const app: App = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

  // In production the Pages Function proxy puts the frontend and this Worker on
  // one origin, so CORS never comes up. It matters for `wrangler dev`, where
  // the Astro dev server is a different port and the session cookie has to
  // survive the hop.
  app.use(
    '*',
    cors({
      origin: (origin) => origin,
      credentials: true,
    }),
  );

  app.use('*', async (c, next) => {
    c.set('repositories', overrides.repositories ?? repositoriesFor(c.env));
    return next();
  });

  app.get('/', (c) =>
    c.json({ service: 'bottlecount', environment: c.env.ENVIRONMENT }),
  );

  app.route('/auth', auth);
  // Mounted beside the Google flow because it produces the identical session;
  // the route itself refuses to run outside local/self-hosted builds.
  app.route('/auth', devAuth);

  // `/api/*` needs a session — except `/api/session` itself, which has to answer
  // for logged-out browsers because that is the free tier, not an error. The
  // exemption is named here rather than left to mount order: relying on the
  // route being registered before this middleware would make the paywall depend
  // on the order of two lines, and a later reshuffle would silently open or
  // close it.
  app.use('/api/*', async (c, next) => {
    if (PUBLIC_API_PATHS.has(c.req.path.replace(/\/$/, ''))) return next();
    const handler = jwt({
      secret: c.env.JWT_SECRET,
      alg: 'HS256',
      cookie: 'session_token',
    });
    return handler(c, next);
  });

  // Does its own optional JWT check — see routes/session.ts.
  app.route('/api/session', session);
  app.route('/api/licences', licences);

  return app;
}
