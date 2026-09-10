import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileSafe } from "./files.js";
import { collectFiles } from "./templates.js";

const ROOT_ONLY = new Set([".env.example", "next.config.mjs"]);
const OTHER_NEXT_CONFIGS = [
  "next.config.js",
  "next.config.ts",
  "next.config.cjs",
];

export interface OverlayReport {
  written: string[];
  skipped: string[];
  unchanged: string[];
}

function destFor(rel: string): string {
  return rel === "env.example" ? ".env.example" : rel;
}

/** Add the cmssy wiring + example block to an existing project, never clobbering. */
export async function applyOverlay(
  targetDir: string,
  srcDir = false,
): Promise<OverlayReport> {
  const report: OverlayReport = { written: [], skipped: [], unchanged: [] };

  for (const file of collectFiles("init")) {
    const dest = destFor(file.rel);
    if (
      dest === "next.config.mjs" &&
      OTHER_NEXT_CONFIGS.some((f) => existsSync(join(targetDir, f)))
    ) {
      report.skipped.push(dest);
      continue;
    }
    const content = readFileSync(file.abs, "utf8");
    const full =
      srcDir && !ROOT_ONLY.has(dest)
        ? join(targetDir, "src", dest)
        : join(targetDir, dest);
    const result = await writeFileSafe(full, content);
    report[result].push(dest);
  }

  return report;
}
