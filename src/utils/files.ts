import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function pathExists(p: string): boolean {
  return existsSync(p);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export type WriteResult = "written" | "skipped" | "unchanged";

/**
 * Write a file without clobbering an existing one. If the target exists with
 * identical content it reports "unchanged"; if it differs it reports "skipped"
 * (left untouched) unless `force` is set.
 */
export async function writeFileSafe(
  dest: string,
  content: string,
  opts: { force?: boolean } = {},
): Promise<WriteResult> {
  if (pathExists(dest)) {
    const current = await readFile(dest, "utf8");
    if (current === content) return "unchanged";
    if (!opts.force) return "skipped";
  }
  await ensureDir(dirname(dest));
  await writeFile(dest, content, "utf8");
  return "written";
}
