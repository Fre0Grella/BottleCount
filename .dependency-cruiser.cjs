/**
 * Layer rules, checked in CI by `npm run check:deps`.
 *
 * Today's breaches are listed in .dependency-cruiser-known-violations.json and
 * tolerated (`--ignore-known`); anything new fails. When you fix one, run
 * `npm run check:deps:baseline` so the file shrinks with the debt. Never run it
 * to make a new breach pass.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'shared-stays-shared',
      comment:
        'shared/ is compiled by both the frontend and the Worker, so it may not ' +
        'reach into either side (or into the Pages Functions).',
      severity: 'error',
      from: { path: '^shared/' },
      to: { path: '^(src|backend|functions)/' },
    },
    {
      name: 'ticket-domain-no-drawing',
      comment:
        'Ticket rules (codes, payloads, signing, links, messages) must not ' +
        'depend on QR or canvas drawing: drawing depends on the domain, not ' +
        "the other way. Only .ts modules: the folder's .vue screens may draw.",
      severity: 'error',
      from: {
        path: '^(shared/tickets?|shared/ticketLinks|src/features/tickets/[^/]+)\\.ts$',
        pathNot: '\\.spec\\.ts$',
      },
      to: {
        path: '(^src/lib/(qr|drawing)\\.ts$|node_modules/(qrcode|qr-scanner)/)',
      },
    },
    {
      name: 'lib-no-components',
      comment:
        'Modules hold the domain and must not import .vue components: not ' +
        "src/lib, not the store, not a feature folder's .ts files. " +
        'Components call into them, never the reverse.',
      severity: 'error',
      from: { path: '^src/(lib|store|features)/.*\\.ts$' },
      to: { path: '\\.vue$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|\\.astro|\\.wrangler|docs/design)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.mjs', '.vue', '.astro', '.json'],
    },
  },
};
