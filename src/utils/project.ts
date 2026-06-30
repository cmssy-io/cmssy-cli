import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface ProjectInfo {
  cwd: string;
  hasPackageJson: boolean;
  pkg: PackageJson | null;
  isEmpty: boolean;
  hasNext: boolean;
  appDir: string | null;
  isNextAppRouter: boolean;
}

const IGNORED_ENTRIES = new Set([".git", ".DS_Store", "Thumbs.db"]);

export function readPackageJson(cwd: string): PackageJson | null {
  const p = join(cwd, "package.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

export function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

export function detectProject(cwd: string): ProjectInfo {
  const pkg = readPackageJson(cwd);
  const entries = existsSync(cwd)
    ? readdirSync(cwd).filter((e) => !IGNORED_ENTRIES.has(e))
    : [];

  const appDir = existsSync(join(cwd, "app"))
    ? join(cwd, "app")
    : existsSync(join(cwd, "src", "app"))
      ? join(cwd, "src", "app")
      : null;

  const hasNext = hasDep(pkg, "next");

  return {
    cwd,
    hasPackageJson: pkg !== null,
    pkg,
    isEmpty: entries.length === 0,
    hasNext,
    appDir,
    isNextAppRouter: hasNext && appDir !== null,
  };
}
