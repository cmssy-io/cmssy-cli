import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileSafe, type WriteResult } from "./files.js";
import { collectFiles } from "./templates.js";

/**
 * Project-config files the cmssy overlay owns on a fresh scaffold but must not
 * clobber in an existing project (the user already configured them).
 */
export const OVERLAY_CONFIG_FILES = new Set([
  "app/layout.tsx",
  "styles/globals.css",
  "next.config.mjs",
  "postcss.config.mjs",
]);

const ROOT_ONLY = new Set([
  ".env.example",
  "next.config.mjs",
  "postcss.config.mjs",
]);

export interface OverlayReport {
  written: string[];
  skipped: string[];
  unchanged: string[];
}

function destFor(rel: string): string {
  return rel === "env.example" ? ".env.example" : rel;
}

export async function applyOverlay(
  targetDir: string,
  mode: "fresh" | "existing",
  srcDir = false,
): Promise<OverlayReport> {
  const report: OverlayReport = { written: [], skipped: [], unchanged: [] };
  const force = mode === "fresh";

  for (const file of collectFiles("init")) {
    const dest = destFor(file.rel);
    const content = readFileSync(file.abs, "utf8");
    const full =
      srcDir && !ROOT_ONLY.has(dest)
        ? join(targetDir, "src", dest)
        : join(targetDir, dest);
    const result: WriteResult = await writeFileSafe(full, content, { force });
    report[result].push(dest);
  }

  return report;
}
