# cmssy-cli

Unified CLI for building reusable UI blocks and publishing them to Cmssy Marketplace.

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

# 8. Publish to marketplace or workspace
cmssy publish --all --marketplace
```

## Environment Configuration

Create a `.env` file in your project root with the following variables:

```env
# Required for publishing
CMSSY_API_URL=https://api.cmssy.io/graphql
CMSSY_API_TOKEN=your_api_token_here

# Optional - default workspace ID for publishing
CMSSY_WORKSPACE_ID=ws_abc123
```

**How to get API Token:**
1. Go to your Cmssy workspace settings
2. Navigate to "API Tokens"
3. Create a new token with `marketplace:publish` or `workspace:write` scope
4. Copy the token to your `.env` file

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

### Publish to Marketplace or Workspace

```bash
cmssy publish [packages...] [options]
```

Publish blocks/templates to public marketplace (with review) or private workspace (instant).

**Options:**
- `-m, --marketplace` - Publish to public marketplace (requires review)
- `-w, --workspace [id]` - Publish to workspace (private, no review)
- `--all` - Publish all blocks and templates
- `--patch` - Bump patch version (1.0.0 → 1.0.1)
- `--minor` - Bump minor version (1.0.0 → 1.1.0)
- `--major` - Bump major version (1.0.0 → 2.0.0)
- `--dry-run` - Preview what would be published without uploading

**Example:**
```bash
# Publish to marketplace (public, requires review)
cmssy publish hero --marketplace
cmssy publish --all --marketplace --patch

# Publish to workspace (private, instant)
cmssy publish hero --workspace ws_abc123
cmssy publish --all --workspace
cmssy publish pricing --workspace --minor

# Specific packages
cmssy publish hero pricing --marketplace

# Dry run
cmssy publish --all --marketplace --dry-run
```

**Notes:**
- Must specify either `--marketplace` OR `--workspace` (not both)
- Workspace ID can be provided via flag or `CMSSY_WORKSPACE_ID` in `.env`
- Version bumping updates `package.json` before publishing
- Marketplace publish requires review, workspace publish is instant

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
- Configuration (`package.json`, `block.config.ts`)
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
cmssy upload --all --workspace ws_abc123
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

### Sync from Marketplace

```bash
cmssy sync [package] [options]
```

Pull blocks from Cmssy marketplace to local project.

**Options:**
- `--workspace <id>` - Workspace ID to sync from

**Example:**
```bash
cmssy sync @vendor/blocks.hero
cmssy sync @vendor/blocks.hero --workspace ws_abc123
```

---

### Migrate to block.config.ts

```bash
cmssy migrate [block-name]
```

Migrate from legacy `package.json` cmssy section to new `block.config.ts` format.

**Example:**
```bash
# Migrate specific block
cmssy migrate hero

# Migrate all blocks
cmssy migrate
```

**What it does:**
- Converts `package.json` cmssy section to `block.config.ts`
- Removes cmssy section from `package.json`
- Generates TypeScript types from schema

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
  "name": "@vendor/blocks.hero",
  "version": "1.0.0",
  "description": "Hero section block",
  "cmssy": {
    "packageType": "block",
    "displayName": "Hero Section",
    "category": "marketing",
    "tags": ["hero", "landing", "cta"],
    "pricing": {
      "licenseType": "free"
    },
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

### Marketplace Publishing (Public, Requires Review)

For vendors who want to share blocks publicly:

```bash
# 1. Build your blocks
cmssy build

# 2. Publish to marketplace
cmssy publish --all --marketplace --patch

# 3. Wait for Cmssy team review
# 4. Once approved, blocks appear in public marketplace
```

**Use cases:**
- Public blocks for all Cmssy users
- Commercial blocks/templates
- Open-source contributions

**Requirements:**
- API token with `marketplace:publish` scope
- Blocks undergo review process
- Must meet marketplace quality standards

---

### Workspace Publishing (Private, Instant)

For teams with private block libraries:

```bash
# 1. Build your blocks
cmssy build

# 2. Publish to workspace
cmssy publish --all --workspace ws_abc123 --patch

# 3. Instantly available in your workspace
```

**Use cases:**
- Private company block libraries
- Internal design systems
- Client-specific components

**Requirements:**
- API token with `workspace:write` scope
- Workspace ID
- No review required, instant publish

---

### ZIP Package Workflow (Manual Upload)

For manual distribution or custom upload:

```bash
# 1. Package blocks into ZIP files
cmssy package --all

# 2. Option A: Upload via CLI
cmssy upload --all --workspace ws_abc123

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

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CMSSY_API_URL` | Yes (for publish/upload) | Cmssy API GraphQL endpoint | `https://api.cmssy.io/graphql` |
| `CMSSY_API_TOKEN` | Yes (for publish/upload) | API authentication token | `cmssy_abc123...` |
| `CMSSY_WORKSPACE_ID` | No | Default workspace ID | `ws_abc123` |

## Requirements

- Node.js 18+
- npm or yarn

## Complete Workflow Examples

### Example 1: New Public Block

```bash
# Initialize project
cmssy init my-blocks
cd my-blocks

# Create block
cmssy create block pricing-table

# Develop with hot reload
cmssy dev

# Build
cmssy build

# Configure API (one-time)
cmssy configure

# Publish to marketplace
cmssy publish pricing-table --marketplace --minor
```

---

### Example 2: Private Workspace Library

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
# Add CMSSY_WORKSPACE_ID=ws_abc123 to .env

# Develop and test
cmssy dev

# Build and publish all to workspace
cmssy build
cmssy publish --all --workspace
```

---

### Example 3: ZIP Distribution

```bash
# Package blocks
cmssy package --all

# Distribute ZIP files
# - Upload manually to Cmssy workspace UI
# - Or use upload command:
cmssy upload --all --workspace ws_abc123

# Or share packages/hero-1.0.0.zip with team
```

---

## Troubleshooting

### "API token not configured"
Run `cmssy configure` or manually add `CMSSY_API_TOKEN` to `.env`

### "Workspace ID required"
Add `CMSSY_WORKSPACE_ID` to `.env` or use `--workspace ws_abc123` flag

### "Specify publish target"
Must use either `--marketplace` OR `--workspace` when publishing

### "Not a Cmssy project"
Make sure you're in a directory with `cmssy.config.js` file

## License

MIT

## Support

- Documentation: [https://cmssy.io/docs](https://cmssy.io/docs)
- Issues: [https://github.com/maciekbe1/cmssy-cli/issues](https://github.com/maciekbe1/cmssy-cli/issues)
