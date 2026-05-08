import chalk from "chalk";
import { spawnSync } from "child_process";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { hasConfig, loadConfig } from "../utils/config.js";
import {
  createClient,
  UPDATE_WORKSPACE_LIBS_MUTATION,
} from "../utils/graphql.js";
import {
  loadLibManifestFromProject,
  RESERVED_PEERS,
  type LibManifest,
} from "../utils/lib-manifest.js";
import {
  resolveWorkspaceId,
  warnIfWorkspaceIdLooksWrong,
} from "../utils/resolve-workspace.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

interface LibInstallOptions {
  workspace?: string | boolean;
  packageManager?: PackageManager;
  skipInstall?: boolean;
  dryRun?: boolean;
}

interface LibSyncOptions {
  workspace?: string | boolean;
  dryRun?: boolean;
}

export async function libInstallCommand(
  packages: string[],
  options: LibInstallOptions,
): Promise<void> {
  console.log(chalk.blue.bold("\n📚 Cmssy - lib install\n"));

  if (!hasConfig()) {
    console.error(chalk.red("✖ Not configured. Run: cmssy link\n"));
    process.exit(1);
  }
  const config = loadConfig();
  if (!config.apiToken) {
    console.error(
      chalk.red("✖ CMSSY_API_TOKEN missing in .env. Run: cmssy link\n"),
    );
    process.exit(1);
  }

  if (packages.length === 0) {
    console.error(
      chalk.red("✖ No packages specified. Example: cmssy lib install lodash"),
    );
    process.exit(1);
  }

  const reserved = packages.filter((p) => RESERVED_PEERS.has(stripVersion(p)));
  if (reserved.length > 0) {
    console.log(
      chalk.yellow(
        `⚠ Skipping reserved peer dep(s) (managed by build worker): ${reserved.join(", ")}`,
      ),
    );
  }
  const filtered = packages.filter((p) => !RESERVED_PEERS.has(stripVersion(p)));
  if (filtered.length === 0 && !options.skipInstall) {
    console.error(
      chalk.red("✖ Nothing to install after filtering reserved peers."),
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const pm = options.packageManager ?? detectPackageManager(cwd);

  if (!options.skipInstall) {
    const args = buildAddArgs(pm, filtered);
    console.log(chalk.gray(`▶ ${pm} ${args.join(" ")}`));
    const result = spawnSync(pm, args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    if (result.error) {
      console.error(
        chalk.red(
          `✖ ${pm} not found on PATH (${result.error.message}). Install it or pass --package-manager.`,
        ),
      );
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(
        chalk.red(
          `✖ ${pm} ${args.join(" ")} exited with code ${result.status}`,
        ),
      );
      process.exit(1);
    }
    console.log(chalk.green(`✔ ${pm} install complete`));
  } else {
    console.log(
      chalk.gray(
        `Skipping local install (--skip-install). Reading manifest from existing package.json.`,
      ),
    );
  }

  const manifest = await loadLibManifestFromProject(cwd);
  await pushManifestToBackend(manifest, options, config);
}

export async function libSyncCommand(options: LibSyncOptions): Promise<void> {
  console.log(chalk.blue.bold("\n📚 Cmssy - lib sync\n"));

  if (!hasConfig()) {
    console.error(chalk.red("✖ Not configured. Run: cmssy link\n"));
    process.exit(1);
  }
  const config = loadConfig();
  if (!config.apiToken) {
    console.error(
      chalk.red("✖ CMSSY_API_TOKEN missing in .env. Run: cmssy link\n"),
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const manifest = await loadLibManifestFromProject(cwd);
  await pushManifestToBackend(manifest, options, config);
}

async function pushManifestToBackend(
  manifest: LibManifest,
  options: { workspace?: string | boolean; dryRun?: boolean },
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const workspaceId = await resolveWorkspaceId(options.workspace, config);
  warnIfWorkspaceIdLooksWrong(workspaceId);

  const depsCount = Object.keys(manifest.dependencies).length;
  console.log(chalk.gray(`\nManifest: ${depsCount} dependency(ies)`));
  for (const [name, spec] of Object.entries(manifest.dependencies)) {
    console.log(`  ${name}@${spec}`);
  }

  if (options.dryRun) {
    console.log(chalk.cyan(`\nDry run - not pushing to ${config.apiUrl}.`));
    return;
  }

  const client = createClient();
  client.setHeader("x-workspace-id", workspaceId);
  const spinner = ora(`Updating workspace lib manifest`).start();
  try {
    await client.request(UPDATE_WORKSPACE_LIBS_MUTATION, {
      input: { dependencies: manifest.dependencies },
    });
    spinner.succeed(`Lib manifest updated for workspace ${workspaceId}`);
  } catch (err) {
    spinner.fail(
      `updateWorkspaceLibs failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

export function detectPackageManager(cwd: string): PackageManager {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(cwd, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

export function buildAddArgs(pm: PackageManager, packages: string[]): string[] {
  const verb = pm === "npm" ? "install" : "add";
  return [verb, ...packages];
}

function stripVersion(spec: string): string {
  if (spec.startsWith("@")) {
    const idx = spec.indexOf("@", 1);
    return idx === -1 ? spec : spec.slice(0, idx);
  }
  const idx = spec.indexOf("@");
  return idx === -1 ? spec : spec.slice(0, idx);
}
