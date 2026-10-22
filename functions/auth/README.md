# Why these are separate files and not one catchall

Pages Functions win over static assets on the same path. A
`functions/auth/[[catchall]].ts` would therefore swallow `/auth/callback` —
which is a real page the app serves after Google redirects back — and hand it to
a Worker that has no such route, producing a 404 at the last step of every
sign-in.

So each backend auth endpoint is named explicitly (`guest-google/` holds the
two routes of a guest's "Continue with Google"), and every other `/auth/*`
path stays a static page. Adding a route to `backend/src/routes/auth.ts` means
adding a file here too, and an entry to `DEV_PROXY_PATHS` in astro.config.mjs;
`functions/routes.spec.ts` fails until both are there.
