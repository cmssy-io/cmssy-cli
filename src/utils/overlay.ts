import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileSafe, type WriteResult } from "./files.js";
import { collectFiles } from "./templates.js";

export const FRESH_ONLY_FILES = new Set([
  "app/layout.tsx",
  "styles/globals.css",
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
  omitted: string[];
}

function destFor(rel: string): string {
  return rel === "env.example" ? ".env.example" : rel;
}

export async function applyOverlay(
  targetDir: string,
  mode: "fresh" | "existing",
  srcDir = false,
): Promise<OverlayReport> {
  const report: OverlayReport = {
    written: [],
    skipped: [],
    unchanged: [],
    omitted: [],
  };
  const force = mode === "fresh";

  for (const file of collectFiles("init")) {
    const dest = destFor(file.rel);
    if (mode === "existing" && FRESH_ONLY_FILES.has(dest)) {
      report.omitted.push(dest);
      continue;
    }
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
