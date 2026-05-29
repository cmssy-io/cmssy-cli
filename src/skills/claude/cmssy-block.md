---
name: cmssy-block
description: "Run the full cmssy CLI lifecycle - init, link, scaffold/edit blocks and templates, dev/build/test, publish, sync. Trigger when the user asks to: initialize a cmssy project, link to a workspace, create/add a new block or template, add a field to a block's schema, edit config.ts, run cmssy dev/build/test/doctor, publish a block, bump a block version, sync a block from the design library, or work with defineBlock/defineTemplate. Trigger on words: cmssy, blok, block, template, publish, opublikuj, workspace, link, sync, defineBlock, defineTemplate, scaffold, zescafoldwac."
---

# cmssy-block

Operates the full cmssy CLI workflow for blocks and templates in a project like `cmssy-marketing`. Covers every command the CLI exposes: `init`, `link`, `create`, `dev`, `test`, `build`, `publish`, `sync`, `doctor`, `workspaces`.

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

**Content preservation:** republishing preserves the workspace's `defaultContent` overrides by default. There is no `--overwrite-content` flag - that knob lives on `cmssy publish-template` only.

The legacy `cmssy publish` command + its flags (`--patch`, `--minor`, `--major`, `--zip`, `--with-source`, `--force`, `--all`) were removed in CMS-606. Versioning is handled by the build pipeline; there is no per-publish bump prompt anymore.

### 1.9 `cmssy sync` - pull blocks down from a workspace

```bash
cmssy sync @cmssy/blocks.hero                    # one package from the design library
cmssy sync --workspace <id>                      # everything from a workspace
```

Use when cloning a project's block set to a new repo, or when a block has drifted from its published version.

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

| type           | Use for                                    |
| -------------- | ------------------------------------------ |
| `singleLine`   | Short text (heading, label, badge).        |
| `multiLine`    | Paragraph without formatting.              |
| `richText`     | HTML body copy.                            |
| `link`         | URL.                                       |
| `media`        | Image or video (returns URL string).       |
| `boolean`      | Toggle.                                    |
| `numeric`      | Number.                                    |
| `date`         | ISO date string.                           |
| `color`        | Hex color picker.                          |
| `select`       | Enum with `options: [{ label, value }]`.   |
| `repeater`     | Array of sub-objects with nested `schema`. |
| `form`         | Reference to a form-builder form.          |
| `pageSelector` | Pick a page from the workspace.            |

**Field options:** `label` (required), `defaultValue`, `placeholder`, `required`, `group` (groups fields in the editor UI).

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

After editing `config.ts`, `block.d.ts` regenerates on the next `cmssy dev` or `cmssy build`. Never hand-edit it.

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

Blocks that read platform data (auth, i18n) accept a second prop:

```tsx
export default function Header({ content, context }: {
  content: BlockContent;
  context?: PlatformContext;
}) { ... }
```

Components that use hooks or browser APIs: `"use client";` at the top.

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

| Symptom                                 | Likely cause                          | Fix                                                                         |
| --------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `doctor` says token invalid             | Revoked/expired token                 | `cmssy link` again with a fresh token from https://cmssy.io/settings/tokens |
| Publish says "workspace not accessible" | Wrong `CMSSY_WORKSPACE_ID` or no role | `cmssy workspaces`, update `.env`                                           |
| Sandbox build fails with bundling error | Missing import or > 10 MB source tree | Inspect the polled `publishJobStatus` log; trim deps or fix the import path |
| `block.d.ts` shows wrong fields         | Stale generation                      | Restart `cmssy dev`, or run `cmssy build` to regenerate                     |
| Dev server shows a blank block          | `preview.json` missing keys           | Match keys to `config.ts` field names                                       |
