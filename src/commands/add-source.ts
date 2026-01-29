import chalk from "chalk";
import fs from "fs-extra";
import { GraphQLClient } from "graphql-request";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { hasConfig, loadConfig } from "../utils/config.js";
import {
  ADD_BLOCK_SOURCE_CODE_MUTATION,
  GET_WORKSPACE_BLOCKS_QUERY,
} from "../utils/graphql.js";

interface AddSourceOptions {
  workspace?: string;
  all?: boolean;
}

interface WorkspaceBlock {
  id: string;
  blockType: string;
  name: string;
  sourceUrl: string | null;
}

/**
 * Read original source code for AI Block Builder (editable in Sandpack).
 * Combines the main component file with type definitions into a single file.
 */
async function readOriginalSourceCode(packagePath: string): Promise<{
  sourceCode: string | undefined;
  sourceCss: string | undefined;
  dependencies: Record<string, string> | undefined;
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
        /(?:export\s+)?(?:interface|type)\s+BlockContent[\s\S]*?(?=(?:export\s+)?(?:interface|type)|$)/
      );

      if (typeMatch) {
        // Remove the import from block.d.ts and add inline type
        content = content.replace(
          /import\s*{\s*BlockContent\s*}\s*from\s*["']\.\/block(?:\.d)?["'];?\n?/,
          ""
        );

        // Add inline interface at the top
        const inlineInterface = `interface BlockContent {
  [key: string]: any;
}\n\n`;

        // Insert after imports
        const lastImportMatch = content.match(/^(import[\s\S]*?from\s*['"][^'"]+['"];?\n)/m);
        if (lastImportMatch) {
          const insertPos = content.lastIndexOf(lastImportMatch[0]) + lastImportMatch[0].length;
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

  // Read dependencies from package.json
  const pkgPath = path.join(packagePath, "package.json");
  let dependencies: Record<string, string> | undefined;
  if (fs.existsSync(pkgPath)) {
    const pkg = fs.readJsonSync(pkgPath);
    if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
      dependencies = pkg.dependencies;
    }
  }

  return { sourceCode, sourceCss, dependencies };
}

export async function addSourceCommand(
  blockNames: string[] = [],
  options: AddSourceOptions
) {
  console.log(chalk.blue.bold("\n📦 Cmssy - Add Source Code\n"));

  // Check configuration
  if (!hasConfig()) {
    console.error(chalk.red("✖ Not configured. Run: cmssy configure\n"));
    process.exit(1);
  }

  const config = loadConfig();

  // Get workspace ID
  let workspaceId = options.workspace;
  if (!workspaceId) {
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
      chalk.red("✖ Not a cmssy project (missing cmssy.config.js)\n")
    );
    process.exit(1);
  }

  // Create GraphQL client
  const client = new GraphQLClient(config.apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
      "X-Workspace-ID": workspaceId,
    },
  });

  // Fetch workspace blocks
  const spinner = ora("Fetching workspace blocks...").start();

  let workspaceBlocks: WorkspaceBlock[];
  try {
    const result: any = await client.request(GET_WORKSPACE_BLOCKS_QUERY);
    workspaceBlocks = result.workspaceBlocks;
    spinner.succeed(`Found ${workspaceBlocks.length} blocks in workspace`);
  } catch (error: any) {
    spinner.fail("Failed to fetch workspace blocks");
    console.error(chalk.red(error.message));
    process.exit(1);
  }

  // Find blocks directory
  const blocksDir = path.join(process.cwd(), "blocks");
  if (!fs.existsSync(blocksDir)) {
    console.error(chalk.red("✖ No blocks directory found\n"));
    process.exit(1);
  }

  // Get list of local blocks
  const localBlocks = fs
    .readdirSync(blocksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Filter blocks to process
  let blocksToProcess: string[];
  if (options.all) {
    blocksToProcess = localBlocks;
  } else if (blockNames.length > 0) {
    blocksToProcess = blockNames.filter((name) => localBlocks.includes(name));
    const missing = blockNames.filter((name) => !localBlocks.includes(name));
    if (missing.length > 0) {
      console.warn(
        chalk.yellow(`Warning: Blocks not found locally: ${missing.join(", ")}`)
      );
    }
  } else {
    // Interactive selection
    const choices = localBlocks.map((name) => {
      const wsBlock = workspaceBlocks.find((b) => b.blockType === name);
      const hasSource = wsBlock?.sourceUrl ? chalk.green(" (has source)") : chalk.gray(" (no source)");
      return {
        name: `${name}${hasSource}`,
        value: name,
        checked: !wsBlock?.sourceUrl,
      };
    });

    const answer = await inquirer.prompt([
      {
        type: "checkbox",
        name: "blocks",
        message: "Select blocks to add source code:",
        choices,
      },
    ]);

    blocksToProcess = answer.blocks;
  }

  if (blocksToProcess.length === 0) {
    console.log(chalk.yellow("\n⚠ No blocks selected\n"));
    return;
  }

  console.log(chalk.cyan(`\nAdding source to ${blocksToProcess.length} block(s):\n`));

  let successCount = 0;
  let errorCount = 0;

  for (const blockName of blocksToProcess) {
    const blockPath = path.join(blocksDir, blockName);
    const wsBlock = workspaceBlocks.find((b) => b.blockType === blockName);

    if (!wsBlock) {
      console.log(
        chalk.yellow(`  ⚠ ${blockName}: Not found in workspace (publish it first)`)
      );
      continue;
    }

    const blockSpinner = ora(`Adding source to ${blockName}...`).start();

    try {
      // Read source code
      const { sourceCode, sourceCss, dependencies } =
        await readOriginalSourceCode(blockPath);

      if (!sourceCode) {
        blockSpinner.warn(`${blockName}: No source code found`);
        continue;
      }

      // Upload via mutation
      const input: Record<string, any> = {
        blockId: wsBlock.id,
        sourceCode,
      };

      if (sourceCss) {
        input.sourceCss = sourceCss;
      }

      if (dependencies) {
        input.dependencies = dependencies;
      }

      await client.request(ADD_BLOCK_SOURCE_CODE_MUTATION, { input });

      blockSpinner.succeed(chalk.green(`${blockName}: Source added`));
      successCount++;
    } catch (error: any) {
      blockSpinner.fail(chalk.red(`${blockName}: Failed`));
      console.error(chalk.red(`  Error: ${error.message}`));
      errorCount++;
    }
  }

  console.log("");
  if (errorCount === 0) {
    console.log(
      chalk.green.bold(`✓ ${successCount} block(s) updated successfully\n`)
    );
  } else {
    console.log(
      chalk.yellow(`⚠ ${successCount} succeeded, ${errorCount} failed\n`)
    );
  }
}
