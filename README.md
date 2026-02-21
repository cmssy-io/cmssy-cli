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

# 2. Navigate to project
cd my-blocks

# 3. Install dependencies
npm install

# 4. Start development server
cmssy dev

# 5. Create a new block
cmssy create block my-block

# 6. Build for production
cmssy build

# 7. Configure Cmssy API (for publishing)
cmssy configure

# 8. Publish to workspace
cmssy publish --all --workspace
```

## Environment Configuration

Create a `.env` file in your project root with the following variables:

```env
# Required for publishing
CMSSY_API_URL=https://api.cmssy.io/graphql
CMSSY_API_TOKEN=your_api_token_here

# Optional - default workspace ID for publishing (MongoDB ObjectId)
CMSSY_WORKSPACE_ID=507f1f77bcf86cd799439011
```

**How to get API Token:**

1. Go to your Cmssy workspace settings
2. Navigate to "API Tokens"
3. Create a new token with `blocks:write` scope
4. Copy the token to your `.env` file

**How to get Workspace ID:**

**Option 1: From Cmssy UI (Easiest)**

1. Go to your workspace Settings → General
2. Find "Workspace Information" section at the top
3. Click the copy button next to Workspace ID
4. Add to `.env` as `CMSSY_WORKSPACE_ID`

**Option 2: Using CLI**

1. Run `cmssy workspaces` to list all your workspaces
2. Copy the ID (MongoDB ObjectId format: 24-character hex string)
3. Add to `.env` as `CMSSY_WORKSPACE_ID`

Run `cmssy configure` for interactive setup.

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

### Configure API

```bash
cmssy configure [options]
```

Configure Cmssy API credentials for publishing.

**Options:**

- `--api-url <url>` - Cmssy API URL. Default: https://api.cmssy.io/graphql

**Example:**

```bash
cmssy configure
```

You'll be prompted for:

- **Cmssy API URL**: `https://api.cmssy.io/graphql` (or your local dev URL)
- **API Token**: Get this from your Cmssy workspace settings → API Tokens

Creates/updates `.env` file with your credentials.

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

- API token must be configured (run `cmssy configure` first)

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

# Configure API with workspace
cmssy configure

# List workspaces and get workspace ID
cmssy workspaces
# Copy workspace ID and add to .env: CMSSY_WORKSPACE_ID=507f1f77bcf86cd799439011

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

Run `cmssy configure` or manually add `CMSSY_API_TOKEN` to `.env`

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
