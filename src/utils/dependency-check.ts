import chalk from "chalk";
import fs from "fs-extra";
import path from "path";

interface BlockDep {
  blockName: string;
  packageName: string;
  versionRange: string;
}

/**
 * Check if block dependencies are installed in the project.
 * Returns list of missing dependencies.
 */
export function checkBlockDependencies(
  blocks: Array<{
    name: string;
    config: { dependencies?: Record<string, string> } | null;
  }>,
  projectRoot: string,
): BlockDep[] {
  const missing: BlockDep[] = [];

  for (const block of blocks) {
    const deps = block.config?.dependencies;
    if (!deps) continue;

    for (const [pkg, version] of Object.entries(deps)) {
      const pkgPath = path.join(projectRoot, "node_modules", pkg);
      if (!fs.existsSync(pkgPath)) {
        missing.push({
          blockName: block.name,
          packageName: pkg,
          versionRange: version,
        });
      }
    }
  }

  return missing;
}

/**
 * Print missing dependency warnings to console.
 */
export function printMissingDeps(missing: BlockDep[]): void {
  if (missing.length === 0) return;

  console.log(chalk.yellow("\n⚠ Missing block dependencies:\n"));

  // Group by package for cleaner output
  const byPackage = new Map<string, BlockDep[]>();
  for (const dep of missing) {
    const key = `${dep.packageName}@${dep.versionRange}`;
    if (!byPackage.has(key)) byPackage.set(key, []);
    byPackage.get(key)!.push(dep);
  }

  for (const [key, deps] of byPackage) {
    const blocks = deps.map((d) => d.blockName).join(", ");
    console.log(chalk.yellow(`  ${key}`) + chalk.gray(` (used by: ${blocks})`));
  }

  // Build install command
  const packages = [
    ...new Set(missing.map((d) => `${d.packageName}@${d.versionRange}`)),
  ];
  console.log(chalk.gray(`\n  Run: npm install ${packages.join(" ")}\n`));
}
