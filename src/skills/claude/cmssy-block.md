---
name: cmssy-block
description: "Run the full cmssy CLI lifecycle - init, link, scaffold/edit blocks and templates, dev/build/test, publish, sync. Trigger when the user asks to: initialize a cmssy project, link to a workspace, create/add a new block or template, add a field to a block's schema, edit config.ts, run cmssy dev/build/test/doctor, publish a block, bump a block version, sync a block from the design library, or work with defineBlock/defineTemplate. Trigger on words: cmssy, blok, block, template, publish, opublikuj, workspace, link, sync, defineBlock, defineTemplate, scaffold, zescafoldwac."
---

# cmssy-block

Operates the full cmssy CLI workflow for blocks and templates in a project like `cmssy-marketing`. Covers every command the CLI exposes: `init`, `link`, `workspaces`, `create`, `dev`, `test`, `build`, `publish-block`, `publish-template`, `sync`, `lib`, `skills`, `doctor`. (`configure`, `migrate`, `codegen` exist but are hidden/legacy - don't use them.)

## 0. Orientation

```bash
cmssy --version            # CLI must be installed globally
cmssy doctor               # all-in-one health check
```

`cmssy doctor` is the canonical precheck. It verifies:

- Node >= 18, npm, Next.js, React versions
- `cmssy.config.js` exists
- `.env` with `CMSSY_API_URL`, `CMSSY_API_TOKEN`, `CMSSY_WORKSPACE_ID`
- API reachable, token valid, workspace accessible

Run it before any non-trivial operation. If something fails, fix that first - don't proceed.

The project uses **pnpm**. Never run `npm install` - use `pnpm install`, `pnpm typecheck`, `pnpm lint`.

## 1. Project lifecycle (in order)

### 1.1 `cmssy init` - start a new project or bolt onto an existing one

```bash
cmssy init <name>          # creates ./<name> via create-next-app + cmssy scaffolding
cmssy init -y <name>       # skip prompts, use defaults
cmssy init                 # add cmssy to the current Next.js project
```

Outputs: `cmssy.config.js`, `blocks/`, `templates/`, `styles/main.css`, `components/`, example block.

### 1.2 `cmssy link` - connect the project to a workspace

```bash
cmssy link                                       # interactive: pick workspace, paste token
cmssy link --token cs_xxx --workspace <id|slug>  # non-interactive, for CI or scripted setup
cmssy link --api-url https://api.cmssy.io/graphql
```

Writes credentials and `CMSSY_WORKSPACE_ID` to `.env`. Tokens come from https://cmssy.io/settings/tokens. List existing workspaces with `cmssy workspaces`.

### 1.3 `cmssy workspaces` - show what this machine can publish to

```bash
cmssy workspaces
```

Returns name, slug, ID, and role for every accessible workspace. Use this when the user is ambiguous about the publish target.

### 1.4 `cmssy create` - scaffold blocks or templates

```bash
cmssy create block <kebab-name> [-d "desc"] [-c <category>] [-t "tag1,tag2"] [-y]
cmssy create template <kebab-name> [-d "desc"] [-y]
```

Categories: `marketing`, `typography`, `media`, `layout`, `forms`, `navigation`, `other`.

Always use `-y` in automated flows unless the user wants to be prompted.

### 1.5 `cmssy dev` - local preview with HMR

```bash
cmssy dev              # port 3000
cmssy dev -p 8080      # custom port
```

Watches `config.ts` and auto-regenerates `block.d.ts`. Use for visual verification after edits.

### 1.6 `cmssy test` - vitest runner

```bash
cmssy test                       # all blocks/templates
cmssy test --block hero faq      # subset
cmssy test --watch
cmssy test --coverage
```

Test files live at `blocks/*/src/**/*.{test,spec}.{ts,tsx}` (same for templates). If no tests exist yet, this is a no-op.

### 1.7 `cmssy build` - production bundle

```bash
cmssy build                              # everything
cmssy build --block hero pricing         # subset
cmssy build --framework react            # override
```

Outputs `public/@<vendor>/blocks.<name>/<version>/{index.js,index.css,package.json}`. Run before `cmssy publish-block` if you want to preview the bundle locally - publishing itself bundles again in the sandbox.

### 1.8 `cmssy publish-block` - upload to workspace via the sandbox build pipeline

```bash
cmssy publish-block <name>                        # publish to workspace from .env
cmssy publish-block <name> -w <workspaceId>       # explicit workspace
cmssy publish-block <name> --dry-run              # collect files + print plan, no upload
cmssy publish-block <name> --entry src/main.tsx   # override default src/index.tsx entry
```

**Flow:** CLI collects the source files and POSTs them base64-encoded via the `publishBlock` GraphQL mutation. The backend packs the bundle into `tar.gz`, uploads it to Vercel Blob, and enqueues an Inngest job that builds in a Vercel Sandbox and writes artifacts back to Blob. CLI polls `publishJobStatus` until status is `completed` or `failed`.

**Limits:** 200 files / 10 MB total per block. Polling: 1.5 s interval, 10 min cap, gives up after 5 consecutive errors.

**SSR smoke test (can fail an otherwise-valid publish):** after bundling, the sandbox renders your block with `renderToString` using `defaultContent` derived from `config.ts`. When `defaultContent` is non-empty the test **demands non-empty HTML** - a block that renders nothing on its default content fails with `SSR_FAILURE: renderToString returned empty output despite realistic content`, and no artifacts are stored. The two recurring causes are an early `return null` on an empty repeater (see §4) and a repeater with no top-level `defaultValue` (see §3). Fix the block, bump the version, republish.

**Content preservation:** republishing preserves the workspace's `defaultContent` overrides by default. There is no `--overwrite-content` flag - that knob lives on `cmssy publish-template` only.

The legacy `cmssy publish` command + its flags (`--patch`, `--minor`, `--major`, `--zip`, `--with-source`, `--force`, `--all`) were removed in CMS-606. Versioning is handled by the build pipeline; there is no per-publish bump prompt anymore.

### 1.9 `cmssy sync` - pull blocks down from a workspace

```bash
cmssy sync @cmssy/blocks.hero                    # one package from the design library
cmssy sync --workspace <id>                      # everything from a workspace
```

Use when cloning a project's block set to a new repo, or when a block has drifted from its published version.

### 1.10 `cmssy lib` - manage the workspace npm dependency manifest

```bash
cmssy lib install <pkg...>            # install locally + push manifest to workspace
cmssy lib install lodash zod@^4
cmssy lib install <pkg> --skip-install # only sync from package.json, no local install
cmssy lib install <pkg> --dry-run      # print manifest, don't push
cmssy lib sync                         # push current package.json deps to the manifest
```

When a block imports an npm package, the sandbox build needs it in the workspace's dependency manifest. `lib install` adds the dep locally and registers it so the build pipeline can resolve it. `--package-manager <npm|pnpm|yarn|bun>` forces the PM; both subcommands take `-w` and `--dry-run`.

### 1.11 `cmssy skills` - install AI-assistant skills

```bash
cmssy skills list                      # show available skills
cmssy skills install block             # this skill (CLI + block dev workflow)
cmssy skills install mcp-content       # content editing via @cmssy/mcp-server
cmssy skills install --all             # all skills
cmssy skills install block --local     # into ./.claude/skills (default: ~/.claude/skills)
cmssy skills install block --force     # overwrite existing
```

Positional arg is the skill name (`block`, `mcp-content`); use `--target` for the editor (default `claude`).

## 2. Block anatomy (non-negotiable)

Every block lives in `blocks/<kebab-name>/`:

```
blocks/<name>/
├── config.ts          # defineBlock({ name, description, category, tags, schema })
├── package.json       # { "name": "@<project>/blocks.<name>", "version": "x.y.z" }
├── preview.json       # sample content for cmssy dev
└── src/
    ├── index.tsx      # export { default } from "./<Pascal>"; import "./index.css";
    ├── <Pascal>.tsx   # the React component
    ├── index.css      # @import "../../../styles/main.css";
    └── block.d.ts     # AUTO-GENERATED from config.ts - never hand-edit
```

**Naming (hard rules):**

- Directory + package `name` suffix: `kebab-case` (`blog-post-hero`).
- Component file and default export: `PascalCase` matching the directory (`BlogPostHero.tsx`).
- Package name: `@<projectName>/blocks.<kebab-name>` where `projectName` comes from `cmssy.config.js`.
- New blocks start at `"version": "1.0.0"`.

## 3. Writing `config.ts`

Import from `@cmssy/cli/config`. Available field types:

| type           | Use for                                              |
| -------------- | ---------------------------------------------------- |
| `singleLine`   | Short text (heading, label, badge).                  |
| `multiLine`    | Paragraph without formatting.                        |
| `richText`     | HTML body copy.                                      |
| `link`         | URL.                                                 |
| `media`        | Image or video (returns URL string).                 |
| `boolean`      | Toggle.                                              |
| `numeric`      | Number.                                              |
| `date`         | ISO date string.                                     |
| `color`        | Hex color picker.                                    |
| `select`       | Enum with `options: [{ label, value }]`.             |
| `multiselect`  | Multiple values from `options` (returns `string[]`). |
| `repeater`     | Array of sub-objects with nested `schema`.           |
| `form`         | Reference to a form-builder form.                    |
| `pageSelector` | Pick a page (`multiple: true` for several).          |

**Common field options** (all forwarded to the backend on publish): `label` (required), `required`, `placeholder`, `defaultValue`, `helperText` (helper text under the field; `helpText` is a deprecated alias), `group` (groups fields in the editor UI), `showWhen` (conditional visibility - `{ field, equals | notEquals | notEmpty | isEmpty }`), `validation` (`{ minLength, maxLength, min, max, pattern, message }`).

**Per-type options:** `options: [{ label, value }]` (select/multiselect), `minItems` / `maxItems` / `schema` (repeater), `multiple` (pageSelector). Media's `acceptedTypes` / `accept` / `maxSize` are **not** forwarded by the publish pipeline - don't rely on them.

```ts
import { defineBlock, field } from "@cmssy/cli/config";

export default defineBlock({
  name: "Feature Grid",
  description: "Grid of feature cards with icon, title, description",
  category: "marketing",
  tags: ["marketing", "features", "grid"],

  schema: {
    heading: field({ type: "singleLine", label: "Heading", required: true }),
    headingHighlight: field({ type: "singleLine", label: "Highlight" }),
    description: field({ type: "multiLine", label: "Description" }),
    features: field({
      type: "repeater",
      label: "Features",
      schema: {
        title: field({ type: "singleLine", label: "Title", required: true }),
        description: field({ type: "multiLine", label: "Description" }),
        icon: field({
          type: "select",
          label: "Icon",
          options: [
            { label: "Zap", value: "ZapIcon" },
            { label: "Sparkles", value: "SparklesIcon" },
          ],
        }),
        color: field({ type: "color", label: "Accent color" }),
      },
    }),
  },
});
```

**Repeaters and the SSR smoke test (critical):** `defaultContent` is built by `extractDefaultContent`, which only reads a field's **top-level** `defaultValue`. For a `repeater` it does **not** synthesize a sample row from the nested fields' `defaultValue`s - a repeater without its own top-level `defaultValue` becomes an empty array `[]`. If your component renders nothing when that array is empty (e.g. `if (items.length === 0) return null`), publish fails the SSR smoke test. Seed the repeater with a top-level `defaultValue` holding at least one realistic row:

```ts
items: field({
  type: "repeater",
  label: "Items",
  defaultValue: [{ title: "Example", description: "Sample row" }],
  schema: {
    title: field({ type: "singleLine", label: "Title", required: true }),
    description: field({ type: "multiLine", label: "Description" }),
  },
}),
```

After editing `config.ts`, `block.d.ts` regenerates on the next `cmssy dev` or `cmssy build`. Never hand-edit it.

### Block-level config keys (`defineBlock`)

Beyond `name`, `description`, `category`, `tags`, `schema`, `defineBlock` accepts:

| key               | Type                                                                             | Purpose                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `longDescription` | `string`                                                                         | Long copy for the design-library listing.                                                                                           |
| `layoutPosition`  | `"header" \| "footer" \| "sidebar_left" \| "sidebar_right" \| "top" \| "bottom"` | Makes this a **layout block** rendered into that slot instead of the content area.                                                  |
| `useClient`       | `boolean` (default `false`)                                                      | `false` = server-rendered HTML only (no JS shipped). `true` = hydrate the block on the client (interactivity, hooks, browser APIs). |
| `requires`        | `BlockRequires`                                                                  | Capability metadata: `{ auth?, language?, workspace?, modules?, permissions?, features? }`.                                         |

`requires` modules: `pim`, `crm`, `forms`, `analytics`, `newsletter`, `ecommerce`. `requires` features: `ai-generation`, `ai-translation`, `a-b-testing`. **`requires` is metadata** (editor/library filtering + auth-aware rendering hints) - it does **not** gate the runtime `context`, which is always populated. Always guard for missing data in the component regardless of what you declare.

(`groups` appears in some legacy block configs but is **not** forwarded by the publish pipeline - use the per-field `group` string for editor grouping instead.)

### Layout blocks (header / footer / sidebar)

A layout block is an ordinary block with a `layoutPosition`. It renders into a template slot via `LayoutPositionRenderer` and is excluded from the content-block drawer. Header/footer/nav blocks are almost always interactive, so set `useClient: true` and declare what they read:

```ts
export default defineBlock({
  name: "Header Navigation",
  description: "Responsive header with logo, nav, and CTA",
  category: "layout",
  layoutPosition: "header",
  useClient: true,
  requires: { auth: true, language: true },
  schema: {
    logo: field({ type: "media", label: "Logo" }),
    links: field({
      type: "repeater",
      label: "Nav links",
      defaultValue: [{ label: "Home", href: "/" }],
      schema: {
        label: field({ type: "singleLine", label: "Label", required: true }),
        href: field({ type: "link", label: "URL", required: true }),
      },
    }),
  },
});
```

The same SSR-smoke and repeater-seeding rules apply (§3 above, §1.8). Publish with `cmssy publish-block <name>` like any other block.

## 4. Writing the component

Follow the design system in the repo's `DESIGN.md`:

- Import `Container` from `../../../components/container`.
- Section wrapper: `<section className="py-24">` or `"py-24 bg-slate-50/50 dark:bg-slate-900/50"` for alternating tint.
- Destructure `content` with defaults: `const { heading = "Default" } = content;`.
- Gradient-clip highlight phrases: `bg-linear-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent`.
- Primary CTAs: gradient pill button with `shadow-lg shadow-violet-500/25`. Secondary: outline with `border-input`.
- Icons: `lucide-react`, default stroke width.
- Rich text: `dangerouslySetInnerHTML` inside a `prose` wrapper.

```tsx
import { Container } from "../../../components/container";
import { BlockContent } from "./block";

export default function FeatureGrid({ content }: { content: BlockContent }) {
  const { heading = "", features = [] } = content;
  return (
    <section className="py-24">
      <Container>{/* ... */}</Container>
    </section>
  );
}
```

Blocks that read platform data accept a second `context` prop. The SSR render path populates it in full (and `requires` does **not** gate which fields you get), but type it **optional** (`context?: PlatformContext`) - that is the convention across all blocks, since non-SSR paths (editor CSR preview, fallbacks) may not pass it. Always guard every field defensively:

```tsx
export default function Header({ content, context }: {
  content: BlockContent;
  context?: PlatformContext;
}) { ... }
```

`PlatformContext` top-level keys: `locale` (always present - `{ current, default, enabled }`), `auth`, `workspace`, `site`, `branding`, `primaryDomain`, `pages`, `media`, `members`, `forms`, `formDefinitions`, `models`, `cart` / `canUseCart`, `isPreview`, `isDraftMode`, and `graphql(query, variables?)` for public queries. Collection sources (`pages`, `media`, `forms`, ...) are injected from the block's `dataDeclarations` and auto-detected references (e.g. a `formId` in content), so they may be empty if not declared.

**Two different "client" knobs - don't confuse them:**

- `useClient: true` in **`config.ts`** opts the block into client hydration. Without it the block is server-rendered only and ships no JS, so `useState`/`onClick`/effects won't run in production no matter what the component file says.
- `"use client";` at the top of the **component file** is the Next-style compile pragma for files that use hooks or browser APIs.

An interactive block needs **both**: `useClient: true` in config and `"use client";` in the component.

**Empty-state guards vs the SSR smoke test:** an early `return null` (or rendering nothing) when a repeater is empty is a legitimate pattern, but it makes the block fail the publish-time SSR smoke test unless that repeater is seeded with a top-level `defaultValue` (see §3). Either seed the repeater, or render a non-empty wrapper (heading/section) even with zero rows.

## 5. `preview.json`

Sample content for `cmssy dev`. Keys must match `config.ts` field names. Repeater fields take arrays of objects. Make it realistic - preview is what reviewers see.

## 6. Templates

```
templates/<name>/
├── config.ts        # defineTemplate({ name, description, category, tags, pages })
├── package.json
├── pages.json       # layoutPositions (header/footer) + block references
├── preview.json
└── src/             # optional root component
```

```ts
import { defineTemplate, field } from "@cmssy/cli/config";

export default defineTemplate({
  name: "Marketing Site",
  description: "...",
  category: "website",
  tags: [...],
  pages: [
    {
      name: "Home",
      slug: "/",
      blocks: [
        { type: "hero", content: { heading: "...", ... } },
        { type: "features", content: { ... } },
      ],
    },
  ],
});
```

Publish templates via the dedicated command: `cmssy publish-template <template-name>`. Templates are declarative (no sandbox build) - the CLI accepts `--patch` / `--minor` / `--major` / `--no-bump` and `--overwrite-content` here.

## 7. Standard workflows

### Brand-new project

```bash
cmssy init my-blocks -y
cd my-blocks
cmssy link                 # interactive - pick workspace
cmssy doctor               # confirm green
cmssy dev
```

### Add a new block end-to-end

```bash
cmssy create block testimonials -c marketing -t "marketing,social-proof" -y
# edit blocks/testimonials/config.ts, Testimonials.tsx, preview.json
cmssy dev                                  # visual check
pnpm typecheck && pnpm lint
cmssy test --block testimonials            # if tests exist
cmssy publish-block testimonials --dry-run
cmssy publish-block testimonials
```

### Add a layout block (header / footer / sidebar)

```bash
cmssy create block site-header -c layout -y
# in config.ts add: layoutPosition: "header", useClient: true, requires: { auth, language }
# seed any repeater (nav links) with a top-level defaultValue
cmssy dev
pnpm typecheck && pnpm lint
cmssy publish-block site-header
```

`cmssy create` does not set `layoutPosition` - add it (and `useClient`) to `config.ts` by hand. See §3 "Layout blocks".

### Extend an existing block with an optional field

1. Add `field({...})` to `config.ts`. Don't set `required: true` - that's breaking.
2. Update the component to read and render it with a default.
3. Update `preview.json`.
4. `cmssy publish-block <block>`.

### Copy-only fix

1. Edit default strings or JSX in the component.
2. `cmssy publish-block <block>`.

### Pull a block from the design library

```bash
cmssy sync @cmssy/blocks.hero
```

## 8. Safety rules (always)

- Run `cmssy doctor` before publishing.
- Never fabricate a workspace ID. Use `cmssy workspaces` and confirm with the user.
- Never pass `cmssy publish-template --overwrite-content` without explicit user approval (wipes editor content on the affected pages).
- Use `--dry-run` first when unsure what will change.
- Confirm with the user before publishing from a branch other than `develop` or `main`.
- Commit local changes before publishing - publish uploads the working tree.
- For init and link, never write a token or workspace ID into `.env` without user confirmation.

## 9. Troubleshooting

| Symptom                                                                | Likely cause                                                                                                                    | Fix                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `doctor` says token invalid                                            | Revoked/expired token                                                                                                           | `cmssy link` again with a fresh token from https://cmssy.io/settings/tokens                                                |
| Publish says "workspace not accessible"                                | Wrong `CMSSY_WORKSPACE_ID` or no role                                                                                           | `cmssy workspaces`, update `.env`                                                                                          |
| Sandbox build fails with bundling error                                | Missing import or > 10 MB source tree                                                                                           | Inspect the polled `publishJobStatus` log; trim deps or fix the import path                                                |
| `block.d.ts` shows wrong fields                                        | Stale generation                                                                                                                | Restart `cmssy dev`, or run `cmssy build` to regenerate                                                                    |
| Dev server shows a blank block                                         | `preview.json` missing keys                                                                                                     | Match keys to `config.ts` field names                                                                                      |
| Publish fails `SSR_FAILURE` / "empty output despite realistic content" | Block renders nothing on its `defaultContent` - usually `return null` on an empty repeater that has no top-level `defaultValue` | Seed the repeater's top-level `defaultValue` with ≥1 row (§3), or render a non-empty wrapper (§4); bump version; republish |
