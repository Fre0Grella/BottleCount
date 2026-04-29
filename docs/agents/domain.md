# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, proceed silently. Don't flag their absence.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Multi-context repo (if `CONTEXT-MAP.md` exists):

```
/
├── CONTEXT-MAP.md
├── docs/adr/
└── src/
    ├── <context-a>/CONTEXT.md
    ├── <context-a>/docs/adr/
    ├── <context-b>/CONTEXT.md
    └── <context-b>/docs/adr/
```

## Use the glossary vocabulary

When output names a domain concept, use the terms defined in `CONTEXT.md`. If an output contradicts an existing ADR, call out the conflict explicitly.
