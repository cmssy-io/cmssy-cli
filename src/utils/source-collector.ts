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

const RESOLVE_EXTS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
];

const SCANNABLE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
]);

export const MAX_FILES = 200;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface CollectOptions {
  blockDir: string;
  entryRel?: string;
  includeExt?: Set<string>;
  ignoreDirs?: Set<string>;
}

interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

export async function collectBlockSources(
  options: CollectOptions,
): Promise<CollectResult> {
  const { blockDir } = options;
  const includeExt = options.includeExt ?? DEFAULT_INCLUDE_EXT;
  const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const entryRel = normalizeEntryPath(options.entryRel ?? "src/index.tsx");

  if (!(await fs.pathExists(blockDir))) {
    throw new Error(`block directory not found: ${blockDir}`);
  }
  const stat = await fs.stat(blockDir);
  if (!stat.isDirectory()) {
    throw new Error(`block path is not a directory: ${blockDir}`);
  }

  const projectRoot = await findProjectRoot(blockDir);
  const relFromRoot = toForwardSlash(path.relative(projectRoot, blockDir));
  // Empty `relFromRoot` is legal: it means blockDir IS the project
  // root (`findProjectRoot` fell back to blockDir's own package.json).
  // In that layout block files live at their natural relative paths
  // (no `blocks/<name>/` prefix). `..` segments still indicate the
  // block sits outside the resolved root.
  if (relFromRoot.startsWith("..")) {
    throw new Error(
      `block directory ${blockDir} is not inside project root ${projectRoot}`,
    );
  }
  const blockProjectRel = relFromRoot;

  const tsconfig = await loadTsConfigPaths(projectRoot);

  const collected = new Map<string, CollectedFile>();
  const collectedAbs = new Set<string>();
  let totalBytes = 0;

  function addFile(absPath: string, relPath: string, buf: Buffer): void {
    let content = buf;
    if (relPath.toLowerCase().endsWith(".css")) {
      // Strip bare-specifier `@import "tailwindcss"` / `@import "x/y"`
      // - they target postcss/Tailwind processing, esbuild cannot
      // resolve them, and the consumer site re-processes utility
      // classes via its own Tailwind pipeline at render time.
      // Preserve relative imports (`./`, `../`) AND absolute URLs
      // (`http(s)://`, protocol-relative `//`) - web fonts and CDN
      // stylesheets are valid runtime references.
      const text = buf.toString("utf8");
      const stripped = text.replace(
        /@import\s+(?:url\(\s*)?["']([^"']+)["'](?:\s*\))?\s*;?\s*\n?/g,
        (match, spec: string) => {
          if (/^(?:\.\.?\/|https?:\/\/|\/\/)/.test(spec)) return match;
          return "";
        },
      );
      if (stripped !== text) {
        content = Buffer.from(stripped);
      }
    }
    if (totalBytes + content.byteLength > MAX_TOTAL_BYTES) {
      throw new Error(
        `block sources exceed ${MAX_TOTAL_BYTES} bytes (would-be ${totalBytes + content.byteLength} after "${relPath}") - prune large assets or split the block`,
      );
    }
    const lower = relPath.toLowerCase();
    const existing = collected.get(lower);
    if (existing) {
      // Same case-folded path already collected. Tolerate the exact
      // same path (e.g. an import resolver landing on a file already
      // walked from blockDir); refuse a case-only collision so we
      // don't silently drop a file on case-sensitive filesystems.
      if (existing.relPath !== relPath) {
        throw new Error(
          `duplicate path "${relPath}" collides case-insensitively with "${existing.relPath}" - paths must be unique`,
        );
      }
      return;
    }
    collected.set(lower, {
      relPath,
      contentBase64: content.toString("base64"),
    });
    collectedAbs.add(absPath);
    totalBytes += content.byteLength;
    if (collected.size > MAX_FILES) {
      throw new Error(
        `block has more than ${MAX_FILES} source files - prune the tree before publishing`,
      );
    }
  }

  async function walkBlockDir(dir: string, relParent: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (ignoreDirs.has(name)) continue;
        if (name.startsWith(".")) continue;
        if (!SEGMENT_REGEX.test(name)) continue;
        const nextRel = relParent ? `${relParent}/${name}` : name;
        await walkBlockDir(path.join(dir, name), nextRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (DEFAULT_IGNORE_FILES.has(name)) continue;
      if (name.startsWith(".")) continue;
      if (TEST_FILE_REGEX.test(name)) continue;
      if (!SEGMENT_REGEX.test(name)) continue;
      const ext = path.extname(name).toLowerCase();
      const isPkg = name === "package.json";
      const isCfg = name === "config.ts" || name === "config.js";
      const isPreview = name === "preview.json";
      if (!isPkg && !isCfg && !isPreview && !includeExt.has(ext)) {
        continue;
      }
      const absPath = path.join(dir, name);
      // Stat-then-read so a single malicious or accidentally-huge
      // file (e.g. a stray screenshot in src/) can't blow past the
      // archive budget before we fail the publish. addFile applies
      // the cumulative cap; this catches per-file outliers up front
      // without ever allocating their content into memory.
      const fileStat = await fs.stat(absPath);
      const relForError = relParent ? `${relParent}/${name}` : name;
      if (totalBytes + fileStat.size > MAX_TOTAL_BYTES) {
        throw new Error(
          `block sources exceed ${MAX_TOTAL_BYTES} bytes (would-be ${totalBytes + fileStat.size} after "${relForError}") - prune large assets or split the block`,
        );
      }
      const buf = await fs.readFile(absPath);
      const relInBlock = relParent ? `${relParent}/${name}` : name;
      const projectRel = blockProjectRel
        ? `${blockProjectRel}/${relInBlock}`
        : relInBlock;
      addFile(absPath, projectRel, buf);
    }
  }

  await walkBlockDir(blockDir, "");

  const entryLookup = blockProjectRel
    ? `${blockProjectRel}/${entryRel}`
    : entryRel;
  const entryHit = collected.get(entryLookup.toLowerCase());
  if (!entryHit) {
    throw new Error(
      `entry path "${entryRel}" not found in block source tree (${blockDir})`,
    );
  }
  // Use the on-disk casing rather than the caller-supplied entryRel
  // so the backend's `entryPath` check matches what's in `files[]`.
  const entryProjectRel = entryHit.relPath;

  const queue: string[] = [];
  for (const absPath of collectedAbs) {
    const ext = path.extname(absPath).toLowerCase();
    if (SCANNABLE_EXTS.has(ext)) queue.push(absPath);
  }
  const scanned = new Set<string>();

  while (queue.length > 0) {
    const importerAbs = queue.shift()!;
    if (scanned.has(importerAbs)) continue;
    scanned.add(importerAbs);

    let source: string;
    try {
      source = await fs.readFile(importerAbs, "utf8");
    } catch {
      continue;
    }
    const importerExt = path.extname(importerAbs).toLowerCase();
    const specs = extractImportSpecifiers(source, importerExt);
    for (const spec of specs) {
      const resolved = await resolveImportSpecifier(
        spec,
        importerAbs,
        projectRoot,
        tsconfig,
      );
      if (!resolved) continue;
      if (collectedAbs.has(resolved)) continue;

      const externalProjectRel = toForwardSlash(
        path.relative(projectRoot, resolved),
      );
      if (!externalProjectRel || externalProjectRel.startsWith("..")) {
        // Outside project root - silently skip (e.g., monorepo workspace dep).
        continue;
      }
      const segments = externalProjectRel.split("/");
      if (segments.some((seg) => !SEGMENT_REGEX.test(seg))) {
        continue;
      }
      // Match the block-walk dotfile exclusion. `import "../.env"` or
      // `import "../.generated/foo"` would otherwise smuggle hidden
      // files into the archive even though the walker treats them as
      // out of scope - a workspace publishing a block could leak
      // local secrets that way.
      if (segments.some((seg) => seg.startsWith("."))) {
        continue;
      }
      const ext = path.extname(resolved).toLowerCase();
      if (!includeExt.has(ext)) continue;
      // Stat-then-read so a single oversize import (e.g. a stray
      // PDF/binary asset) fails fast instead of allocating GB into
      // memory before the cumulative cap fires. Unlike the block
      // walk, transitive imports tolerate missing/unreadable files
      // (silently skipped) - we never throw at the user for a flaky
      // node_modules layout we didn't ask them to publish.
      const fileStat = await fs.stat(resolved).catch(() => null);
      if (!fileStat) continue;
      if (totalBytes + fileStat.size > MAX_TOTAL_BYTES) {
        throw new Error(
          `block sources exceed ${MAX_TOTAL_BYTES} bytes (would-be ${totalBytes + fileStat.size} after "${externalProjectRel}") - prune large assets or split the block`,
        );
      }
      try {
        const buf = await fs.readFile(resolved);
        addFile(resolved, externalProjectRel, buf);
      } catch {
        continue;
      }
      if (SCANNABLE_EXTS.has(ext)) {
        queue.push(resolved);
      }
    }
  }

  // Only emit a synthetic tsconfig when the project actually carries
  // path aliases that the sandbox esbuild needs to resolve. Without
  // this, every legacy single-block fixture (no parent tsconfig)
  // would get an extra file in the archive even though it has no
  // aliases to resolve.
  const hasAliases = Object.keys(tsconfig.paths).length > 0;
  if (hasAliases && !hasProjectRootTsconfig(collected)) {
    const synthetic = buildSyntheticTsconfig(tsconfig);
    const buf = Buffer.from(synthetic);
    addFile(path.join(projectRoot, "tsconfig.json"), "tsconfig.json", buf);
  }

  const files = [...collected.values()].sort((a, b) =>
    a.relPath.localeCompare(b.relPath),
  );
  return { files, entryPath: entryProjectRel };
}

async function findProjectRoot(blockDir: string): Promise<string> {
  // Prefer an ancestor with package.json (the real cmssy-marketing
  // layout: blockDir is `blocks/<name>` whose own package.json is the
  // block manifest, not the project root). Fall back to blockDir
  // itself when no ancestor has a manifest - covers test fixtures and
  // legacy single-block trees where the block is the project.
  const resolved = path.resolve(blockDir);
  let dir = resolved;
  for (let i = 0; i < 16; i++) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    if (await fs.pathExists(path.join(parent, "package.json"))) {
      return parent;
    }
    dir = parent;
  }
  if (await fs.pathExists(path.join(resolved, "package.json"))) {
    return resolved;
  }
  throw new Error(
    `Could not find a directory with package.json at or above "${blockDir}" - publish requires a project root`,
  );
}

async function loadTsConfigPaths(projectRoot: string): Promise<TsConfigPaths> {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  if (!(await fs.pathExists(tsconfigPath))) {
    return { baseUrl: ".", paths: {} };
  }
  try {
    const raw = await fs.readFile(tsconfigPath, "utf8");
    // Tolerant JSONC: strip line + block comments + trailing commas
    // string-aware so we don't truncate paths like `"blocks/**/*"`
    // (whose `*/` would close a fake block comment opened by an
    // earlier `@/*` in the same file).
    const cleaned = stripJsoncCommentsAndTrailingCommas(raw);
    const parsed = JSON.parse(cleaned) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };
    return {
      baseUrl: parsed.compilerOptions?.baseUrl ?? ".",
      paths: parsed.compilerOptions?.paths ?? {},
    };
  } catch {
    return { baseUrl: ".", paths: {} };
  }
}

const IMPORT_FROM_RE =
  /(?:^|[\s;{}()])(?:import|export)\s+(?:type\s+)?[\s\S]+?\s+from\s+["']([^"']+)["']/g;
const IMPORT_SIDE_RE = /(?:^|[\s;{}()])import\s+["']([^"']+)["']/g;
const IMPORT_DYN_RE = /\bimport\s*\(\s*["']([^"']+)["']/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']/g;
const CSS_IMPORT_RE = /@import\s+(?:url\(\s*)?["']([^"']+)["']/g;
const CSS_URL_RE = /\burl\(\s*["']?([^"')]+)["']?\s*\)/g;

function extractImportSpecifiers(code: string, fileExt: string): string[] {
  const all = new Set<string>();
  const isCss = fileExt === ".css";
  const regexes = isCss
    ? [CSS_IMPORT_RE, CSS_URL_RE]
    : [IMPORT_FROM_RE, IMPORT_SIDE_RE, IMPORT_DYN_RE, REQUIRE_RE];
  for (const re of regexes) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      all.add(m[1]);
    }
  }
  return [...all];
}

async function resolveImportSpecifier(
  spec: string,
  importerAbs: string,
  projectRoot: string,
  tsconfig: TsConfigPaths,
): Promise<string | null> {
  if (!spec) return null;
  if (spec.startsWith(".")) {
    return resolveTarget(path.resolve(path.dirname(importerAbs), spec));
  }
  for (const [pattern, mappings] of Object.entries(tsconfig.paths)) {
    const matched = matchTsPath(spec, pattern, mappings);
    if (!matched) continue;
    for (const candidate of matched) {
      const target = path.resolve(projectRoot, tsconfig.baseUrl, candidate);
      const found = await resolveTarget(target);
      if (found) return found;
    }
    return null;
  }
  return null;
}

function matchTsPath(
  spec: string,
  pattern: string,
  mappings: string[],
): string[] | null {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    if (!spec.startsWith(prefix)) return null;
    const rest = spec.slice(prefix.length);
    return mappings.map((m) => m.replace(/\*$/, rest));
  }
  if (spec === pattern) return mappings;
  return null;
}

async function resolveTarget(target: string): Promise<string | null> {
  // `lstat` so we refuse to follow a symlink. The block-dir walk
  // already skips symbolic links; mirroring that here stops an
  // imported in-project symlink from sneaking a file from outside
  // the project root into the archive under an in-project path.
  const lstat = await fs.lstat(target).catch(() => null);
  if (lstat?.isFile()) return target;
  if (lstat?.isDirectory()) {
    for (const ext of RESOLVE_EXTS) {
      const candidate = path.join(target, `index${ext}`);
      const candLstat = await fs.lstat(candidate).catch(() => null);
      if (candLstat?.isFile()) return candidate;
    }
  }
  for (const ext of RESOLVE_EXTS) {
    const candidate = `${target}${ext}`;
    const candLstat = await fs.lstat(candidate).catch(() => null);
    if (candLstat?.isFile()) return candidate;
  }
  return null;
}

function hasProjectRootTsconfig(
  collected: Map<string, CollectedFile>,
): boolean {
  return collected.has("tsconfig.json");
}

function buildSyntheticTsconfig(tsconfig: TsConfigPaths): string {
  // Preserve the original baseUrl so projects that point paths at a
  // non-root directory (e.g. `baseUrl: "src", paths: { "@/*": ["*"] }`)
  // keep resolving the same way inside the sandbox. We default to "."
  // only when the source tsconfig didn't specify one - matches TS's
  // default behavior when baseUrl is omitted.
  return `${JSON.stringify(
    {
      compilerOptions: {
        baseUrl: tsconfig.baseUrl || ".",
        paths: tsconfig.paths,
        jsx: "preserve",
        moduleResolution: "bundler",
      },
    },
    null,
    2,
  )}\n`;
}

function toForwardSlash(p: string): string {
  return p.split(path.sep).join("/");
}

function stripJsoncCommentsAndTrailingCommas(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    // String literal: copy verbatim, including any `//` or `/*` inside.
    if (ch === '"') {
      out += ch;
      i++;
      while (i < input.length) {
        const c = input[i];
        out += c;
        if (c === "\\") {
          if (i + 1 < input.length) {
            out += input[i + 1];
            i += 2;
            continue;
          }
        }
        i++;
        if (c === '"') break;
      }
      continue;
    }
    // Line comment.
    if (ch === "/" && input[i + 1] === "/") {
      i += 2;
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    // Block comment.
    if (ch === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/"))
        i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  // Trailing commas.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function normalizeEntryPath(input: string): string {
  const trimmed = input.trim();
  if (path.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) {
    throw new Error(
      `entry path must be relative to the block directory, got "${input}"`,
    );
  }
  let p = trimmed.replace(/\\/g, "/");
  while (p.startsWith("./")) {
    p = p.slice(2);
  }
  if (p.startsWith("/")) {
    throw new Error(
      `entry path must be relative to the block directory, got "${input}"`,
    );
  }
  if (p.length === 0) {
    throw new Error(
      `entry path is empty after normalization (input: "${input}")`,
    );
  }
  return p;
}
