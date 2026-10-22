import { rewriteTo } from '../_rewrite';

// Every `/t/<slug>` URL — the short ticket links of #41 — serves the built
// ticket page, and so does the bare `/t/` the older fragment links
// (`/t/#t=…`) use.
export const onRequest = rewriteTo('/t/');
