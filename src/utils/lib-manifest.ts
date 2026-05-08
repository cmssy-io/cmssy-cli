import fs from "fs-extra";
import path from "path";

const NPM_PACKAGE_NAME_REGEX =
  /^(@[a-z0-9][a-z0-9_.-]*\/)?[a-z0-9][a-z0-9_.-]*$/;
const VALID_VERSION_SPEC = /^[a-zA-Z0-9.\-+_^~<>=*| ]+$/;

export const RESERVED_PEERS = new Set(["react", "react-dom", "esbuild"]);

export interface LibManifest {
  dependencies: Record<string, string>;
}

async function readPackageJsonDeps(
  cwd: string = process.cwd(),
): Promise<Record<string, string>> {
  const pkgPath = path.join(cwd, "package.json");
  if (!(await fs.pathExists(pkgPath))) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }
  const pkg = (await fs.readJson(pkgPath)) as {
    dependencies?: Record<string, string>;
  };
  return pkg.dependencies ?? {};
}

export function buildLibManifest(deps: Record<string, string>): LibManifest {
  const out: Record<string, string> = {};
  const errors: string[] = [];
  for (const [name, spec] of Object.entries(deps)) {
    if (RESERVED_PEERS.has(name)) continue;
    if (!NPM_PACKAGE_NAME_REGEX.test(name)) {
      errors.push(`invalid npm package name: "${name}"`);
      continue;
    }
    if (typeof spec !== "string" || spec.trim().length === 0) {
      errors.push(`empty version spec for "${name}"`);
      continue;
    }
    const normalizedSpec = spec.trim();
    if (normalizedSpec.length > 100) {
      errors.push(`version spec too long for "${name}" (max 100 chars)`);
      continue;
    }
    const lowerSpec = normalizedSpec.toLowerCase();
    if (
      lowerSpec.startsWith("npm:") ||
      lowerSpec.startsWith("git") ||
      lowerSpec.startsWith("file:") ||
      lowerSpec.startsWith("workspace:") ||
      lowerSpec.startsWith("link:") ||
      lowerSpec.startsWith("http:") ||
      lowerSpec.startsWith("https:")
    ) {
      errors.push(
        `unsupported version source for "${name}": "${spec}" (aliases, git, file:, workspace:, link:, http(s) all rejected)`,
      );
      continue;
    }
    if (!VALID_VERSION_SPEC.test(normalizedSpec)) {
      errors.push(
        `version spec for "${name}" contains illegal characters: "${spec}"`,
      );
      continue;
    }
    out[name] = normalizedSpec;
  }
  if (errors.length > 0) {
    throw new Error(
      `lib manifest validation failed:\n  - ${errors.join("\n  - ")}`,
    );
  }
  return { dependencies: out };
}

export async function loadLibManifestFromProject(
  cwd: string = process.cwd(),
): Promise<LibManifest> {
  const deps = await readPackageJsonDeps(cwd);
  return buildLibManifest(deps);
}
