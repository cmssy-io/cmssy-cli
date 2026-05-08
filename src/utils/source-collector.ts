import fs from "fs-extra";
import path from "path";

export interface CollectedFile {
  relPath: string;
  contentBase64: string;
}

export interface CollectResult {
  files: CollectedFile[];
  entryPath: string;
}

const SEGMENT_REGEX = /^[a-zA-Z0-9_.-][a-zA-Z0-9._-]*$/;

const DEFAULT_INCLUDE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".md",
  ".svg",
]);

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".git",
  ".cache",
  ".vercel",
  "__snapshots__",
  "__tests__",
]);

const DEFAULT_IGNORE_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  "tsconfig.tsbuildinfo",
]);

const TEST_FILE_REGEX =
  /\.(test|spec|stories|story)\.(ts|tsx|js|jsx|mjs|cjs)$/i;

export const MAX_FILES = 200;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface CollectOptions {
  blockDir: string;
  entryRel?: string;
  includeExt?: Set<string>;
  ignoreDirs?: Set<string>;
}

export async function collectBlockSources(
  options: CollectOptions,
): Promise<CollectResult> {
  const { blockDir } = options;
  const includeExt = options.includeExt ?? DEFAULT_INCLUDE_EXT;
  const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const entryRel = options.entryRel ?? "src/index.tsx";

  if (!(await fs.pathExists(blockDir))) {
    throw new Error(`block directory not found: ${blockDir}`);
  }
  const stat = await fs.stat(blockDir);
  if (!stat.isDirectory()) {
    throw new Error(`block path is not a directory: ${blockDir}`);
  }

  const files: CollectedFile[] = [];
  const seenLowercased = new Set<string>();
  let totalBytes = 0;

  async function walk(dir: string, relParent: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (ignoreDirs.has(name)) continue;
        if (name.startsWith(".")) continue;
        if (!SEGMENT_REGEX.test(name)) continue;
        const nextRel = relParent ? `${relParent}/${name}` : name;
        await walk(path.join(dir, name), nextRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (DEFAULT_IGNORE_FILES.has(name)) continue;
      if (name.startsWith(".")) continue;
      if (TEST_FILE_REGEX.test(name)) continue;
      if (!SEGMENT_REGEX.test(name)) continue;
      const ext = path.extname(name).toLowerCase();
      const baseName = path.basename(name);
      const isPkg = baseName === "package.json";
      const isCfg = baseName === "config.ts" || baseName === "config.js";
      const isPreview = baseName === "preview.json";
      if (!isPkg && !isCfg && !isPreview && !includeExt.has(ext)) {
        continue;
      }
      const absPath = path.join(dir, name);
      const buf = await fs.readFile(absPath);
      totalBytes += buf.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(
          `block sources exceed ${MAX_TOTAL_BYTES} bytes - prune large assets or split the block`,
        );
      }
      const relPath = relParent ? `${relParent}/${name}` : name;
      const lower = relPath.toLowerCase();
      if (seenLowercased.has(lower)) {
        throw new Error(
          `duplicate path "${relPath}" (paths must be unique case-insensitively)`,
        );
      }
      seenLowercased.add(lower);
      files.push({ relPath, contentBase64: buf.toString("base64") });
      if (files.length > MAX_FILES) {
        throw new Error(
          `block has more than ${MAX_FILES} source files - prune the tree before publishing`,
        );
      }
    }
  }

  await walk(blockDir, "");

  if (files.length === 0) {
    throw new Error(`block at ${blockDir} contains no recognized source files`);
  }

  const hasEntry = files.some((f) => f.relPath === entryRel);
  if (!hasEntry) {
    throw new Error(
      `entry path "${entryRel}" not found in block source tree (${blockDir})`,
    );
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { files, entryPath: entryRel };
}
