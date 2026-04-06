import chalk from "chalk";
import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";

interface TestOptions {
  block?: string[];
  watch?: boolean;
  coverage?: boolean;
}

export async function testCommand(options: TestOptions) {
  const projectRoot = process.cwd();

  // Find vitest binary
  const vitestPaths = [
    path.join(projectRoot, "node_modules", ".bin", "vitest"),
    path.join(
      projectRoot,
      "node_modules",
      "cmssy-cli",
      "node_modules",
      ".bin",
      "vitest",
    ),
  ];
  const vitestBin = vitestPaths.find((p) => fs.existsSync(p));

  if (!vitestBin) {
    console.error(
      chalk.red("✖ vitest not found. Install it:") +
        chalk.white("\n  npm install -D vitest @testing-library/react\n"),
    );
    process.exit(1);
  }

  // Build include patterns
  let include: string[];
  if (options.block && options.block.length > 0) {
    include = options.block.map(
      (b) => `blocks/${b}/src/**/*.{test,spec}.{ts,tsx}`,
    );
  } else {
    include = [
      "blocks/*/src/**/*.{test,spec}.{ts,tsx}",
      "templates/*/src/**/*.{test,spec}.{ts,tsx}",
    ];
  }

  // Build vitest args
  const args: string[] = ["run"];

  if (options.watch) {
    args[0] = "watch";
  }

  if (options.coverage) {
    args.push("--coverage");
  }

  // Pass include patterns
  for (const pattern of include) {
    args.push("--include", pattern);
  }

  console.log(chalk.blue.bold("\n🧪 Cmssy Test\n"));

  if (options.block) {
    console.log(chalk.gray(`  Blocks: ${options.block.join(", ")}`));
  } else {
    console.log(chalk.gray("  Running all block tests"));
  }
  console.log("");

  // Run vitest
  const result = spawnSync(vitestBin, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      CMSSY_PROJECT_ROOT: projectRoot,
    },
  });

  process.exit(result.status ?? 1);
}
