import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PackageJson } from "./project.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) {
    return "bun";
  }
  return "npm";
}

/** Merge deps into package.json without overwriting versions already pinned. */
export async function ensureDependencies(
  cwd: string,
  deps: Record<string, string>,
): Promise<string[]> {
  const p = join(cwd, "package.json");
  const pkg = JSON.parse(await readFile(p, "utf8")) as PackageJson;
  pkg.dependencies ??= {};
  const added: string[] = [];
  for (const [name, version] of Object.entries(deps)) {
    if (!pkg.dependencies[name] && !pkg.devDependencies?.[name]) {
      pkg.dependencies[name] = version;
      added.push(name);
    }
  }
  if (added.length) {
    await writeFile(p, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  }
  return added;
}

export function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

export function installArgs(pm: PackageManager): string[] {
  return pm === "yarn" ? [] : ["install"];
}
