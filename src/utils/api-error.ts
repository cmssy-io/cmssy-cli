import { CLI_VERSION } from "./version.js";

/**
 * GraphQL validation-error message fragments that signal the CLI is asking the
 * API for something the API no longer (or doesn't yet) understand - i.e. the
 * client and server schemas have drifted. These are the symptoms we saw when an
 * old CLI hit a newer API ("Unknown type ImportBlockInput", "Cannot query field
 * sourceUrl on type WorkspaceBlock").
 */
const SKEW_PATTERNS: RegExp[] = [
  /Unknown type/i,
  /Cannot query field/i,
  /Unknown argument/i,
  /Unknown field/i,
  /is not defined by type/i,
];

/** True if `error` looks like a client/API schema-version mismatch. */
export function isVersionSkewError(error: unknown): boolean {
  const errs = (error as any)?.response?.errors;
  if (!Array.isArray(errs)) return false;
  return errs.some((e: any) => {
    const code = e?.extensions?.code;
    const msg = String(e?.message ?? "");
    return (
      (code === "GRAPHQL_VALIDATION_FAILED" || code === undefined) &&
      SKEW_PATTERNS.some((p) => p.test(msg))
    );
  });
}

/**
 * Turn a cryptic GraphQL validation error into an actionable CLI/API
 * incompatibility message. Non-skew `Error` instances are returned unchanged;
 * non-skew non-Error throwables are normalized to an `Error` so callers always
 * receive an `Error`.
 */
export function friendlyApiError(error: unknown): Error {
  if (!isVersionSkewError(error)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const original =
    (error as any)?.response?.errors?.[0]?.message ??
    (error as any)?.message ??
    "GraphQL validation error";
  return new Error(
    `The Cmssy API rejected a request this CLI sent (GraphQL validation error).\n` +
      `  @cmssy/cli (v${CLI_VERSION}) and the Cmssy API are incompatible -\n` +
      `  most often the CLI is out of date. Try upgrading first:\n` +
      `    npm i -g @cmssy/cli@latest        # if installed globally\n` +
      `    # or bump the @cmssy/cli devDependency in your project\n` +
      `  If you are already on the latest CLI, the API may be older than this CLI\n` +
      `  expects (e.g. a self-hosted or staging backend) - check the API version.\n` +
      `  Original error: ${original}`,
  );
}
