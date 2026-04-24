# cmssy-cli

Unified CLI for building reusable UI blocks and publishing them to Cmssy workspaces.

## Installation

```bash
npm install -g cmssy-cli
```

## Quick Start

```bash
# 1. Create a new project
npx cmssy init my-blocks

# 2. Navigate to project + install deps
cd my-blocks
npm install

# 3. Link the project to your Cmssy workspace (interactive - pick workspace, paste token)
cmssy link

# 4. Verify the setup is healthy
cmssy doctor

# 5. Start the dev server with hot reload
cmssy dev

# 6. Create a new block
cmssy create block my-block

# 7. Test your blocks
cmssy test

# 8. Build for production
cmssy build

# 9. Publish to your workspace (ID, or rely on CMSSY_WORKSPACE_ID from .env)
cmssy publish --all --workspace <id>
# or, if CMSSY_WORKSPACE_ID is set by `cmssy link`:
cmssy publish --all --workspace
```

## Environment Configuration

`cmssy link` (see below) writes these for you into `.env`. Manual setup:

```env
# Required for publishing
CMSSY_API_URL=https://api.cmssy.io/graphql
CMSSY_API_TOKEN=your_api_token_here

# Optional - default workspace ID for publishing commands that accept -w
CMSSY_WORKSPACE_ID=507f1f77bcf86cd799439011
```

**Recommended:** run `cmssy link` - interactive prompt that picks the workspace,
accepts the API token, and writes all three values to `.env`.

**Manual:**

- **API Token**: Cmssy workspace Settings → API Tokens → new token with `blocks:write`
- **Workspace ID**: `cmssy workspaces` (lists all accessible workspaces with their IDs)

## Commands

### Initialize Project

```bash
cmssy init [name] [options]
```

Create a new Cmssy project with example blocks.

**Options:**

- `-f, --framework <framework>` - Framework (react, vue, angular, vanilla). Default: react

**Example:**

```bash
cmssy init my-blocks --framework react
```

**What it creates:**

- Project structure with `blocks/` and `templates/` directories
- Example hero block
- `cmssy.config.js` configuration file
- `.env.example` with API configuration template

---

### Create Block or Template

```bash
cmssy create block <name>
cmssy create template <name>
```

Create a new block or page template in your project.

**Example:**

```bash
cmssy create block hero
cmssy create template landing-page
```

**What it creates:**

- `blocks/<name>/` or `templates/<name>/` directory
- `package.json` with metadata
- `preview.json` for dev server
- `src/` directory with component scaffold

---

### Build

```bash
cmssy build [options]
```

Build all blocks and templates for production.

**Options:**

- `--framework <framework>` - Override framework from config

**Example:**

```bash
cmssy build
```

**Output:** Built files are generated in `public/@vendor/package-name/version/` directory.

---

### Development Server

```bash
cmssy dev [options]
```

Start development server with hot reload and preview UI.

**Options:**

- `-p, --port <port>` - Port number. Default: 3000

**Example:**

```bash
cmssy dev --port 4000
```

**Features:**

- Hot reload on file changes
- Interactive block preview
- Publish blocks directly from UI
- Live progress tracking
- Version badges and status indicators

---

### Link to a Workspace

```bash
cmssy link [options]
```

Connect the current project to a Cmssy workspace. Interactive prompt by default:
picks the workspace, accepts an API token, and writes `CMSSY_API_URL` /
`CMSSY_API_TOKEN` / `CMSSY_WORKSPACE_ID` to `.env`.

**Options:**

- `--token <token>` - API token (non-interactive)
- `--workspace <id|slug>` - Workspace to link to (non-interactive)
- `--api-url <url>` - Override API endpoint (default: `https://api.cmssy.io/graphql`)

**Examples:**

```bash
# Interactive (recommended for first-time setup)
cmssy link

# CI / scripted setup
cmssy link --token cs_xxx --workspace my-workspace-slug

# Custom API
cmssy link --api-url https://api.cmssy.dev/graphql
```

Tokens come from https://cmssy.io/settings/tokens. List existing workspaces with
`cmssy workspaces`.

---

### Health Check

```bash
cmssy doctor
```

All-in-one preflight check.

**Required (fails the check):**

- Node ≥ 18
- `cmssy.config.js` present in project root
- `CMSSY_API_TOKEN` set in the environment

**Warnings only (run still succeeds):**

- `npm`, `next`, `react` availability
- `.env` file present
- `CMSSY_API_URL` set (defaults to the public API if missing)
- `CMSSY_WORKSPACE_ID` set

When enough config is available, doctor also reaches out to the API to verify
the token and workspace access.

Run it before any non-trivial operation (publish, sync). Fix failures before
proceeding; review warnings - they won't stop you but may point at missing
setup steps.

---

### Test Blocks

```bash
cmssy test [options]
```

Run the vitest test suite against your blocks and templates. Test files live
at `blocks/*/src/**/*.{test,spec}.{ts,tsx}` (same for templates).

**Options:**

- `--block <names...>` - Test only the listed blocks (space-separated)
- `--watch` - Watch mode (re-run on file change)
- `--coverage` - Generate coverage report

**Examples:**

```bash
# All tests
cmssy test

# Subset
cmssy test --block hero faq

# Watch mode
cmssy test --watch
```

**Writing block tests** - use the helpers from `@cmssy/cli/test`:

```ts
import { test, expect } from "vitest";
import { renderBlock, validatePreviewData } from "@cmssy/cli/test";
import Hero from "./Hero";
import previewData from "../preview.json";
// Pull the runtime schema from the block's config.ts (defineBlock({ schema })).
// Don't import from block.d.ts - that's a type declaration, no runtime value.
import heroConfig from "../config";

test("renders the heading from content", async () => {
  const { getByText } = await renderBlock(Hero, {
    content: { heading: "Welcome" },
  });
  expect(getByText("Welcome")).toBeTruthy();
});

test("preview data satisfies the block schema", () => {
  const { valid, errors } = validatePreviewData(heroConfig.schema, previewData);
  expect(valid, errors.join("\n")).toBe(true);
});
```

`@testing-library/react` and `react` are loaded dynamically - install them in
your project when you need `renderBlock`:

```bash
npm install -D @testing-library/react
```

---

### Generate Types from Workspace Schema

```bash
cmssy codegen [options]
```

Generate TypeScript types from your workspace's public GraphQL schema (powered
by `@graphql-codegen/cli` under the hood).

**Options:**

- `-w, --workspace <slug>` - Workspace slug (**required** except for `--init`)
- `-o, --output <path>` - Output path (default: `src/graphql/types.ts`)
- `--init` - Generate a `codegen.ts` config file instead of running codegen

**First-time setup:**

```bash
# 1. Create codegen.ts (works on a fresh project, before `cmssy link`)
cmssy codegen --init

# 2. Install codegen deps
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations

# 3. Run against your workspace
cmssy codegen --workspace my-workspace-slug
```

> **Note on `--workspace`**: this flag takes the workspace _slug_ (e.g.
> `my-workspace-slug`), not the ObjectId stored in `CMSSY_WORKSPACE_ID`. Use
> `cmssy workspaces` to look up the slug.

---

### Publish to Workspace

```bash
cmssy publish [packages...] [options]
```

Publish blocks/templates to your workspace.

**Options:**

- `-w, --workspace [id]` - Publish to workspace
- `--all` - Publish all blocks and templates
- `--patch` - Bump patch version (1.0.0 → 1.0.1)
- `--minor` - Bump minor version (1.0.0 → 1.1.0)
- `--major` - Bump major version (1.0.0 → 2.0.0)
- `--dry-run` - Preview what would be published without uploading

**Example:**

```bash
# Publish to workspace
cmssy publish hero --workspace 507f1f77bcf86cd799439011
cmssy publish --all --workspace
cmssy publish pricing --workspace --minor

# Specific packages
cmssy publish hero pricing --workspace abc123

# Dry run
cmssy publish --all --workspace --dry-run
```

**Notes:**

- Must specify `--workspace` flag
- Workspace ID can be provided via flag or `CMSSY_WORKSPACE_ID` in `.env`
- Version bumping updates `package.json` before publishing
- Published instantly (no review required)

---

### Package into ZIP Files

```bash
cmssy package [packages...] [options]
```

Package blocks/templates into ZIP files for distribution or upload.

**Options:**

- `--all` - Package all blocks and templates
- `-o, --output <dir>` - Output directory. Default: packages

**Example:**

```bash
# Package single block
cmssy package hero

# Package multiple blocks
cmssy package hero pricing

# Package all blocks and templates
cmssy package --all

# Custom output directory
cmssy package --all --output dist/packages
```

**What gets packaged:**

- Source files (`src/`)
- Configuration (`package.json`, `config.ts`)
- Preview data (`preview.json`)
- Built files (from `public/` if exists)
- README.md (if exists)

**Output:** `packages/<name>-<version>.zip` (e.g., `hero-1.0.0.zip`)

---

### Upload Packages to Workspace

```bash
cmssy upload [files...] [options]
```

Upload packaged ZIP files directly to your Cmssy workspace.

**Options:**

- `-w, --workspace <id>` - Workspace ID to upload to
- `--all` - Upload all packages from packages directory

**Example:**

```bash
# Upload single package
cmssy upload hero-1.0.0.zip

# Upload multiple packages (with or without .zip extension)
cmssy upload hero-1.0.0 pricing-2.1.0

# Upload all packages
cmssy upload --all

# Specify workspace ID
cmssy upload --all --workspace 507f1f77bcf86cd799439011
```

**Requirements:**

- Packages must exist in `packages/` directory (run `cmssy package` first)
- API token must be configured in `.env`
- Workspace ID via `--workspace` flag or `CMSSY_WORKSPACE_ID` in `.env`

**Typical workflow:**

```bash
cmssy package --all
cmssy upload --all
```

---

### Sync from Design Library

```bash
cmssy sync [package] [options]
```

Pull blocks from Cmssy design library to local project.

**Options:**

- `--workspace <id>` - Workspace ID to sync from

**Example:**

```bash
cmssy sync @cmssy/blocks.hero
cmssy sync @cmssy/blocks.hero --workspace 507f1f77bcf86cd799439011
```

---

### Migrate to config.ts

```bash
cmssy migrate [block-name]
```

Migrate from legacy `package.json` cmssy section to new `config.ts` format.

**Example:**

```bash
# Migrate specific block
cmssy migrate hero

# Migrate all blocks
cmssy migrate
```

**What it does:**

- Converts `package.json` cmssy section to `config.ts`
- Removes cmssy section from `package.json`
- Generates TypeScript types from schema

---

### List Workspaces

```bash
cmssy workspaces
```

List all workspaces you have access to and get their IDs.

**Example:**

```bash
cmssy workspaces
```

**Output:**

```
📁 Your Workspaces (2):

Acme Corporation
  Slug: acme-corp
  ID:   507f1f77bcf86cd799439011
  Role: owner

Team Project
  Slug: team-project
  ID:   673e4f3b2e8d9c1a4b5f6e8d
  Role: member

💡 Tip: Copy the ID above and add to .env:
   CMSSY_WORKSPACE_ID=507f1f77bcf86cd799439011
```

**Use this command to:**

- Find your workspace IDs for publishing
- See your role in each workspace
- Copy workspace ID to `.env` for CLI usage

**Requirements:**

- API token must be configured (run `cmssy link` first)

### Install AI Assistant Skills

```bash
cmssy skills list                    # Show available skills
cmssy skills install                 # Interactive prompt (pick a skill)
cmssy skills install block           # CLI + block dev workflow skill
cmssy skills install mcp-content     # Content editing via @cmssy/mcp-server
cmssy skills install --all           # Install every skill
cmssy skills install block --local   # Install into current project's .claude/
cmssy skills install block --force   # Overwrite existing skill
```

Drops cmssy skills into your Claude Code config so the assistant understands how
to work with cmssy out of the box. Two skills ship today:

- **`block`** - full CLI + block dev workflow (init, link, create, dev, test,
  build, publish, sync, `defineBlock`/`defineTemplate` authoring)
- **`mcp-content`** - managing workspace content through the
  [@cmssy/mcp-server](https://www.npmjs.com/package/@cmssy/mcp-server) MCP tools
  (i18n rules, layout blocks, forms, publish flow). Requires the MCP server to
  be configured in your Claude Code settings first

After installing, restart Claude Code (or start a new session) and try a prompt
like _"scaffold a pricing block and publish as patch"_ or
_"add a new testimonials block to the homepage, in English and Polish"_.

**Options:**

- `--target <editor>` - editor target (default: `claude`; more coming)
- `--all` - install every available skill
- `--local` - install into `./.claude/skills/` in the current project (default: `~/.claude/skills/`)
- `--force` - overwrite an existing skill without prompting
- `-y, --yes` - non-interactive mode (fails instead of prompting on conflict)

> **Changed in 0.14.0:** the first positional argument is now the **skill
> name** (`block`, `mcp-content`) rather than the editor target. If you were
> using `cmssy skills install claude` on 0.13.x, switch to
> `cmssy skills install block` (or `--all`). Editor target is now a flag:
> `--target claude`.

---

## Project Structure

```
my-blocks/
├── cmssy.config.js        # Project configuration
├── .env                   # API credentials (not committed)
├── .env.example           # Example environment variables
├── blocks/                # Your blocks
│   └── hero/
│       ├── package.json   # Block metadata
│       ├── preview.json   # Preview data for dev server
│       └── src/
│           ├── index.tsx  # Block component
│           └── index.css  # Block styles
├── templates/             # Your page templates
├── packages/              # ZIP packages (created by cmssy package)
│   ├── hero-1.0.0.zip
│   └── pricing-2.1.0.zip
├── public/                # Build output
│   └── @vendor/package-name/version/
│       ├── index.js
│       ├── index.css
│       └── package.json
└── package.json
```

## Block Metadata

Each block requires a `cmssy` section in its `package.json`:

```json
{
  "name": "@myorg/blocks.hero",
  "version": "1.0.0",
  "description": "Hero section block",
  "cmssy": {
    "packageType": "block",
    "displayName": "Hero Section",
    "category": "marketing",
    "tags": ["hero", "landing", "cta"],
    "schemaFields": [
      {
        "name": "title",
        "type": "singleLine",
        "label": "Section Title",
        "defaultValue": "Welcome"
      }
    ],
    "defaultContent": {
      "title": "Welcome to Our Platform"
    }
  }
}
```

## Publishing Workflows

### Workspace Publishing

For teams with their own block libraries:

```bash
# 1. Build your blocks
cmssy build

# 2. Publish to workspace
cmssy publish --all --workspace 507f1f77bcf86cd799439011 --patch

# 3. Instantly available in your workspace
```

**Use cases:**

- Private company block libraries
- Internal design systems
- Client-specific components

**Requirements:**

- API token with `blocks:write` scope
- Workspace ID
- Published instantly

---

### ZIP Package Workflow (Manual Upload)

For manual distribution or custom upload:

```bash
# 1. Package blocks into ZIP files
cmssy package --all

# 2. Option A: Upload via CLI
cmssy upload --all --workspace 507f1f77bcf86cd799439011

# 2. Option B: Upload manually
# - Go to http://localhost:3000/workspace/cmssy/resources/add-external
# - Upload the ZIP files from packages/ directory
```

**Use cases:**

- Manual review before upload
- Offline distribution
- Custom deployment pipelines

---

## Environment Variables Reference

| Variable             | Required                 | Description                             | Example                        |
| -------------------- | ------------------------ | --------------------------------------- | ------------------------------ |
| `CMSSY_API_URL`      | Yes (for publish/upload) | Cmssy API GraphQL endpoint              | `https://api.cmssy.io/graphql` |
| `CMSSY_API_TOKEN`    | Yes (for publish/upload) | API authentication token                | `cmssy_abc123...`              |
| `CMSSY_WORKSPACE_ID` | No                       | Default workspace ID (MongoDB ObjectId) | `507f1f77bcf86cd799439011`     |

## Requirements

- Node.js 18+
- npm or yarn

## Complete Workflow Examples

### Example 1: Workspace Block Library

```bash
# Initialize project
cmssy init company-blocks
cd company-blocks

# Create multiple blocks
cmssy create block header
cmssy create block footer
cmssy create block cta

# Link to workspace (interactive - picks workspace, writes .env)
cmssy link

# Verify credentials + API reachability
cmssy doctor

# Develop and test
cmssy dev

# Build and publish all to workspace
cmssy build
cmssy publish --all --workspace
```

---

### Example 2: ZIP Distribution

```bash
# Package blocks
cmssy package --all

# Distribute ZIP files
# - Upload manually to Cmssy workspace UI
# - Or use upload command:
cmssy upload --all --workspace 507f1f77bcf86cd799439011

# Or share packages/hero-1.0.0.zip with team
```

---

## Troubleshooting

### "API token not configured"

Run `cmssy link` (interactive) or manually add `CMSSY_API_TOKEN` to `.env`.
Run `cmssy doctor` to verify the full setup.

### "Workspace ID required"

**Option 1: From UI**

1. Go to Workspace Settings → General
2. Copy workspace ID using the copy button
3. Add to `.env`: `CMSSY_WORKSPACE_ID=507f1f77bcf86cd799439011`

**Option 2: From CLI**

1. Run `cmssy workspaces` to list your workspaces
2. Copy the workspace ID (24-character hex string like `507f1f77bcf86cd799439011`)
3. Add to `.env`: `CMSSY_WORKSPACE_ID=507f1f77bcf86cd799439011`

**Option 3: Use flag**

- Use `--workspace 507f1f77bcf86cd799439011` flag in commands

### "Specify publish target"

Must use `--workspace` flag when publishing

### "Not a Cmssy project"

Make sure you're in a directory with `cmssy.config.js` file

## License

MIT

## Support

- Documentation: [https://cmssy.io/docs](https://cmssy.io/docs)
- Issues: [https://github.com/maciekbe1/cmssy-cli/issues](https://github.com/maciekbe1/cmssy-cli/issues)
