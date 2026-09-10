import { join, resolve } from "node:path";
import { intro, log, note, outro } from "@clack/prompts";
import type { ParsedArgs } from "../utils/args.js";
import { CMSSY_DEPS, DOCS_URL } from "../utils/constants.js";
import { applyOverlay } from "../utils/overlay.js";
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

export async function initCommand(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const dirArg = args.positionals[0];
  const targetDir = dirArg ? resolve(cwd, dirArg) : cwd;
  const { flags } = args;

  intro(pc.bold("cmssy init"));

  const info = detectProject(targetDir);
  if (!info.isNextAppRouter) {
    log.error("No Next.js App Router project found here.");
    ui.dim(
      "cmssy init wires an existing Next.js App Router app. Create one first:",
    );
    ui.dim("  npx create-next-app@latest");
    ui.dim("then run cmssy init inside it.");
    process.exitCode = 1;
    return;
  }

  log.info("Adding cmssy wiring to your Next.js app.");
  const pm = choosePm(flags, targetDir);
  const srcDir = info.appDir === join(targetDir, "src", "app");

  const report = await applyOverlay(targetDir, srcDir);
  if (report.written.length) {
    log.success(`Added ${report.written.length} file(s)`);
  }
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
    ...(dirArg ? [`cd ${dirArg}`] : []),
    ...(skipInstall ? [`${pm} install`] : []),
    `${pm === "npm" ? "npm run" : pm} dev`,
    "Open the site in the cmssy editor to edit visually.",
  ];
  if (report.skipped.includes("next.config.mjs")) {
    steps.push(
      pc.yellow(
        "Add images.remotePatterns for assets.cmssy.io to your next.config so cmssy media renders.",
      ),
    );
  }
  note(steps.join("\n"), "Next steps");
  outro(`Done. Docs: ${DOCS_URL}`);
}
