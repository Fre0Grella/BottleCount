## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for this repository (use `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Domain docs are configured as single-context (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.

## Architecture rules

- One definition per asset, rule and helper. Before adding a helper, search for an existing one (`rg`) and reuse or extend it.
- No domain rules in `.vue` components: they live in `.ts` modules (a feature folder, `src/lib/` or `shared/`), and components call them.
- Layout: a feature's modules, components and specs live together in `src/features/<feature>/` (account, guests, menu, party, payments, sharing, sync, tickets). Page-level components are in `src/screens/`, the store in `src/store/`, UI primitives in `src/components/ui/`, the marketing site's chrome in `src/components/site/`. `src/lib/` holds only cross-cutting modules (the API client, dates, display, safeStorage, brand, theme, db, types, ...). Specs sit next to their module: `foo.spec.ts` beside `foo.ts`.
- Reuse the existing UI primitives instead of restyling a one-off copy.
- CI ratchets the debt (`npm run check:dupes`, `check:deps`, `check:unused`, and the `--max-warnings` in `lint`). Never raise a ceiling or add to a baseline; when you pay debt down, lower it in the same PR.
