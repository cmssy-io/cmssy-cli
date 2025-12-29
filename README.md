# cmssy-forge

Unified CLI for building reusable UI blocks and publishing them to Cmssy Marketplace.

## Installation

```bash
npm install -g cmssy-forge
```

## Quick Start

```bash
# 1. Create a new project
npx cmssy-forge init my-blocks

# 2. Navigate to project
cd my-blocks

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev

# 5. Create a new block
npx cmssy-forge create block my-block

# 6. Build for production
npm run build

# 7. Configure Cmssy API (for publishing)
npx cmssy-forge configure

# 8. Deploy to marketplace
npx cmssy-forge deploy --all
```

## Commands

### Initialize Project

```bash
cmssy-forge init [name] [options]
```

Create a new BlockForge project with example blocks.

**Options:**
- `-f, --framework <framework>` - Framework (react, vue, angular, vanilla). Default: react

**Example:**
```bash
cmssy-forge init my-blocks --framework react
```

### Create Block or Template

```bash
cmssy-forge create block <name>
cmssy-forge create template <name>
```

Create a new block or page template in your project.

**Example:**
```bash
cmssy-forge create block hero
cmssy-forge create template landing-page
```

### Build

```bash
cmssy-forge build [options]
```

Build all blocks and templates for production.

**Options:**
- `--framework <framework>` - Override framework from config

**Example:**
```bash
cmssy-forge build
```

**Output:** Built files are generated in `public/@vendor/package-name/version/` directory.

### Development Server

```bash
cmssy-forge dev [options]
```

Start development server with hot reload and preview.

**Options:**
- `-p, --port <port>` - Port number. Default: 3000

**Example:**
```bash
cmssy-forge dev --port 4000
```

### Configure API

```bash
cmssy-forge configure [options]
```

Configure Cmssy API credentials for publishing.

**Options:**
- `--api-url <url>` - Cmssy API URL. Default: https://api.cmssy.io/graphql

**Example:**
```bash
cmssy-forge configure
```

You'll be prompted for:
- **Cmssy API URL**: `https://api.cmssy.io/graphql` (or your local dev URL)
- **API Token**: Get this from your Cmssy workspace settings → API Tokens

Create an API token with `marketplace:publish` scope.

### Deploy to Marketplace

```bash
cmssy-forge deploy [options]
```

Publish blocks/templates to Cmssy marketplace.

**Options:**
- `--all` - Deploy all blocks and templates
- `--blocks <names...>` - Deploy specific blocks
- `--templates <names...>` - Deploy specific templates
- `--dry-run` - Preview without publishing

**Example:**
```bash
# Deploy all
cmssy-forge deploy --all

# Deploy specific blocks
cmssy-forge deploy --blocks hero pricing

# Deploy specific templates
cmssy-forge deploy --templates landing-page

# Dry run
cmssy-forge deploy --all --dry-run
```

### Sync from Marketplace

```bash
cmssy-forge sync [package] [options]
```

Pull blocks from Cmssy marketplace to local project.

**Options:**
- `--workspace <id>` - Workspace ID to sync from

**Example:**
```bash
cmssy-forge sync @vendor/blocks.hero --workspace abc123
```

## Project Structure

```
my-blocks/
├── cmssy.config.js        # Project configuration
├── blocks/                # Your blocks
│   └── hero/
│       ├── package.json   # Block metadata
│       ├── preview.json   # Preview data for dev server
│       └── src/
│           ├── index.tsx  # Block component
│           └── index.css  # Block styles
├── templates/             # Your page templates
├── public/                # Build output
│   └── @vendor/package-name/version/
│       ├── index.js
│       ├── index.css
│       └── package.json
├── package.json
└── .env                   # API credentials
```

## Block Metadata

Each block requires a `blockforge` section in its `package.json`:

```json
{
  "name": "@vendor/blocks.hero",
  "version": "1.0.0",
  "description": "Hero section block",
  "blockforge": {
    "packageType": "block",
    "displayName": "Hero Section",
    "category": "marketing",
    "tags": ["hero", "landing", "cta"],
    "pricing": {
      "licenseType": "free"
    },
    "schemaFields": [...],
    "defaultContent": {...}
  }
}
```

## Requirements

- Node.js 18+

## Complete Workflow

1. **Initialize**: `cmssy-forge init my-blocks`
2. **Develop**: `cmssy-forge dev` (hot reload + preview)
3. **Create**: `cmssy-forge create block my-block`
4. **Build**: `cmssy-forge build`
5. **Configure**: `cmssy-forge configure` (one-time)
6. **Deploy**: `cmssy-forge deploy --all`
7. **Review**: Your packages are submitted for Cmssy review
8. **Publish**: Once approved, they're available in the marketplace

## License

MIT
