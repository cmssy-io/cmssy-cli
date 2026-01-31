#!/usr/bin/env node

import { Command } from "commander";
import { addSourceCommand } from "./commands/add-source.js";
import { buildCommand } from "./commands/build.js";
import { configureCommand } from "./commands/configure.js";
import { createCommand } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { migrateCommand } from "./commands/migrate.js";
import { publishCommand } from "./commands/publish.js";
import { packageCommand } from "./commands/package.js";
import { uploadCommand } from "./commands/upload.js";
import { workspacesCommand } from "./commands/workspaces.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

const program = new Command();

program
  .name("cmssy")
  .description(
    "Unified CLI for building and publishing blocks to Cmssy marketplace"
  )
  .version(packageJson.version)
  .addHelpText("after", `
Examples:
  $ cmssy init my-blocks          Create a new project
  $ cmssy create block hero       Add a new block to your project
  $ cmssy dev                     Start dev server with hot reload
  $ cmssy build                   Build all blocks for production
  $ cmssy publish --all -w abc    Publish all to workspace

Workflow:
  1. init     → Create project with example block
  2. create   → Add more blocks/templates
  3. dev      → Develop with live preview
  4. build    → Bundle for production
  5. publish  → Deploy to marketplace or workspace

Documentation: https://cmssy.io/docs/cli
`);

// cmssy init
program
  .command("init")
  .description("Initialize a new Cmssy project")
  .argument("[name]", "Project name (creates directory)")
  .option(
    "-f, --framework <framework>",
    "Framework (react, vue, angular, vanilla)",
    "react"
  )
  .addHelpText("after", `
Examples:
  $ cmssy init                    Create project in current directory
  $ cmssy init my-blocks          Create project in ./my-blocks
  $ cmssy init -f vue my-blocks   Create Vue project
`)
  .action(initCommand);

// cmssy create
const create = program
  .command("create")
  .description("Create a new block or template")
  .addHelpText("after", `
Examples:
  $ cmssy create block hero
  $ cmssy create block pricing -c marketing -t "pricing,plans"
  $ cmssy create template landing-page
`);

create
  .command("block")
  .description("Create a new block with scaffold files")
  .argument("<name>", "Block name (kebab-case recommended)")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-d, --description <description>", "Block description")
  .option("-c, --category <category>", "Category: marketing, typography, media, layout, forms, navigation, other")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .addHelpText("after", `
Creates:
  blocks/<name>/
  ├── block.config.ts   Type-safe configuration
  ├── package.json      Name and version
  ├── preview.json      Preview data for dev server
  └── src/
      ├── index.tsx     Entry point (mount/unmount)
      ├── Block.tsx     React component
      ├── block.d.ts    Auto-generated types
      └── index.css     Styles
`)
  .action(createCommand.block);

create
  .command("template")
  .description("Create a new page template")
  .argument("<name>", "Template name (kebab-case recommended)")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-d, --description <description>", "Template description")
  .action(createCommand.page);

// cmssy build
program
  .command("build")
  .description("Build blocks and templates for production")
  .option("--block <names...>", "Build only specific blocks/templates")
  .option("--framework <framework>", "Override framework from config")
  .addHelpText("after", `
Examples:
  $ cmssy build                        Build all blocks and templates
  $ cmssy build --block hero pricing   Build only hero and pricing blocks

Output:
  public/@vendor/blocks.<name>/<version>/
  ├── index.js      Bundled JavaScript
  ├── index.css     Styles
  └── package.json  Metadata for marketplace
`)
  .action(buildCommand);

// cmssy dev
program
  .command("dev")
  .description("Start development server with hot reload")
  .option("-p, --port <port>", "Port number", "3000")
  .addHelpText("after", `
Examples:
  $ cmssy dev                Start on default port 3000
  $ cmssy dev -p 8080        Start on port 8080

Features:
  • Live preview of all blocks/templates
  • Hot reload on file changes
  • Auto-regenerates types on block.config.ts changes
`)
  .action(devCommand);

// cmssy configure
program
  .command("configure")
  .description("Configure Cmssy API credentials")
  .option("--api-url <url>", "Cmssy API URL", "https://api.cmssy.io/graphql")
  .addHelpText("after", `
Stores credentials in .env file:
  CMSSY_API_TOKEN=your-token
  CMSSY_API_URL=https://api.cmssy.io/graphql

Get your API token at: https://cmssy.io/settings/tokens
`)
  .action(configureCommand);

// cmssy publish
program
  .command("publish [packages...]")
  .description(
    "Publish blocks/templates to marketplace or workspace\n\n" +
    "  Packages are directory names from blocks/ or templates/ folders.\n" +
    "  Examples:\n" +
    "    cmssy publish hero faq --marketplace --patch\n" +
    "    cmssy publish --all --workspace abc123"
  )
  .option("-m, --marketplace", "Publish to public marketplace (requires review)")
  .option("-w, --workspace [id]", "Publish to workspace (private, no review)")
  .option("--all", "Publish all blocks and templates")
  .option("--patch", "Bump patch version (1.0.0 -> 1.0.1)")
  .option("--minor", "Bump minor version (1.0.0 -> 1.1.0)")
  .option("--major", "Bump major version (1.0.0 -> 2.0.0)")
  .option("--no-bump", "Publish without version bump")
  .option("--dry-run", "Preview what would be published without uploading")
  .action(publishCommand);

// cmssy sync
program
  .command("sync")
  .description("Pull blocks from marketplace to local project")
  .argument("[package]", "Package slug (e.g., @vendor/blocks.hero)")
  .option("--workspace <id>", "Sync from specific workspace")
  .addHelpText("after", `
Examples:
  $ cmssy sync @acme/blocks.hero           Sync from marketplace
  $ cmssy sync --workspace abc123          Sync all from workspace
`)
  .action(syncCommand);

// cmssy migrate
program
  .command("migrate [block-name]")
  .description("Migrate legacy package.json config to block.config.ts")
  .addHelpText("after", `
Examples:
  $ cmssy migrate hero     Migrate specific block
  $ cmssy migrate          Migrate all blocks/templates

Converts:
  package.json { cmssy: {...} }  →  block.config.ts
`)
  .action(migrateCommand);

// cmssy package
program
  .command("package [packages...]")
  .description("Package blocks/templates into ZIP files for manual upload")
  .option("--all", "Package all blocks and templates")
  .option("-o, --output <dir>", "Output directory", "packages")
  .addHelpText("after", `
Examples:
  $ cmssy package hero faq         Package specific blocks
  $ cmssy package --all            Package everything
  $ cmssy package -o dist --all    Package to custom directory

Use with 'upload' for two-step deployment.
`)
  .action(packageCommand);

// cmssy upload
program
  .command("upload [files...]")
  .description("Upload ZIP packages to workspace")
  .option("-w, --workspace <id>", "Target workspace ID")
  .option("--all", "Upload all from packages directory")
  .addHelpText("after", `
Examples:
  $ cmssy upload hero.zip -w abc123     Upload single package
  $ cmssy upload --all -w abc123        Upload all packages
`)
  .action(uploadCommand);

// cmssy workspaces
program
  .command("workspaces")
  .description("List your workspaces and their IDs")
  .addHelpText("after", `
Use workspace IDs with:
  $ cmssy publish --workspace <id>
  $ cmssy upload --workspace <id>
  $ cmssy sync --workspace <id>
`)
  .action(workspacesCommand);

// cmssy add-source
program
  .command("add-source [blocks...]")
  .description("Upload source code to workspace for AI Block Builder")
  .option("-w, --workspace <id>", "Target workspace ID")
  .option("--all", "Add source for all local blocks")
  .addHelpText("after", `
Examples:
  $ cmssy add-source hero pricing -w abc123
  $ cmssy add-source --all -w abc123

Enables AI Block Builder to edit your blocks in the Cmssy editor.
`)
  .action(addSourceCommand);

program.parse();
