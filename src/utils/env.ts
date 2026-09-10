import { readFile, writeFile } from "node:fs/promises";
import { pathExists } from "./files.js";

const KEY_LINE = /^([A-Z0-9_]+)=(.*)$/;

/**
 * Set env vars in a dotenv file, preserving all other lines and comments.
 * Existing managed keys are overwritten only when `overwrite` is true;
 * unmanaged keys are never touched.
 */
export async function setEnvVars(
  filePath: string,
  vars: Record<string, string>,
  opts: { overwrite?: boolean } = {},
): Promise<void> {
  const existing = pathExists(filePath) ? await readFile(filePath, "utf8") : "";
  const lines = existing.length ? existing.replace(/\n$/, "").split("\n") : [];
  const remaining = new Set(Object.keys(vars));

  const next = lines.map((line) => {
    const m = KEY_LINE.exec(line);
    if (!m) return line;
    const key = m[1]!;
    if (!(key in vars)) return line;
    remaining.delete(key);
    const raw = m[2]!;
    const comment = /\s+#.*$/.exec(raw);
    const value = comment ? raw.slice(0, comment.index) : raw;
    if (value.trim().length > 0 && !opts.overwrite) return line;
    return `${key}=${vars[key]}${comment ? comment[0] : ""}`;
  });

  for (const key of remaining) {
    next.push(`${key}=${vars[key]}`);
  }

  await writeFile(filePath, next.join("\n") + "\n", "utf8");
}
