import chalk from "chalk";
import fs from "fs-extra";
import { GraphQLClient } from "graphql-request";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import semver from "semver";
import { hasConfig, loadConfig } from "../utils/config.js";
import {
  IMPORT_BLOCK_MUTATION,
  IMPORT_TEMPLATE_MUTATION,
} from "../utils/graphql.js";
import { loadBlockConfig, validateSchema } from "../utils/block-config.js";

interface PublishOptions {
  workspace?: string;
  patch?: boolean;
  minor?: boolean;
  major?: boolean;
  bump?: boolean; // --no-bump sets this to false
  dryRun?: boolean;
  all?: boolean;
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
    console.error(chalk.red("✖ Not configured. Run: cmssy configure\n"));
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
      const requiredBlockTypes = extractBlockTypesFromPagesJson(pagesJsonPath);

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

  if (options.dryRun) {
    console.log(chalk.yellow("🔍 Dry run mode - nothing will be published\n"));
    return;
  }

  // Show target info
  console.log(
    chalk.cyan(
      `🏢 Target: Workspace (${workspaceId})\n` +
        "   Status: Published directly\n",
    ),
  );

  // Publish each package
  let successCount = 0;
  let errorCount = 0;

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
      );
      spinner.succeed(
        chalk.green(`${pkg.packageJson.name} published to workspace`),
      );
      successCount++;
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

/**
 * Read original source code for AI Block Builder (editable in Sandpack).
 * Combines the main component file with type definitions into a single file.
 */
async function readOriginalSourceCode(packagePath: string): Promise<{
  sourceCode: string | undefined;
  sourceCss: string | undefined;
}> {
  const srcDir = path.join(packagePath, "src");

  // Find main component file (not index.tsx, but the actual component)
  const files = fs.readdirSync(srcDir);
  let mainComponentFile: string | undefined;
  let sourceCode: string | undefined;

  // Look for component files (excluding index.tsx and .d.ts files)
  for (const file of files) {
    if (
      (file.endsWith(".tsx") || file.endsWith(".ts")) &&
      !file.startsWith("index") &&
      !file.endsWith(".d.ts")
    ) {
      mainComponentFile = path.join(srcDir, file);
      break;
    }
  }

  // If no main component found, try index.tsx
  if (!mainComponentFile) {
    const indexPath = path.join(srcDir, "index.tsx");
    if (fs.existsSync(indexPath)) {
      mainComponentFile = indexPath;
    }
  }

  if (mainComponentFile && fs.existsSync(mainComponentFile)) {
    // Read the main component
    let content = fs.readFileSync(mainComponentFile, "utf-8");

    // Read block.d.ts if exists and inline the types
    const blockDtsPath = path.join(srcDir, "block.d.ts");
    if (fs.existsSync(blockDtsPath)) {
      const blockDts = fs.readFileSync(blockDtsPath, "utf-8");

      // Extract interface/type definitions from block.d.ts
      const typeMatch = blockDts.match(
        /(?:export\s+)?(?:interface|type)\s+BlockContent[\s\S]*?(?=(?:export\s+)?(?:interface|type)|$)/,
      );

      if (typeMatch) {
        // Remove the import from block.d.ts and add inline type
        content = content.replace(
          /import\s*{\s*BlockContent\s*}\s*from\s*["']\.\/block(?:\.d)?["'];?\n?/,
          "",
        );

        // Add inline interface at the top
        const inlineInterface = `interface BlockContent {
  [key: string]: any;
}\n\n`;

        // Insert after imports
        const lastImportMatch = content.match(
          /^(import[\s\S]*?from\s*['"][^'"]+['"];?\n)/m,
        );
        if (lastImportMatch) {
          const insertPos =
            content.lastIndexOf(lastImportMatch[0]) + lastImportMatch[0].length;
          content =
            content.slice(0, insertPos) +
            "\n" +
            inlineInterface +
            content.slice(insertPos);
        } else {
          content = inlineInterface + content;
        }
      }
    }

    sourceCode = content;
  }

  // Read CSS
  const cssPath = path.join(srcDir, "index.css");
  const sourceCss = fs.existsSync(cssPath)
    ? fs.readFileSync(cssPath, "utf-8")
    : undefined;

  return { sourceCode, sourceCss };
}

// Bundle source code with esbuild (combines all local imports into single file)
// Bundle source code with esbuild (combines all local imports into single file)
// UPDATED: Use CommonJS format to avoid ES module export statements
async function bundleSourceCode(packagePath: string): Promise<string> {
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
  });

  let bundledCode = result.outputFiles[0].text;

  return bundledCode;
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
function convertBlockTypeToSimple(blockType: string): string {
  let simple = blockType;

  // Remove @scope/ prefix
  if (simple.includes("/")) {
    simple = simple.split("/").pop()!;
  }

  // Remove blocks. or templates. prefix
  if (simple.startsWith("blocks.")) {
    simple = simple.substring(7);
  } else if (simple.startsWith("templates.")) {
    simple = simple.substring(10);
  }

  return simple;
}

async function publishToWorkspace(
  pkg: PackageInfo,
  workspaceId: string,
  apiToken: string,
  apiUrl: string,
): Promise<void> {
  const {
    packageJson,
    path: packagePath,
    blockConfig,
    type: packageType,
  } = pkg;

  // Use blockConfig if available, fallback to package.json cmssy
  const metadata = blockConfig || packageJson.cmssy || {};

  // Generate block_type from package name
  // @cmssy/blocks.hero -> hero
  const blockType = packageJson.name
    .replace(/@[^/]+\//, "")
    .replace(/^blocks\./, "")
    .replace(/^templates\./, "");

  // Templates have no source code — skip compilation
  let bundledSourceCode: string | undefined;
  let compiledCss: string | undefined;
  let rawSourceCode: string | undefined;
  let rawSourceCss: string | undefined;
  let dependencies: Record<string, string> = {};

  if (packageType !== "template") {
    // Bundle source code (combines all local imports into single CJS file)
    bundledSourceCode = await bundleSourceCode(packagePath);

    // Compile CSS (with Tailwind if needed)
    compiledCss = await compileCss(packagePath, bundledSourceCode);

    // Read original source code for AI Block Builder editing
    const originalSource = await readOriginalSourceCode(packagePath);
    rawSourceCode = originalSource.sourceCode;
    rawSourceCss = originalSource.sourceCss;

    // Read dependencies from package.json for AI Block Builder
    dependencies = packageJson.dependencies || {};
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
    // AI Block Builder source files (for editable blocks in Sandpack)
    rawSourceCode,
    rawSourceCss,
    dependencies:
      Object.keys(dependencies).length > 0 ? dependencies : undefined,
  };

  // Add layoutPosition if defined (for layout blocks)
  if (blockConfig?.layoutPosition) {
    input.layoutPosition = blockConfig.layoutPosition;
  }

  // Add requires if defined
  if (blockConfig?.requires) {
    input.requires = blockConfig.requires;
  }

  // Check if this is a template with pages.json
  const isTemplate = packageType === "template";
  const pagesJsonPath = path.join(packagePath, "pages.json");
  const hasPagesJson = isTemplate && fs.existsSync(pagesJsonPath);

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
  if (hasPagesJson) {
    // Load pages.json for template
    const pagesData = fs.readJsonSync(pagesJsonPath);

    // Convert pages.json format to mutation input format
    // IMPORTANT: Convert full block names to simple types
    // "@cmssy-marketing/blocks.hero" -> "hero"
    const pages = (pagesData.pages || []).map((page: any) => {
      const result: any = {
        name: page.name,
        slug: page.slug,
        blocks: (page.blocks || []).map((block: any) => ({
          type: convertBlockTypeToSimple(block.type),
          content: block.content || {},
        })),
      };
      // Per-page layout positions (e.g. sidebar_left only on /docs)
      if (page.layoutPositions) {
        result.layoutPositions = Object.entries(page.layoutPositions).map(
          ([position, data]: [string, any]) => ({
            position,
            type: convertBlockTypeToSimple(data.type),
            content: data.content || {},
          }),
        );
      }
      return result;
    });

    // Convert layoutPositions from pages.json
    const layoutPositions = Object.entries(pagesData.layoutPositions || {}).map(
      ([position, data]: [string, any]) => ({
        position,
        type: convertBlockTypeToSimple(data.type),
        content: data.content || {},
      }),
    );

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

    // Remove fields not supported by ImportTemplateInput
    // (these are only for blocks, not templates)
    delete input.packageType;
    delete input.sourceCode;
    delete input.cssCode;
    delete input.rawSourceCode;
    delete input.rawSourceCss;
    delete input.dependencies;

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
    // Standard block import
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

// Helper: Convert config.ts schema to schemaFields array
function convertSchemaToFields(schema: Record<string, any>): any[] {
  const fields: any[] = [];

  Object.entries(schema).forEach(([key, field]: [string, any]) => {
    const baseField: any = {
      key,
      type: field.type,
      label: field.label,
      required: field.required || false,
    };

    // Add defaultValue if present
    if (field.defaultValue !== undefined) {
      baseField.defaultValue = field.defaultValue;
    }

    // Add placeholder if present
    if (field.placeholder) {
      baseField.placeholder = field.placeholder;
    }

    // Add helpText if present
    if (field.helpText) {
      baseField.helperText = field.helpText;
    }

    // Add group if present
    if (field.group) {
      baseField.group = field.group;
    }

    // Add showWhen conditional visibility
    if (field.showWhen) {
      baseField.showWhen = field.showWhen;
    }

    // Add validation rules
    if (field.validation) {
      baseField.validation = field.validation;
    }

    if (field.type === "select" && field.options) {
      baseField.options = field.options;
    }

    if (field.type === "repeater" && field.schema) {
      baseField.minItems = field.minItems;
      baseField.maxItems = field.maxItems;
      // Backend expects itemSchema to be a flat array of field definitions
      baseField.itemSchema = convertSchemaToFields(field.schema);
    }

    fields.push(baseField);
  });

  return fields;
}

// Helper: Extract default content from schema
function extractDefaultContent(schema: Record<string, any>): any {
  const content: any = {};

  Object.entries(schema).forEach(([key, field]: [string, any]) => {
    if (field.defaultValue !== undefined) {
      content[key] = field.defaultValue;
    } else if (field.type === "repeater") {
      content[key] = [];
    }
  });

  return content;
}
