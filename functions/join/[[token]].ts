import { rewriteTo } from '../_rewrite';

// Every `/join/<token>` URL serves the built co-organiser invitation page.
export const onRequest = rewriteTo('/join/');
