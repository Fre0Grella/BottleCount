import { rewriteTo } from '../_rewrite';

// Every `/i/<slug>` URL serves the built invite page, which reads the slug.
export const onRequest = rewriteTo('/i/');
