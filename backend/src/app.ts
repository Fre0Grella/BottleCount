import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import type { AppVariables, Bindings } from './appEnv';
import { repositoriesFor } from './composition';
import type { Repositories } from './repositories/repositories';
import auth from './routes/auth';
import collaborate from './routes/collaborate';
import devAuth from './routes/devAuth';
import guestGoogle from './routes/guestGoogle';
import { resolveFrontendUrl } from './routes/frontendUrl';
import invites from './routes/invites';
import tickets from './routes/tickets';
import licences from './routes/licences';
import parties from './routes/parties';
import session from './routes/session';

export type { Bindings };

export type App = Hono<{ Bindings: Bindings; Variables: AppVariables }>;

/** The only origin CORS may grant: the frontend's, scheme and host alone. */
function frontendOrigin(env: Bindings): string {
  return new URL(resolveFrontendUrl(env)).origin;
}

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
  // one origin, and in development the Astro dev server's proxy does the same
  // (astro.config.mjs), so CORS normally never comes up. It is kept for one
  // origin only — the frontend's own, for a page that calls the Worker's port
  // directly. Reflecting any origin with credentials, as this once did, would
  // hand every website a credentialed read of the API the moment the session
  // cookie stopped being SameSite.
  app.use(
    '*',
    cors({
      origin: (origin, c) =>
        origin === frontendOrigin(c.env as Bindings) ? origin : null,
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
  // A guest's "Continue with Google". Creates no user and no session — see the
  // route for why it is not the host sign-in above.
  app.route('/auth', guestGoogle);

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
  app.route('/api/parties', parties);
  app.route('/api/collaborate', collaborate);

  // Mounted outside /api/* on purpose: guests have no account, and being able
  // to RSVP without signing up is most of what an invite link is for. The
  // handlers are written knowing the URL is the only credential.
  app.route('/invite', invites);
  // Same reasoning: whoever holds a short ticket link opens it without an
  // account, so the slug is the credential (see routes/tickets.ts).
  app.route('/ticket', tickets);

  return app;
}
