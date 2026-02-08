import chalk from "chalk";
import { spawn } from "child_process";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { generateDevApp, regeneratePreviewPages } from "../utils/dev-generator.js";
import { loadMetaCache } from "../utils/blocks-meta-cache.js";
import { scanResources } from "../utils/scanner.js";

interface DevOptions {
  port: string;
}

export async function devCommand(options: DevOptions) {
  const spinner = ora("Starting Next.js dev server...").start();

  try {
    const projectRoot = process.cwd();
    const port = parseInt(options.port, 10);

    // Ensure next.config exists
    const hasNextConfig = fs.existsSync(path.join(projectRoot, "next.config.mjs")) ||
                          fs.existsSync(path.join(projectRoot, "next.config.js")) ||
                          fs.existsSync(path.join(projectRoot, "next.config.ts"));

    if (!hasNextConfig) {
      spinner.fail("No next.config found. Run 'cmssy init' to create a new project.");
      process.exit(1);
    }

    // Scan blocks
    spinner.text = "Scanning blocks...";
    const resources = await scanResources({
      strict: false,
      loadConfig: false,
      validateSchema: false,
      loadPreview: false,
      requirePackageJson: false,
    });

    if (resources.length === 0) {
      spinner.warn("No blocks or templates found");
      console.log(chalk.yellow("\nCreate your first block:\n"));
      console.log(chalk.white("  npx cmssy create block my-block\n"));
      process.exit(0);
    }

    // Load metadata cache
    const metaCache = loadMetaCache(projectRoot);
    resources.forEach((r) => {
      const cached = metaCache.blocks[r.name];
      if (cached) {
        r.category = cached.category;
        r.displayName = cached.displayName || r.name;
        r.description = cached.description;
      }
    });

    // Generate the .cmssy/dev/ Next.js app
    spinner.text = "Generating Next.js dev app...";
    const devRoot = generateDevApp(projectRoot, resources);

    // Symlink node_modules from project root into dev app
    // so Next.js can resolve react, react-dom, next, etc.
    const devNodeModules = path.join(devRoot, "node_modules");
    const projectNodeModules = path.join(projectRoot, "node_modules");
    if (!fs.existsSync(devNodeModules) && fs.existsSync(projectNodeModules)) {
      fs.symlinkSync(projectNodeModules, devNodeModules, "junction");
    }

    // Find next binary from project's node_modules
    const nextBin = path.join(projectRoot, "node_modules/.bin/next");
    if (!fs.existsSync(nextBin)) {
      spinner.fail("'next' not found in node_modules. Run: npm install next");
      process.exit(1);
    }

    spinner.succeed("Next.js dev app generated");

    console.log(chalk.green.bold("\n─────────────────────────────────────────"));
    console.log(chalk.green.bold("   Cmssy Dev Server (Next.js)"));
    console.log(chalk.green.bold("─────────────────────────────────────────\n"));

    const blocks = resources.filter((r) => r.type === "block");
    const templates = resources.filter((r) => r.type === "template");
    console.log(chalk.cyan(`   ${blocks.length} blocks, ${templates.length} templates`));
    console.log(chalk.green(`\n   Local:   ${chalk.cyan(`http://localhost:${port}`)}`));
    console.log(chalk.green("   Next.js Fast Refresh enabled"));
    console.log(chalk.green("   Press Ctrl+C to stop"));
    console.log(chalk.green.bold("\n─────────────────────────────────────────\n"));

    // Spawn next dev from project root so the project's own PostCSS config,
    // Tailwind setup, and node_modules resolution all work naturally.
    // The dev app directory is passed as argument to next dev.
    const nextProcess = spawn(nextBin, ["dev", devRoot, "--port", String(port)], {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CMSSY_PROJECT_ROOT: projectRoot,
      },
    });

    nextProcess.on("error", (err) => {
      console.error(chalk.red("Failed to start Next.js:"), err.message);
      process.exit(1);
    });

    nextProcess.on("exit", (code) => {
      process.exit(code || 0);
    });

    // Watch for new blocks
    const chokidar = await import("chokidar");
    const watcher = chokidar.watch(
      [path.join(projectRoot, "blocks/*/package.json"), path.join(projectRoot, "templates/*/package.json")],
      { ignoreInitial: true },
    );

    watcher.on("add", async () => {
      console.log(chalk.green("\n  New block detected, regenerating preview pages..."));
      const newResources = await scanResources({
        strict: false,
        loadConfig: false,
        validateSchema: false,
        loadPreview: false,
        requirePackageJson: false,
      });
      regeneratePreviewPages(projectRoot, newResources);
      console.log(chalk.green("  Preview pages regenerated. Refresh browser.\n"));
    });

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      nextProcess.kill("SIGINT");
      watcher.close();
      process.exit(0);
    });

  } catch (error) {
    spinner.fail("Failed to start Next.js dev server");
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}
