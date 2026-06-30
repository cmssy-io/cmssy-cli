import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { intro, log, note, outro } from "@clack/prompts";
import type { ParsedArgs } from "../utils/args.js";
import { CMSSY_DEPS, DOCS_URL } from "../utils/constants.js";
import { applyOverlay, OVERLAY_CONFIG_FILES } from "../utils/overlay.js";
import { detectProject } from "../utils/project.js";
import {
  detectPackageManager,
  ensureDependencies,
  installArgs,
  run,
  type PackageManager,
} from "../utils/pkg.js";
import { pc, ui } from "../utils/ui.js";
import { runLink } from "./link.js";

const PMS = new Set<PackageManager>(["npm", "pnpm", "yarn", "bun"]);

function choosePm(
  flags: ParsedArgs["flags"],
  targetDir: string,
): PackageManager {
  const flag = typeof flags.pm === "string" ? flags.pm : undefined;
  if (flag && PMS.has(flag as PackageManager)) return flag as PackageManager;
  return detectPackageManager(targetDir);
}

async function removeIfExists(...paths: string[]): Promise<void> {
  for (const p of paths) {
    if (existsSync(p)) await rm(p, { recursive: true, force: true });
  }
}

async function scaffoldFresh(
  targetDir: string,
  cwd: string,
  dirArg: string | undefined,
  pm: PackageManager,
): Promise<void> {
  log.step("Creating a fresh Next.js App Router app");
  await run(
    "npx",
    [
      "--yes",
      "create-next-app@latest",
      dirArg ?? ".",
      "--yes",
      "--ts",
      "--tailwind",
      "--eslint",
      "--app",
      "--no-src-dir",
      "--import-alias",
      "@/*",
      "--skip-install",
      `--use-${pm}`,
    ],
    cwd,
  );

  // The default index page collides with our optional-catch-all route, and a
  // create-next-app next.config.ts would duplicate our .mjs - drop both.
  await removeIfExists(
    join(targetDir, "app", "page.tsx"),
    join(targetDir, "next.config.ts"),
    join(targetDir, "next.config.js"),
  );
}

export async function initCommand(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const dirArg = args.positionals[0];
  const targetDir = dirArg ? resolve(cwd, dirArg) : cwd;
  const { flags } = args;

  intro(pc.bold("cmssy init"));

  const info = detectProject(targetDir);
  const pm = choosePm(flags, targetDir);

  let mode: "fresh" | "existing";
  if (info.isNextAppRouter) {
    mode = "existing";
    log.info("Detected a Next.js App Router project - adding cmssy wiring.");
  } else if (!info.hasPackageJson) {
    mode = "fresh";
  } else {
    log.error(
      "This directory has a package.json but isn't a Next.js App Router project.",
    );
    ui.dim(
      "cmssy init v1 supports the Next.js App Router. Start from an empty directory or an App Router app.",
    );
    process.exitCode = 1;
    return;
  }

  if (mode === "fresh") {
    await scaffoldFresh(targetDir, cwd, dirArg, pm);
  }

  const srcDir =
    mode === "existing" && info.appDir === join(targetDir, "src", "app");
  const report = await applyOverlay(targetDir, mode, srcDir);
  if (report.written.length) {
    log.success(`Added ${report.written.length} file(s)`);
  }
  const skippedConfig = report.skipped.filter((f) =>
    OVERLAY_CONFIG_FILES.has(f),
  );
  if (report.skipped.length) {
    log.warn(`Skipped existing: ${report.skipped.join(", ")}`);
  }

  const added = await ensureDependencies(targetDir, CMSSY_DEPS);
  if (added.length) log.success(`Added deps: ${added.join(", ")}`);

  if (!flags["no-link"]) {
    await runLink(targetDir, flags);
  }

  const skipInstall = Boolean(flags["skip-install"]);
  if (!skipInstall) {
    log.step(`Installing dependencies (${pm})`);
    await run(pm, installArgs(pm), targetDir);
  }

  const steps = [
    `cd ${dirArg ?? "."}`,
    ...(skipInstall ? [`${pm} install`] : []),
    `${pm === "npm" ? "npm run" : pm} dev`,
    "Open the site in the cmssy editor to edit visually.",
  ];
  if (skippedConfig.length) {
    steps.push(
      pc.yellow(
        `Review skipped config (${skippedConfig.join(", ")}): ensure images.remotePatterns and that your layout imports the cmssy globals.`,
      ),
    );
  }
  note(steps.join("\n"), "Next steps");
  outro(`Done. Docs: ${DOCS_URL}`);
}
