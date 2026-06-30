# @cmssy/cli

The `cmssy` CLI wires cmssy into your existing [Next.js](https://nextjs.org) (App Router) app
and helps you grow it with blocks. It does not scaffold a Next app - bring your own
(`npx create-next-app@latest`).

```bash
npx create-next-app@latest my-site   # your app, your way
cd my-site
npx @cmssy/cli init                  # add cmssy
```

Requires **Node 18.18+** and an existing **Next.js App Router** project.

## Commands

### `cmssy init [dir]`

Add the cmssy wiring to an existing Next.js App Router app, then link it to a workspace.
Idempotent - it never overwrites a file you already have; skipped files are reported.

It writes: `cmssy.config.ts`, a catch-all `app/[[...path]]/page.tsx`, the draft route,
`proxy.ts` (edit-mode + CSP), the block registry, the lazy editor, and one self-styled example
`hero` block (a CSS Module - cmssy does not impose a styling system). `next.config.mjs` is added
only if you don't already have one. Then it links and installs dependencies.

```bash
cmssy init                 # wire the current directory
cmssy init --pm pnpm       # choose the package manager (npm | pnpm | yarn | bun)
cmssy init --skip-install  # write files, install later
cmssy init --no-link       # skip the workspace prompt
```

### `cmssy link`

Connect an already-initialized project to a workspace. Prompts for the workspace slug and draft
secret (both from **cmssy dashboard → Settings → Headless**), validates the slug against the
delivery API, and writes them to `.env` without touching your other variables.

```bash
cmssy link
cmssy link --slug my-workspace --secret <draft-secret>   # non-interactive
```

### `cmssy add block <name>`

Scaffold a new block and register it in `cmssy/blocks.ts`. The name is normalized: a folder in
kebab-case, a PascalCase component, a camelCase registry export.

```bash
cmssy add block "Feature Grid"
# -> blocks/feature-grid/{block.ts, FeatureGrid.tsx, FeatureGrid.module.css}
#    registered as featureGridBlock
```

### `cmssy doctor`

Diagnose a project's cmssy setup: required files, `@cmssy/*` install + version alignment, env
vars, and that the block registry's imports resolve. Exits non-zero on a hard failure.

```bash
cmssy doctor
```

## What "linked" means

Only two values are required (cmssy cloud provides the rest):

| Variable               | Where to find it                                      |
| ---------------------- | ----------------------------------------------------- |
| `CMSSY_WORKSPACE_SLUG` | cmssy dashboard → Settings → Headless                 |
| `CMSSY_DRAFT_SECRET`   | cmssy dashboard → Settings → Headless (per-workspace) |

## Docs

- [cmssy docs](https://www.cmssy.com/docs)
- [Installation](https://www.cmssy.com/docs/installation) · [Quickstart](https://www.cmssy.com/docs/quickstart)
- Built on the cmssy SDK: [`@cmssy/next` + `@cmssy/react`](https://github.com/cmssy-io/cmssy-sdk)

## Contributing

```bash
pnpm install
pnpm run build      # tsup -> dist/cli.js
pnpm run typecheck
pnpm test           # vitest
```

## License

MIT
