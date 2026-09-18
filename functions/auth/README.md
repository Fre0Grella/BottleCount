# Why these are three files and not one catchall

Pages Functions win over static assets on the same path. A
`functions/auth/[[catchall]].ts` would therefore swallow `/auth/callback` —
which is a real page the app serves after Google redirects back — and hand it to
a Worker that has no such route, producing a 404 at the last step of every
sign-in.

So each backend auth endpoint is named explicitly, and every other `/auth/*`
path stays a static page. Adding a route to `backend/src/routes/auth.ts` means
adding a file here too; forgetting to is a 404 on that endpoint, which is
noisier and easier to diagnose than the alternative failure.
