import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPkg(): { name?: string; version?: string } {
  // Works for both src/utils/version.ts and dist/utils/version.js
  // (package.json is two levels up in both layouts).
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "../../package.json"), "utf-8"),
    );
  } catch {
    return {};
  }
}

const pkg = readPkg();

/** This CLI's package name, e.g. "@cmssy/cli". */
export const CLI_NAME = pkg.name ?? "@cmssy/cli";

/** This CLI's semver version, e.g. "0.22.2". */
export const CLI_VERSION = pkg.version ?? "0.0.0";

/**
 * Headers every request should carry so the API can identify the client and,
 * in the future, warn/reject on incompatible versions.
 */
export function clientHeaders(): Record<string, string> {
  return {
    "x-client-name": CLI_NAME,
    "x-client-version": CLI_VERSION,
  };
}
