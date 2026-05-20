import chalk from "chalk";
import fs from "fs-extra";
import { GraphQLClient } from "graphql-request";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import semver from "semver";
import { hasConfig, loadConfig } from "../utils/config.js";
import {
  GET_WORKSPACE_BLOCKS_QUERY,
  IMPORT_BLOCK_MUTATION,
  IMPORT_TEMPLATE_MUTATION,
  UPDATE_THEME_MUTATION,
} from "../utils/graphql.js";
import {
  loadBlockConfig,
  validateDefaultValues,
  validateSchema,
} from "../utils/block-config.js";
import {
  convertBlockTypeToSimple,
  convertConfigToPagesData,
  loadTemplateConfig,
} from "../utils/publish-helpers.js";
import { scanTheme } from "../utils/scanner.js";
import { convertThemeToInput } from "../utils/theme-builder.js";
import { packageResource } from "./package.js";
import { uploadPackage } from "./upload.js";
import {
  diffSchema,
  hasBreakingChanges,
  type Schema,
} from "../utils/schema-diff.js";

interface PublishOptions {
  workspace?: string;
  patch?: boolean;
  minor?: boolean;
  major?: boolean;
  bump?: boolean; // --no-bump sets this to false
  dryRun?: boolean;
  all?: boolean;
  overwriteContent?: boolean;
  zip?: boolean;
  force?: boolean;
}

interface PackageInfo {
  type: "block" | "template";
  name: string;
  path: string;
  packageJson: any;
  blockConfig?: any;
}

export async function publishCommand(
  packageNames: string[] = [],
  options: PublishOptions,
) {
  console.log(chalk.blue.bold("\n📦 Cmssy - Publish\n"));

  // Validate flags: must have --workspace
  if (!options.workspace) {
    console.error(
      chalk.red("✖ Specify publish target:\n") +
        chalk.white("  --workspace <id>       Publish to workspace\n") +
        chalk.white("\nExample: cmssy publish --all --workspace abc123\n"),
    );
    process.exit(1);
  }

  // Check configuration
  if (!hasConfig()) {
    console.error(chalk.red("✖ Not configured. Run: cmssy link\n"));
    process.exit(1);
  }

  const config = loadConfig();

  // Get workspace ID if --workspace without value
  let workspaceId = options.workspace;
  if (typeof options.workspace === "boolean" || options.workspace === "") {
    // Flag provided without value, check .env
    if (config.workspaceId) {
      workspaceId = config.workspaceId;
      console.log(chalk.gray(`Using workspace ID from .env: ${workspaceId}\n`));
    } else {
      const answer = await inquirer.prompt([
        {
          type: "input",
          name: "workspaceId",
          message: "Enter Workspace ID:",
          validate: (input) => {
            if (!input) {
              return "Workspace ID is required (or set CMSSY_WORKSPACE_ID in .env)";
            }
            return true;
          },
        },
      ]);
      workspaceId = answer.workspaceId;
    }
  }

  // Find cmssy.config.js
  const configPath = path.join(process.cwd(), "cmssy.config.js");
  if (!fs.existsSync(configPath)) {
    console.error(
      chalk.red("✖ Not a cmssy project (missing cmssy.config.js)\n"),
    );
    process.exit(1);
  }

  // Scan for packages to publish
  let packages = await scanPackages(packageNames, options);

  // Auto-detect and add template dependencies (blocks used in pages.json)
  // Only for workspace publish, not library
  if (options.workspace) {
    const templatesToProcess = packages.filter((p) => p.type === "template");

    for (const template of templatesToProcess) {
      const pagesJsonPath = path.join(template.path, "pages.json");
      let requiredBlockTypes = extractBlockTypesFromPagesJson(pagesJsonPath);

      // Fallback: if no pages.json, load from config.ts
      if (requiredBlockTypes.length === 0) {
        requiredBlockTypes = extractBlockTypesFromConfig(
          template.path,
          process.cwd(),
        );
      }

      if (requiredBlockTypes.length > 0) {
        // Find which blocks exist in the project
        const availableBlocks = findProjectBlocks(requiredBlockTypes);

        // Check which blocks are not already in the packages list
        const existingBlockNames = packages
          .filter((p) => p.type === "block")
          .map((p) => p.name);

        const missingBlocks = availableBlocks.filter(
          (b) => !existingBlockNames.includes(b),
        );

        if (missingBlocks.length > 0) {
          console.log(
            chalk.cyan(
              `\n📦 Auto-detected dependencies for ${template.name}:\n`,
            ),
          );
          missingBlocks.forEach((b) => console.log(chalk.gray(`  • ${b}`)));
          console.log("");

          // Scan and add missing blocks
          const dependencyPackages = await scanPackages(missingBlocks, {
            ...options,
            all: false,
          });

          // Insert dependencies BEFORE the template
          const templateIndex = packages.findIndex(
            (p) => p.name === template.name,
          );
          packages = [
            ...packages.slice(0, templateIndex),
            ...dependencyPackages,
            ...packages.slice(templateIndex),
          ];
        }
      }
    }
  }

  if (packages.length === 0) {
    console.log(chalk.yellow("⚠ No packages found to publish\n"));
    if (packageNames.length > 0) {
      console.log(chalk.gray("Packages specified:"));
      packageNames.forEach((name) => console.log(chalk.gray(`  • ${name}`)));
    }
    return;
  }

  // Show current versions
  console.log(chalk.cyan("Current versions:\n"));
  packages.forEach((pkg) => {
    console.log(
      chalk.white(
        `  ${pkg.packageJson.name}: ${chalk.bold(pkg.packageJson.version)}`,
      ),
    );
  });
  console.log("");

  // Version bumping - interactive or from flags
  let bumpType: "patch" | "minor" | "major" | null = null;

  // --no-bump flag explicitly disables version bump
  if (options.bump === false) {
    bumpType = null;
    console.log(chalk.gray("Version bump disabled (--no-bump)\n"));
  } else if (options.patch || options.minor || options.major) {
    // Use flag-based bump
    bumpType = options.patch ? "patch" : options.minor ? "minor" : "major";
  } else {
    // Interactive prompt - show calculated versions for first package as example
    const examplePkg = packages[0];
    const currentVersion = examplePkg.packageJson.version;
    const patchVersion = semver.inc(currentVersion, "patch");
    const minorVersion = semver.inc(currentVersion, "minor");
    const majorVersion = semver.inc(currentVersion, "major");

    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "bumpType",
        message: "Select version bump:",
        choices: [
          {
            name: `Patch (${currentVersion} → ${patchVersion}) - Bug fixes`,
            value: "patch",
          },
          {
            name: `Minor (${currentVersion} → ${minorVersion}) - New features, backward compatible`,
            value: "minor",
          },
          {
            name: `Major (${currentVersion} → ${majorVersion}) - Breaking changes`,
            value: "major",
          },
          {
            name: "No version bump - publish current version",
            value: null,
          },
        ],
      },
    ]);

    bumpType = answer.bumpType;
  }

  // Apply version bump if selected
  if (bumpType) {
    console.log(chalk.cyan(`\nVersion bump: ${bumpType}\n`));

    for (const pkg of packages) {
      const oldVersion = pkg.packageJson.version;
      const newVersion = semver.inc(oldVersion, bumpType);

      if (!newVersion) {
        console.error(
          chalk.red(`✖ Invalid version for ${pkg.name}: ${oldVersion}\n`),
        );
        continue;
      }

      pkg.packageJson.version = newVersion;

      // Update package.json
      const pkgPath = path.join(pkg.path, "package.json");
      fs.writeJsonSync(pkgPath, pkg.packageJson, { spaces: 2 });

      console.log(chalk.gray(`  ${pkg.name}: ${oldVersion} → ${newVersion}`));
    }
    console.log("");
  }

  console.log(chalk.cyan(`Publishing ${packages.length} package(s):\n`));
  packages.forEach((pkg) => {
    console.log(
      chalk.white(
        `  • ${pkg.packageJson.name} ${chalk.bold("v" + pkg.packageJson.version)}`,
      ),
    );
  });
  console.log("");

  // Schema diff: compare local vs remote and warn about breaking changes
  {
    const blocksWithConfig = packages.filter(
      (p) => p.type === "block" && p.blockConfig?.schema,
    );
    if (blocksWithConfig.length > 0) {
      // Fetch remote blocks for schema comparison
      let remoteBlocks: Array<{
        blockType: string;
        schemaFields: Array<{
          key: string;
          type: string;
          label?: string;
          required?: boolean;
          defaultValue?: unknown;
        }>;
      }> = [];
      try {
        const client = new GraphQLClient(config.apiUrl, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiToken}`,
            "X-Workspace-ID": workspaceId as string,
          },
        });
        const result: any = await client.request(GET_WORKSPACE_BLOCKS_QUERY);
        remoteBlocks = result.workspaceBlocks || [];
      } catch (error) {
        console.warn(
          chalk.yellow(
            "  ⚠ Could not fetch remote blocks; schema diff skipped.",
          ),
        );
        if (error instanceof Error) {
          console.warn(chalk.gray(`    ${error.message}`));
        }
        console.log("");
      }

      let hasAnyBreaking = false;
      for (const pkg of blocksWithConfig) {
        const blockType = convertBlockTypeToSimple(pkg.packageJson.name);
        const remote = remoteBlocks.find((b) => b.blockType === blockType);
        if (!remote || !remote.schemaFields?.length) continue;

        // Convert remote schemaFields array to Schema object
        const remoteSchema: Schema = {};
        for (const f of remote.schemaFields) {
          remoteSchema[f.key] = {
            type: f.type,
            label: f.label,
            required: f.required,
            defaultValue: f.defaultValue,
          };
        }

        const changes = diffSchema(pkg.blockConfig.schema, remoteSchema);
        if (changes.length === 0) continue;

        console.log(chalk.bold(`  Schema changes for ${pkg.name}:\n`));
        for (const c of changes) {
          if (c.kind === "breaking") {
            console.log(chalk.red(`  ⚠ BREAKING: ${c.message}`));
          } else {
            console.log(chalk.gray(`  ℹ ${c.message}`));
          }
        }
        console.log("");

        if (hasBreakingChanges(changes)) {
          hasAnyBreaking = true;
        }
      }

      if (hasAnyBreaking && !options.dryRun && !options.force) {
        const answer = await inquirer.prompt([
          {
            type: "confirm",
            name: "proceed",
            message: "Breaking schema changes detected. Continue publishing?",
            default: false,
          },
        ]);
        if (!answer.proceed) {
          console.log(chalk.yellow("\nPublish cancelled.\n"));
          return;
        }
      }
    }
  }

  if (options.overwriteContent) {
    console.log(
      chalk.yellow(
        "  ⚠ --overwrite-content will reset all page content to defaults\n",
      ),
    );
  }

  if (options.dryRun) {
    console.log(chalk.yellow("🔍 Dry run mode - nothing will be published\n"));
    return;
  }

  // --zip mode: package into ZIPs and upload
  if (options.zip) {
    console.log(
      chalk.cyan(
        `🏢 Target: Workspace (${workspaceId})\n` +
          "   Mode: ZIP package + upload\n",
      ),
    );

    const outputDir = path.join(process.cwd(), "packages");
    await fs.ensureDir(outputDir);

    // Package all blocks into ZIPs
    for (const pkg of packages) {
      await packageResource(
        {
          name: pkg.name,
          type: pkg.type,
          dir: pkg.path,
          packageJson: pkg.packageJson,
        },
        outputDir,
      );
    }

    // Upload all ZIPs
    let successCount = 0;
    let failCount = 0;
    for (const pkg of packages) {
      const version = pkg.packageJson.version || "1.0.0";
      const zipPath = path.join(outputDir, `${pkg.name}-${version}.zip`);
      const result = await uploadPackage(
        zipPath,
        workspaceId as string,
        config.apiUrl,
        config.apiToken!,
      );
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log("");
    if (failCount === 0) {
      console.log(
        chalk.green.bold(
          `✓ ${successCount} package(s) uploaded successfully\n`,
        ),
      );
    } else {
      console.log(
        chalk.yellow(`⚠ ${successCount} succeeded, ${failCount} failed\n`),
      );
    }
    return;
  }

  // Default: direct GraphQL publish
  console.log(
    chalk.cyan(
      `🏢 Target: Workspace (${workspaceId})\n` +
        "   Status: Published directly\n",
    ),
  );

  // Publish each package
  let successCount = 0;
  let errorCount = 0;
  const publishedBlocks: { name: string; blockType: string; path: string }[] =
    [];

  for (const pkg of packages) {
    const spinner = ora(
      `Publishing ${pkg.packageJson.name} to workspace...`,
    ).start();

    try {
      await publishToWorkspace(
        pkg,
        workspaceId as string,
        config.apiToken!,
        config.apiUrl,
        !options.overwriteContent,
      );
      spinner.succeed(
        chalk.green(`${pkg.packageJson.name} published to workspace`),
      );
      successCount++;
      if (pkg.type === "block") {
        // Derive blockType same way as publishToWorkspace
        const blockType = pkg.packageJson.name
          .replace(/@[^/]+\//, "")
          .replace(/^blocks\./, "");
        publishedBlocks.push({ name: pkg.name, blockType, path: pkg.path });
      }
    } catch (error: any) {
      spinner.fail(chalk.red(`✖ ${pkg.packageJson.name} failed`));

      // Extract detailed error information from GraphQL errors
      let errorMessage = error.message || "Unknown error";
      let errorCode: string | null = null;
      let isPlanLimitError = false;

      // graphql-request wraps errors in response.errors array
      if (error.response?.errors && error.response.errors.length > 0) {
        const graphqlError = error.response.errors[0];
        errorMessage = graphqlError.message;
        errorCode = graphqlError.extensions?.code || null;
        isPlanLimitError =
          errorCode === "PLAN_LIMIT_EXCEEDED" ||
          errorMessage.toLowerCase().includes("limit reached");

        // Show additional details for plan limit errors
        if (graphqlError.extensions?.resource) {
          console.error("");
          console.error(chalk.yellow.bold("  ⚠ Plan Limit Reached"));
          console.error(
            chalk.yellow(`    Resource: ${graphqlError.extensions.resource}`),
          );
          if (graphqlError.extensions.current !== undefined) {
            console.error(
              chalk.yellow(
                `    Usage: ${graphqlError.extensions.current}/${graphqlError.extensions.limit}`,
              ),
            );
          }
          if (graphqlError.extensions.plan) {
            console.error(
              chalk.yellow(`    Plan: ${graphqlError.extensions.plan}`),
            );
          }
          console.error(
            chalk.gray("    Upgrade your plan at: https://cmssy.com/pricing"),
          );
          console.error("");
        }
      }

      // Show error message prominently
      if (isPlanLimitError) {
        console.error(chalk.red.bold(`  ${errorMessage}`));
        if (errorCode) {
          console.error(chalk.gray(`  Error code: ${errorCode}`));
        }
      } else {
        console.error(chalk.red(`  Error: ${errorMessage}`));
        if (errorCode) {
          console.error(chalk.gray(`  Code: ${errorCode}`));
        }
      }
      console.error("");

      errorCount++;
    }
  }

  console.log("");
  if (errorCount === 0) {
    console.log(
      chalk.green.bold(`✓ ${successCount} package(s) published successfully\n`),
    );
  } else {
    console.log(
      chalk.yellow(`⚠ ${successCount} succeeded, ${errorCount} failed\n`),
    );
  }

  // Publish theme if present when using --all
  if (options.all) {
    const themeConfig = await scanTheme();
    if (themeConfig) {
      const spinner = ora("Publishing theme to workspace...").start();
      try {
        const themeClient = new GraphQLClient(config.apiUrl, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiToken}`,
            "X-Workspace-ID": workspaceId as string,
          },
        });

        const themeInput = convertThemeToInput(themeConfig);
        await themeClient.request(UPDATE_THEME_MUTATION, { input: themeInput });
        spinner.succeed(
          chalk.green(`Theme "${themeConfig.name}" published to workspace`),
        );
      } catch (error: any) {
        const msg = error?.response?.errors?.[0]?.message ?? error.message;
        if (msg?.includes("paid plan") || msg?.includes("PLAN_LIMIT")) {
          spinner.warn(
            chalk.yellow(
              "Theme publish skipped: theme customization requires a paid plan",
            ),
          );
        } else {
          spinner.fail(chalk.red(`Theme publish failed: ${msg}`));
        }
      }
    }
  }
}

/**
 * Extract block type names from pages.json (pages + layout positions)
 * Supports all layout positions: header, footer, sidebar_left, sidebar_right, top, bottom
 * @example "@cmssy-marketing/blocks.hero" -> "hero"
 */
function extractBlockTypesFromPagesJson(pagesJsonPath: string): string[] {
  if (!fs.existsSync(pagesJsonPath)) {
    return [];
  }

  const pagesData = fs.readJsonSync(pagesJsonPath);
  const blockTypes = new Set<string>();

  // Extract from pages
  for (const page of pagesData.pages || []) {
    for (const block of page.blocks || []) {
      if (block.type) {
        // Convert full name to simple type: "@scope/blocks.hero" -> "hero"
        let blockType = block.type;
        if (blockType.includes("/")) {
          blockType = blockType.split("/").pop()!;
        }
        if (blockType.startsWith("blocks.")) {
          blockType = blockType.substring(7);
        }
        blockTypes.add(blockType);
      }
    }
  }

  // Extract from global layoutPositions
  for (const [_position, data] of Object.entries(
    pagesData.layoutPositions || {},
  ) as [string, any][]) {
    if (data.type) {
      let blockType = data.type;
      if (blockType.includes("/")) {
        blockType = blockType.split("/").pop()!;
      }
      if (blockType.startsWith("blocks.")) {
        blockType = blockType.substring(7);
      }
      blockTypes.add(blockType);
    }
  }

  // Extract from per-page layoutPositions
  for (const page of pagesData.pages || []) {
    for (const [_position, data] of Object.entries(
      page.layoutPositions || {},
    ) as [string, any][]) {
      if (data.type) {
        let blockType = data.type;
        if (blockType.includes("/")) {
          blockType = blockType.split("/").pop()!;
        }
        if (blockType.startsWith("blocks.")) {
          blockType = blockType.substring(7);
        }
        blockTypes.add(blockType);
      }
    }
  }

  return Array.from(blockTypes);
}

/**
 * Find which blocks from a list exist in the project's blocks/ directory
 */
function findProjectBlocks(blockTypes: string[]): string[] {
  const blocksDir = path.join(process.cwd(), "blocks");
  if (!fs.existsSync(blocksDir)) {
    return [];
  }

  const existingBlocks = fs
    .readdirSync(blocksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return blockTypes.filter((bt) => existingBlocks.includes(bt));
}

/**
 * Extract block types from config.ts (fallback when pages.json is missing).
 */
function extractBlockTypesFromConfig(
  templatePath: string,
  projectRoot: string,
): string[] {
  const config = loadTemplateConfig(templatePath, projectRoot);
  if (!config) return [];

  const blockTypes = new Set<string>();

  // Extract from pages
  for (const page of config.pages || []) {
    for (const block of page.blocks || []) {
      if (block.type) {
        blockTypes.add(convertBlockTypeToSimple(block.type));
      }
    }
    // Per-page layout positions
    if (Array.isArray(page.layoutPositions)) {
      for (const lp of page.layoutPositions) {
        if (lp.type) blockTypes.add(convertBlockTypeToSimple(lp.type));
      }
    }
  }

  // Extract from global layoutPositions (array format from defineTemplate)
  if (Array.isArray(config.layoutPositions)) {
    for (const lp of config.layoutPositions) {
      if (lp.type) blockTypes.add(convertBlockTypeToSimple(lp.type));
    }
  }

  return Array.from(blockTypes);
}

async function scanPackages(
  packageNames: string[],
  options: PublishOptions,
): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  // Scan blocks
  const blocksDir = path.join(process.cwd(), "blocks");
  if (fs.existsSync(blocksDir)) {
    const blockDirs = fs
      .readdirSync(blocksDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const blockName of blockDirs) {
      // Filter: --all OR packageNames includes this block
      if (!options.all && !packageNames.includes(blockName)) {
        continue;
      }

      const blockPath = path.join(blocksDir, blockName);
      const pkgPath = path.join(blockPath, "package.json");

      if (!fs.existsSync(pkgPath)) {
        console.warn(
          chalk.yellow(`Warning: ${blockName} has no package.json, skipping`),
        );
        continue;
      }

      const packageJson = fs.readJsonSync(pkgPath);

      // Load config.ts
      const blockConfig = await loadBlockConfig(blockPath);

      if (!blockConfig && !packageJson.cmssy) {
        console.warn(
          chalk.yellow(
            `Warning: ${blockName} has no config.ts or package.json cmssy section, skipping`,
          ),
        );
        continue;
      }

      packages.push({
        type: "block",
        name: blockName,
        path: blockPath,
        packageJson,
        blockConfig,
      });
    }
  }

  // Scan templates
  const templatesDir = path.join(process.cwd(), "templates");
  if (fs.existsSync(templatesDir)) {
    const templateDirs = fs
      .readdirSync(templatesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const templateName of templateDirs) {
      // Filter: --all OR packageNames includes this template
      if (!options.all && !packageNames.includes(templateName)) {
        continue;
      }

      const templatePath = path.join(templatesDir, templateName);
      const pkgPath = path.join(templatePath, "package.json");

      if (!fs.existsSync(pkgPath)) {
        console.warn(
          chalk.yellow(
            `Warning: ${templateName} has no package.json, skipping`,
          ),
        );
        continue;
      }

      const packageJson = fs.readJsonSync(pkgPath);

      // Load config.ts
      const blockConfig = await loadBlockConfig(templatePath);

      if (!blockConfig && !packageJson.cmssy) {
        console.warn(
          chalk.yellow(
            `Warning: ${templateName} has no config.ts or package.json cmssy section, skipping`,
          ),
        );
        continue;
      }

      packages.push({
        type: "template",
        name: templateName,
        path: templatePath,
        packageJson,
        blockConfig,
      });
    }
  }

  return packages;
}

// Bundle source code with esbuild (combines all local imports into single
// file). CommonJS format to avoid ES module export statements.
async function bundleSourceCode(
  packagePath: string,
  serverActionFiles?: string[],
  serverActionNames?: string[],
): Promise<string> {
  const { build } = await import("esbuild");

  const srcDir = path.join(packagePath, "src");
  const tsxPath = path.join(srcDir, "index.tsx");
  const tsPath = path.join(srcDir, "index.ts");

  let entryPoint: string;
  if (fs.existsSync(tsxPath)) {
    entryPoint = tsxPath;
  } else if (fs.existsSync(tsPath)) {
    entryPoint = tsPath;
  } else {
    throw new Error(`Source code not found. Expected ${tsxPath} or ${tsPath}`);
  }

  // If server action files exist, use esbuild plugin to replace their
  // contents with stubs that call globalThis.__cmssyCallAction (CMS-224)
  const plugins =
    serverActionFiles?.length && serverActionNames?.length
      ? [createServerActionStubPlugin(serverActionFiles, serverActionNames)]
      : [];

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: "cjs", // CommonJS format (module.exports) - compatible with SSR VM
    platform: "browser", // Browser platform to avoid Node.js globals like 'process'
    jsx: "transform", // Transform JSX to React.createElement
    loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" },
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "next/image",
      "next/link",
      "next/font",
      "next/script",
    ],
    minify: true, // Minify for smaller bundle size
    define: {
      // Replace process.env references with static values
      "process.env.NODE_ENV": '"production"',
    },
    plugins,
  });

  const bundledCode = result.outputFiles![0].text;

  return bundledCode;
}

/**
 * Detect files with "use server" directive in block's src/ directory.
 * Only file-level directives are detected (top of file).
 */
function detectServerActionFiles(packagePath: string): string[] {
  const srcDir = path.join(packagePath, "src");
  if (!fs.existsSync(srcDir)) return [];

  const actionFiles: string[] = [];
  const files = fs.readdirSync(srcDir).filter((f) => /\.(ts|tsx)$/.test(f));

  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed === "" ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*")
      )
        continue;
      if (
        trimmed === '"use server"' ||
        trimmed === "'use server'" ||
        trimmed === '"use server";' ||
        trimmed === "'use server';"
      ) {
        actionFiles.push(filePath);
      }
      break;
    }
  }

  return actionFiles;
}

/**
 * Bundle server action files separately for server-side execution.
 * Returns the bundled code and list of exported action function names.
 */
async function bundleServerActions(
  actionFiles: string[],
): Promise<{ code: string; actionNames: string[] }> {
  const { build } = await import("esbuild");

  const result = await build({
    entryPoints: actionFiles,
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    loader: { ".tsx": "tsx", ".ts": "ts" },
    external: ["react", "react-dom", "react/jsx-runtime"],
    minify: true,
    metafile: true,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  });

  const code = result.outputFiles![0].text;

  const actionNames: string[] = [];
  if (result.metafile) {
    for (const output of Object.values(result.metafile.outputs)) {
      if (output.exports) {
        actionNames.push(
          ...output.exports.filter(
            (e) => e !== "default" && e !== "__esModule",
          ),
        );
      }
    }
  }

  return { code, actionNames };
}

/**
 * Create an esbuild plugin that replaces "use server" file contents
 * with client-side stubs that call globalThis.__cmssyCallAction.
 */
function createServerActionStubPlugin(
  actionFiles: string[],
  actionNames: string[],
) {
  const actionFileSet = new Set(actionFiles.map((f) => path.resolve(f)));

  return {
    name: "server-action-stub",
    setup(build: { onLoad: Function }) {
      build.onLoad({ filter: /\.(ts|tsx)$/ }, (args: { path: string }) => {
        if (!actionFileSet.has(path.resolve(args.path))) return null;

        const stubs = actionNames
          .map(
            (name) =>
              `module.exports.${name} = function() { return globalThis.__cmssyCallAction("${name}", Array.prototype.slice.call(arguments)); };`,
          )
          .join("\n");

        return {
          contents: `"use strict";\n${stubs}`,
          loader: "js",
        };
      });
    },
  };
}

// Compile CSS with optional Tailwind support
async function compileCss(
  packagePath: string,
  bundledSourceCode: string,
): Promise<string | undefined> {
  const srcDir = path.join(packagePath, "src");
  const cssPath = path.join(srcDir, "index.css");

  if (!fs.existsSync(cssPath)) {
    return undefined;
  }

  let cssContent = fs.readFileSync(cssPath, "utf-8");

  // If no Tailwind/PostCSS imports, return raw CSS
  if (!cssContent.includes("@import") && !cssContent.includes("@tailwind")) {
    return cssContent;
  }

  // Load PostCSS from project
  const { default: postcss } = await import("postcss");

  // Check for Tailwind v4 vs v3
  const projectRoot = process.cwd();

  const projectPackageJson = fs.readJsonSync(
    path.join(projectRoot, "package.json"),
  );
  const hasTailwindV4 = !!(
    projectPackageJson.devDependencies?.["@tailwindcss/postcss"] ||
    projectPackageJson.dependencies?.["@tailwindcss/postcss"]
  );

  if (hasTailwindV4) {
    // Tailwind v4: @tailwindcss/postcss handles @import itself, no postcss-import needed
    const tailwindV4Path = path.join(
      projectRoot,
      "node_modules",
      "@tailwindcss/postcss",
      "dist",
      "index.mjs",
    );
    const tailwindV4Module = await import(tailwindV4Path);
    const tailwindPlugin = tailwindV4Module.default || tailwindV4Module;

    const result = await postcss([tailwindPlugin]).process(cssContent, {
      from: cssPath,
    });

    return result.css;
  } else {
    // Tailwind v3: needs postcss-import + tailwindcss
    const postcssImportPath = path.join(
      projectRoot,
      "node_modules",
      "postcss-import",
      "index.js",
    );
    const { default: postcssImport } = await import(postcssImportPath);

    const importPlugin = postcssImport({
      path: [path.join(projectRoot, "styles")],
    });

    cssContent = cssContent.replace(
      /@import\s+["']tailwindcss["'];?/g,
      "@tailwind base;\n@tailwind components;\n@tailwind utilities;",
    );

    const tailwindcssPath = path.join(
      projectRoot,
      "node_modules",
      "tailwindcss",
      "lib",
      "index.js",
    );
    const tailwindcssModule = await import(tailwindcssPath);
    const tailwindcss = tailwindcssModule.default || tailwindcssModule;
    const tailwindPlugin = tailwindcss({
      content: [{ raw: bundledSourceCode, extension: "tsx" }],
    });

    const result = await postcss([importPlugin, tailwindPlugin]).process(
      cssContent,
      {
        from: cssPath,
      },
    );

    return result.css;
  }
}

/**
 * Convert full block type name to simple type.
 * "@cmssy-marketing/blocks.hero" -> "hero"
 * "@vendor/blocks.pricing-table" -> "pricing-table"
 * "hero" -> "hero" (already simple)
 */

async function publishToWorkspace(
  pkg: PackageInfo,
  workspaceId: string,
  apiToken: string,
  apiUrl: string,
  preserveContent: boolean,
): Promise<void> {
  const {
    packageJson,
    path: packagePath,
    blockConfig,
    type: packageType,
  } = pkg;

  // Use blockConfig if available, fallback to package.json cmssy
  const metadata = blockConfig || packageJson.cmssy || {};

  // Validate schema + defaultValue types at publish time
  if (blockConfig?.schema) {
    const schemaResult = await validateSchema(blockConfig.schema, packagePath);
    const defaultsResult = validateDefaultValues(blockConfig.schema);
    const allErrors = [
      ...schemaResult.errors.map((e) => `[schema] ${e}`),
      ...defaultsResult.errors.map((e) => `[defaultValue] ${e}`),
    ];
    if (allErrors.length > 0) {
      throw new Error(
        `Validation failed for ${packageJson.name}:\n${allErrors.join("\n")}`,
      );
    }
  }

  // Generate block_type from package name
  // @cmssy/blocks.hero -> hero
  const blockType = packageJson.name
    .replace(/@[^/]+\//, "")
    .replace(/^blocks\./, "")
    .replace(/^templates\./, "");

  // Templates have no source code — skip compilation
  let bundledSourceCode: string | undefined;
  let compiledCss: string | undefined;
  let serverActionCode: string | undefined;
  let serverActionNames: string[] = [];

  if (packageType !== "template") {
    // Detect "use server" files (CMS-224)
    const actionFiles = detectServerActionFiles(packagePath);

    if (actionFiles.length > 0) {
      const actionBundle = await bundleServerActions(actionFiles);
      serverActionCode = actionBundle.code;
      serverActionNames = actionBundle.actionNames;

      console.log(
        chalk.cyan(
          `  ⚡ Server actions detected: ${serverActionNames.join(", ")}`,
        ),
      );
    }

    // Bundle source code (combines all local imports into single CJS file)
    // If server actions exist, stubs replace "use server" file contents
    bundledSourceCode = await bundleSourceCode(
      packagePath,
      actionFiles.length > 0 ? actionFiles : undefined,
      serverActionNames.length > 0 ? serverActionNames : undefined,
    );

    // Compile CSS (with Tailwind if needed)
    compiledCss = await compileCss(packagePath, bundledSourceCode);
  }

  // Convert config.ts schema to schemaFields if using blockConfig
  let schemaFields = metadata.schemaFields || [];
  if (blockConfig && blockConfig.schema) {
    schemaFields = convertSchemaToFields(blockConfig.schema);
  }

  // Build input with inline sourceCode and cssCode
  // Backend will handle uploading to Blob Storage
  const input: Record<string, any> = {
    blockType,
    name: metadata.displayName || metadata.name || packageJson.name,
    description: packageJson.description || metadata.description || "",
    icon: metadata.icon || "Blocks",
    category: metadata.category || "Custom",
    sourceCode: bundledSourceCode,
    cssCode: compiledCss,
    schemaFields,
    defaultContent: extractDefaultContent(blockConfig?.schema || {}),
    sourceRegistry: "local",
    sourceItem: packageJson.name,
    version: packageJson.version || "1.0.0",
    packageType, // "block" or "template"
    preserveContent,
    // Server action support (CMS-224)
    serverActionCode: serverActionCode || undefined,
    serverActions: serverActionNames.length > 0 ? serverActionNames : undefined,
  };

  // Add layoutPosition if defined (for layout blocks)
  if (blockConfig?.layoutPosition) {
    input.layoutPosition = blockConfig.layoutPosition;
  }

  // Add requires if defined
  if (blockConfig?.requires) {
    input.requires = blockConfig.requires;
  }

  // Check if this is a template with pages data (pages.json or config.ts)
  const isTemplateType = packageType === "template";
  const pagesJsonPath = path.join(packagePath, "pages.json");
  const hasPagesJson = isTemplateType && fs.existsSync(pagesJsonPath);

  // Fallback: load from config.ts if no pages.json
  let hasTemplateData = hasPagesJson;
  let configPagesData: {
    layoutPositions: Record<string, any>;
    pages: any[];
  } | null = null;
  if (isTemplateType && !hasPagesJson) {
    const templateConfig = loadTemplateConfig(packagePath, process.cwd());
    if (
      templateConfig &&
      (templateConfig.pages || templateConfig.layoutPositions)
    ) {
      configPagesData = convertConfigToPagesData(templateConfig);
      hasTemplateData = true;
    }
  }

  // Create client with workspace header
  const client = new GraphQLClient(apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      "X-Workspace-ID": workspaceId,
    },
  });

  // Send mutation with timeout using Promise.race
  const TIMEOUT_MS = 180000; // 3 minutes

  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          "Block upload timed out after 3 minutes. This may be due to:\n" +
            "  - Large file size (try reducing bundle size)\n" +
            "  - Slow network connection\n" +
            "  - Backend processing issues\n" +
            "Check backend logs for more details.",
        ),
      );
    }, TIMEOUT_MS);
  });

  // Use different mutation for templates with pages
  if (hasTemplateData) {
    // Load pages data from pages.json or config.ts fallback
    const pagesData = hasPagesJson
      ? fs.readJsonSync(pagesJsonPath)
      : configPagesData;

    // Convert to mutation input format
    // IMPORTANT: Convert full block names to simple types
    // "@cmssy-marketing/blocks.hero" -> "hero"
    const pages = (pagesData!.pages || []).map((page: any) => {
      // Normalize slug: homepage = "/", others strip leading slashes
      const slug = page.slug === "/" ? "/" : page.slug.replace(/^\/+/, "");

      const result: any = {
        name: page.name,
        slug,
        blocks: (page.blocks || []).map((block: any) => ({
          type: convertBlockTypeToSimple(block.type),
          content: block.content || {},
        })),
      };
      // Pass pageType if defined (e.g. "post" for blog post pages)
      if (page.pageType) {
        result.pageType = page.pageType;
      }
      // Pass explicit parentSlug if defined (normalize: strip leading slashes)
      if (page.parentSlug) {
        result.parentSlug = page.parentSlug.replace(/^\/+/, "");
      }
      // Per-page layout positions (e.g. sidebar_left only on /docs)
      if (page.layoutPositions) {
        // Support both object format (pages.json) and array format (config.ts)
        const lpEntries = Array.isArray(page.layoutPositions)
          ? page.layoutPositions.map((lp: any) => [lp.position, lp])
          : Object.entries(page.layoutPositions);
        result.layoutPositions = lpEntries.map(
          ([position, data]: [string, any]) => ({
            position,
            type: convertBlockTypeToSimple(data.type),
            content: data.content || {},
          }),
        );
      }
      return result;
    });

    // Convert layoutPositions — support both object (pages.json) and array (config.ts) formats
    const rawLayoutPositions = pagesData!.layoutPositions || {};
    const layoutEntries: [string, any][] = Array.isArray(rawLayoutPositions)
      ? rawLayoutPositions.map((lp: any) => [lp.position, lp])
      : Object.entries(rawLayoutPositions);
    const layoutPositions = layoutEntries.map(([position, data]) => ({
      position,
      type: convertBlockTypeToSimple(data.type),
      content: data.content || {},
    }));

    // Extract unique block types required by this template
    const requiredBlockTypes = new Set<string>();
    for (const page of pages) {
      for (const block of page.blocks) {
        requiredBlockTypes.add(block.type);
      }
      // Include per-page layout position block types
      if (page.layoutPositions) {
        for (const lp of page.layoutPositions) {
          requiredBlockTypes.add(lp.type);
        }
      }
    }
    for (const lp of layoutPositions) {
      requiredBlockTypes.add(lp.type);
    }

    // Add pages, layoutPositions, and requiredBlocks to input
    input.pages = pages;
    input.layoutPositions = layoutPositions;
    input.requiredBlocks = Array.from(requiredBlockTypes);

    // Add pageTypes if defined in template config
    const pageTypes = pagesData?.pageTypes;
    if (Array.isArray(pageTypes) && pageTypes.length > 0) {
      input.pageTypes = pageTypes;
    }

    // Remove fields not supported by ImportTemplateInput
    // (these are only for blocks, not templates)
    delete input.packageType;
    delete input.sourceCode;
    delete input.cssCode;

    const requestPromise = client.request(IMPORT_TEMPLATE_MUTATION, { input });

    try {
      const result = await Promise.race([requestPromise, timeoutPromise]);
      clearTimeout(timeoutId!);

      if (!result.importTemplate?.success) {
        throw new Error(
          result.importTemplate?.message ||
            "Failed to import template to workspace",
        );
      }

      // Log template import summary
      const { pagesCreated, pagesUpdated } = result.importTemplate;
      console.log(
        chalk.gray(
          `  └─ ${pagesCreated} pages created, ${pagesUpdated} updated`,
        ),
      );
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  } else {
    // Standard block import — remove fields not in ImportBlockInput
    delete input.preserveContent;
    delete input.packageType;
    const requestPromise = client.request(IMPORT_BLOCK_MUTATION, { input });

    try {
      const result = await Promise.race([requestPromise, timeoutPromise]);
      clearTimeout(timeoutId!);

      if (!result.importBlock) {
        throw new Error("Failed to import block to workspace");
      }
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }
}

// Re-export from publish-helpers (single source of truth)
// DO NOT duplicate convertSchemaToFields here
import { convertSchemaToFields } from "../utils/publish-helpers.js";
// Single source of truth shared with publish-block-buildtime so the
// two publish paths can't drift on what "default content" means.
import { extractDefaultContent } from "../utils/block-config.js";
