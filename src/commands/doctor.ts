import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs-extra";
import { GraphQLClient } from "graphql-request";
import path from "path";
import { loadConfig } from "../utils/config.js";
import { CLI_VERSION, clientHeaders } from "../utils/version.js";
import { friendlyApiError } from "../utils/api-error.js";

function getVersion(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

function getPackageVersion(name: string): string | null {
  const pkgPath = path.join(
    process.cwd(),
    "node_modules",
    name,
    "package.json",
  );
  if (fs.existsSync(pkgPath)) {
    return fs.readJsonSync(pkgPath).version;
  }
  return null;
}

export async function doctorCommand() {
  let errors = 0;
  let warnings = 0;
  let passed = 0;

  function pass(msg: string) {
    console.log(chalk.green(`  ✓ ${msg}`));
    passed++;
  }
  function fail(msg: string) {
    console.log(chalk.red(`  ✗ ${msg}`));
    errors++;
  }
  function warn(msg: string) {
    console.log(chalk.yellow(`  ⚠ ${msg}`));
    warnings++;
  }
  function skip(msg: string) {
    console.log(chalk.gray(`  - ${msg} (skipped)`));
  }

  console.log(chalk.blue.bold("\n🩺 Cmssy Doctor\n"));

  // --- Environment ---
  console.log(chalk.bold("  Environment"));

  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1));
  if (nodeMajor >= 18) {
    pass(`Node.js ${nodeVersion} (requires >=18)`);
  } else {
    fail(`Node.js ${nodeVersion} (requires >=18)`);
  }

  const npmVersion = getVersion("npm --version");
  if (npmVersion) {
    pass(`npm v${npmVersion}`);
  } else {
    warn("npm not found");
  }

  const nextVersion = getPackageVersion("next");
  if (nextVersion) {
    pass(`next v${nextVersion}`);
  } else {
    warn("next not installed (peer dependency)");
  }

  const reactVersion = getPackageVersion("react");
  if (reactVersion) {
    pass(`react v${reactVersion}`);
  } else {
    warn("react not installed (peer dependency)");
  }

  console.log();

  // --- Configuration ---
  console.log(chalk.bold("  Configuration"));

  const cwd = process.cwd();
  const configPath = path.join(cwd, "cmssy.config.js");
  if (fs.existsSync(configPath)) {
    pass("cmssy.config.js found");
  } else {
    fail("cmssy.config.js not found");
  }

  const envPath = path.join(cwd, ".env");
  if (fs.existsSync(envPath)) {
    pass(".env file exists");
  } else {
    warn(".env file not found (run: cmssy link)");
  }

  const config = loadConfig();

  if (process.env.CMSSY_API_URL) {
    pass(`CMSSY_API_URL set (${config.apiUrl})`);
  } else {
    warn(`CMSSY_API_URL not set, using default (${config.apiUrl})`);
  }

  if (config.apiToken) {
    const masked =
      config.apiToken.slice(0, 4) + "..." + config.apiToken.slice(-4);
    pass(`CMSSY_API_TOKEN set (${masked})`);
  } else {
    fail("CMSSY_API_TOKEN not set (run: cmssy link)");
  }

  if (config.workspaceId) {
    pass(`CMSSY_WORKSPACE_ID set`);
  } else {
    warn("CMSSY_WORKSPACE_ID not set (run: cmssy link)");
  }

  console.log();

  // --- API Connection ---
  console.log(chalk.bold("  API Connection"));

  if (config.apiToken) {
    try {
      const client = new GraphQLClient(config.apiUrl, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiToken}`,
          ...clientHeaders(),
        },
      });

      const data: any = await client.request(`
        query { version myWorkspaces { id name } }
      `);

      pass("API reachable");
      pass("Token valid");

      const apiVersion = data.version ?? "unknown";
      pass(`Compatibility (CLI v${CLI_VERSION} ↔ API v${apiVersion})`);

      const workspaces = data.myWorkspaces || [];
      if (config.workspaceId) {
        const ws = workspaces.find((w: any) => w.id === config.workspaceId);
        if (ws) {
          pass(`Workspace accessible (${ws.name})`);
        } else {
          fail(`Workspace ${config.workspaceId} not accessible`);
        }
      } else {
        skip("Workspace check (no CMSSY_WORKSPACE_ID)");
      }
    } catch (error: any) {
      const friendly = friendlyApiError(error);
      if (friendly !== error && friendly.message !== error.message) {
        // Version drift between this CLI and the API.
        fail("CLI/API version mismatch");
        console.log(chalk.yellow(`    ${friendly.message.split("\n").join("\n    ")}`));
      } else if (error.response?.errors) {
        fail("API reachable but token invalid");
      } else {
        fail(`API unreachable: ${error.message}`);
      }
    }
  } else {
    skip("API connection (no token configured)");
  }

  console.log();

  // --- Project ---
  console.log(chalk.bold("  Project"));

  const blocksDir = path.join(cwd, "blocks");
  const templatesDir = path.join(cwd, "templates");

  if (fs.existsSync(blocksDir)) {
    const blockDirs = fs
      .readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    pass(`${blockDirs.length} block(s) found in blocks/`);

    for (const dir of blockDirs) {
      const blockPath = path.join(blocksDir, dir.name);
      const hasIndex =
        fs.existsSync(path.join(blockPath, "src", "index.tsx")) ||
        fs.existsSync(path.join(blockPath, "src", "index.ts"));
      const hasConfig =
        fs.existsSync(path.join(blockPath, "config.ts")) ||
        fs.existsSync(path.join(blockPath, "config.js"));
      const hasPkg = fs.existsSync(path.join(blockPath, "package.json"));
      const hasPreview = fs.existsSync(path.join(blockPath, "preview.json"));

      if (!hasIndex) fail(`Block "${dir.name}" missing src/index.ts(x)`);
      if (!hasConfig) fail(`Block "${dir.name}" missing config.ts/js`);
      if (!hasPkg) fail(`Block "${dir.name}" missing package.json`);
      if (!hasPreview) warn(`Block "${dir.name}" has no preview.json`);
    }
  } else {
    warn("No blocks/ directory found");
  }

  if (fs.existsSync(templatesDir)) {
    const templateDirs = fs
      .readdirSync(templatesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    if (templateDirs.length > 0) {
      pass(`${templateDirs.length} template(s) found in templates/`);
    }
  }

  console.log();

  // --- Dependencies ---
  console.log(chalk.bold("  Dependencies"));

  const cliVersion = getPackageVersion("@cmssy/cli");
  if (cliVersion) {
    pass(`@cmssy/cli v${cliVersion}`);
  } else {
    warn("@cmssy/cli not in node_modules");
  }

  const typesVersion = getPackageVersion("@cmssy/types");
  if (typesVersion) {
    pass(`@cmssy/types v${typesVersion}`);
  } else {
    warn("@cmssy/types not in node_modules");
  }

  // --- Summary ---
  console.log();
  const parts = [];
  if (passed > 0) parts.push(chalk.green(`${passed} passed`));
  if (warnings > 0) parts.push(chalk.yellow(`${warnings} warning(s)`));
  if (errors > 0) parts.push(chalk.red(`${errors} error(s)`));
  console.log(`  ${parts.join(", ")}\n`);

  if (errors > 0) {
    process.exit(1);
  }
}
