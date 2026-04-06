#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import { addSourceCommand } from "./commands/add-source.js";
import { buildCommand } from "./commands/build.js";
import { codegenCommand } from "./commands/codegen.js";
import { configureCommand } from "./commands/configure.js";
import { linkCommand } from "./commands/link.js";
import { createCommand } from "./commands/create.js";
import { devCommand } from "./commands/dev.js";
import { doctorCommand } from "./commands/doctor.js";
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
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);

const program = new Command();

program
  .name("cmssy")
  .description(
    "Unified CLI for building and publishing blocks to Cmssy design library",
  )
  .version(packageJson.version)
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy init my-blocks          Create new project (uses create-next-app)
  $ cmssy init                    Add Cmssy to existing Next.js project
  $ cmssy create block hero       Add a new block to your project
  $ cmssy dev                     Start dev server with hot reload
  $ cmssy build                   Build all blocks for production
  $ cmssy publish --all -w abc    Publish all to workspace

Workflow:
  1. init     → Create project with example block
  2. link     → Connect to your workspace
  3. create   → Add more blocks/templates
  4. dev      → Develop with live preview
  5. build    → Bundle for production
  6. publish  → Deploy to workspace

Documentation: https://cmssy.io/docs/cli
`,
  );

// cmssy init
program
  .command("init")
  .description("Initialize a new Cmssy project or add Cmssy to existing one")
  .argument(
    "[name]",
    "Project name (creates new directory with create-next-app)",
  )
  .option("-y, --yes", "Skip prompts and use defaults")
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy init my-blocks          New project (runs create-next-app)
  $ cmssy init -y my-blocks       New project with defaults (no prompts)
  $ cmssy init                    Add Cmssy to existing Next.js project
`,
  )
  .action((name, options) => initCommand(name, options));

// cmssy create
const create = program
  .command("create")
  .description("Create a new block or template")
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy create block hero
  $ cmssy create block pricing -c marketing -t "pricing,plans"
  $ cmssy create template landing-page
`,
  );

create
  .command("block")
  .description("Create a new block with scaffold files")
  .argument("<name>", "Block name (kebab-case recommended)")
  .option("-y, --yes", "Skip prompts and use defaults")
  .option("-d, --description <description>", "Block description")
  .option(
    "-c, --category <category>",
    "Category: marketing, typography, media, layout, forms, navigation, other",
  )
  .option("-t, --tags <tags>", "Comma-separated tags")
  .addHelpText(
    "after",
    `
Creates:
  blocks/<name>/
  ├── config.ts         Type-safe configuration
  ├── package.json      Name and version
  ├── preview.json      Preview data for dev server
  └── src/
      ├── index.tsx     Entry point (mount/unmount)
      ├── Block.tsx     React component
      ├── block.d.ts    Auto-generated types
      └── index.css     Styles
`,
  )
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
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy build                        Build all blocks and templates
  $ cmssy build --block hero pricing   Build only hero and pricing blocks

Output:
  public/@vendor/blocks.<name>/<version>/
  ├── index.js      Bundled JavaScript
  ├── index.css     Styles
  └── package.json  Metadata for design library
`,
  )
  .action(buildCommand);

// cmssy dev
program
  .command("dev")
  .description("Start development server with hot reload")
  .option("-p, --port <port>", "Port number", "3000")
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy dev                Start on default port 3000
  $ cmssy dev -p 8080        Start on port 8080

Features:
  • Live preview of all blocks/templates
  • Hot reload on file changes
  • Auto-regenerates types on config.ts changes
`,
  )
  .action(devCommand);

// cmssy link
program
  .command("link")
  .description("Connect project to a Cmssy workspace")
  .option(
    "--api-url <url>",
    "Cmssy API URL (default: existing or https://api.cmssy.io/graphql)",
  )
  .option("--token <token>", "API token (skip interactive prompt)")
  .option(
    "-w, --workspace <id>",
    "Workspace ID or slug (skip interactive picker)",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy link                                    Interactive setup
  $ cmssy link --token bf_xxx --workspace abc123   Non-interactive (CI)

Saves credentials and workspace ID to .env file.
Get your API token at: https://cmssy.io/settings/tokens
`,
  )
  .action(linkCommand);

// cmssy configure (hidden - deprecated, use `cmssy link`)
program.addCommand(
  new Command("configure")
    .description(
      "Configure Cmssy API credentials (deprecated: use `cmssy link`)",
    )
    .option("--api-url <url>", "Cmssy API URL")
    .action((options) => {
      console.log(
        chalk.yellow(
          "\n⚠ `cmssy configure` is deprecated. Use `cmssy link` instead.\n",
        ),
      );
      return configureCommand(options);
    }),
  { hidden: true },
);

// cmssy doctor
program
  .command("doctor")
  .description("Check project setup, API connection, and block health")
  .addHelpText(
    "after",
    `
Runs diagnostic checks:
  • Environment (Node.js, npm, next, react)
  • Configuration (.env, API token, workspace ID)
  • API connection and workspace access
  • Block structure validation
  • Dependency versions
`,
  )
  .action(doctorCommand);

// cmssy publish
program
  .command("publish [packages...]")
  .description(
    "Publish blocks/templates to workspace\n\n" +
      "  Packages are directory names from blocks/ or templates/ folders.\n" +
      "  Examples:\n" +
      "    cmssy publish hero faq --workspace abc123 --patch\n" +
      "    cmssy publish --all --workspace abc123",
  )
  .option("-w, --workspace [id]", "Publish to workspace")
  .option("--all", "Publish all blocks and templates")
  .option("--patch", "Bump patch version (1.0.0 -> 1.0.1)")
  .option("--minor", "Bump minor version (1.0.0 -> 1.1.0)")
  .option("--major", "Bump major version (1.0.0 -> 2.0.0)")
  .option("--no-bump", "Publish without version bump")
  .option("--dry-run", "Preview what would be published without uploading")
  .option(
    "--overwrite-content",
    "Overwrite existing defaultContent and schemaFields on republish",
  )
  .option(
    "--zip",
    "Package into ZIP files and upload (instead of direct GraphQL)",
  )
  .option(
    "--with-source",
    "Upload source code for AI Block Builder after publish",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy publish --all -w abc123              Publish all, preserve content
  $ cmssy publish hero -w abc123 --patch       Publish hero with patch bump
  $ cmssy publish --all --zip -w abc123        Package as ZIP and upload
  $ cmssy publish --all --with-source -w abc   Publish + upload source for AI
  $ cmssy publish --all -w abc123 --overwrite-content
                                               Force overwrite content/schema

Content preservation:
  By default, republishing a block preserves existing defaultContent and
  schemaFields in the workspace. Use --overwrite-content to reset them
  from config.ts / preview.json.
`,
  )
  .action(publishCommand);

// cmssy sync
program
  .command("sync")
  .description("Pull blocks from design library to local project")
  .argument("[package]", "Package slug (e.g., @cmssy/blocks.hero)")
  .option("--workspace <id>", "Sync from specific workspace")
  .addHelpText(
    "after",
    `
Examples:
  $ cmssy sync @cmssy/blocks.hero          Sync from design library
  $ cmssy sync --workspace abc123          Sync all from workspace
`,
  )
  .action(syncCommand);

// cmssy migrate (hidden - legacy command, all projects already migrated)
program.addCommand(
  new Command("migrate")
    .argument("[block-name]")
    .description("Migrate legacy package.json config to config.ts")
    .addHelpText(
      "after",
      `
Examples:
  $ cmssy migrate hero     Migrate specific block
  $ cmssy migrate          Migrate all blocks/templates

Converts:
  package.json { cmssy: {...} }  →  config.ts
`,
    )
    .action(migrateCommand),
  { hidden: true },
);

// cmssy package (hidden - use `cmssy publish --zip` instead)
program.addCommand(
  new Command("package")
    .argument("[packages...]")
    .description("Package blocks/templates into ZIP files for manual upload")
    .option("--all", "Package all blocks and templates")
    .option("-o, --output <dir>", "Output directory", "packages")
    .addHelpText(
      "after",
      `
Examples:
  $ cmssy package hero faq         Package specific blocks
  $ cmssy package --all            Package everything
  $ cmssy package -o dist --all    Package to custom directory

Use with 'upload' for two-step deployment.
`,
    )
    .action(packageCommand),
  { hidden: true },
);

// cmssy upload (hidden - use `cmssy publish --zip` instead)
program.addCommand(
  new Command("upload")
    .argument("[files...]")
    .description("Upload ZIP packages to workspace")
    .option("-w, --workspace <id>", "Target workspace ID")
    .option("--all", "Upload all from packages directory")
    .addHelpText(
      "after",
      `
Examples:
  $ cmssy upload hero.zip -w abc123     Upload single package
  $ cmssy upload --all -w abc123        Upload all packages
`,
    )
    .action(uploadCommand),
  { hidden: true },
);

// cmssy workspaces
program
  .command("workspaces")
  .description("List your workspaces and their IDs")
  .addHelpText(
    "after",
    `
Use workspace IDs with:
  $ cmssy publish --workspace <id>
  $ cmssy upload --workspace <id>
  $ cmssy sync --workspace <id>
`,
  )
  .action(workspacesCommand);

// cmssy add-source (hidden - use `cmssy publish --with-source` instead)
program.addCommand(
  new Command("add-source")
    .argument("[blocks...]")
    .description("Upload source code to workspace for AI Block Builder")
    .option("-w, --workspace <id>", "Target workspace ID")
    .option("--all", "Add source for all local blocks")
    .addHelpText(
      "after",
      `
Examples:
  $ cmssy add-source hero pricing -w abc123
  $ cmssy add-source --all -w abc123

Enables AI Block Builder to edit your blocks in the Cmssy editor.
`,
    )
    .action(addSourceCommand),
  { hidden: true },
);

// cmssy codegen (hidden - use `cmssy init --graphql` for setup)
program.addCommand(
  new Command("codegen")
    .description(
      "Generate TypeScript types from workspace public GraphQL schema",
    )
    .option("-w, --workspace <slug>", "Workspace slug")
    .option("-o, --output <path>", "Output file path", "src/graphql/types.ts")
    .option(
      "--init",
      "Generate codegen.ts config file instead of running codegen",
    )
    .addHelpText(
      "after",
      `
Examples:
  $ cmssy codegen --workspace my-workspace
  $ cmssy codegen --init
  $ cmssy codegen -o src/types/api.ts
`,
    )
    .action(codegenCommand),
  { hidden: true },
);

program.parse();
