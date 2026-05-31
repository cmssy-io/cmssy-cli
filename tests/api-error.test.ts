import { describe, it, expect } from "vitest";
import { isVersionSkewError, friendlyApiError } from "../src/utils/api-error.js";

// Mirrors the real graphql-request error shape (error.response.errors[]).
function gqlError(message: string, code = "GRAPHQL_VALIDATION_FAILED") {
  return { response: { errors: [{ message, extensions: { code } }] } };
}

describe("isVersionSkewError", () => {
  it("detects the ImportBlockInput drift we hit in production", () => {
    expect(
      isVersionSkewError(
        gqlError('Unknown type "ImportBlockInput". Did you mean "PublishBlockInput"?'),
      ),
    ).toBe(true);
  });

  it("detects the sourceUrl field drift", () => {
    expect(
      isVersionSkewError(
        gqlError('Cannot query field "sourceUrl" on type "WorkspaceBlock".'),
      ),
    ).toBe(true);
  });

  it("ignores ordinary auth/validation failures", () => {
    expect(isVersionSkewError(gqlError("Not authorized", "UNAUTHENTICATED"))).toBe(false);
  });

  it("ignores non-graphql errors", () => {
    expect(isVersionSkewError(new Error("ECONNREFUSED"))).toBe(false);
    expect(isVersionSkewError(undefined)).toBe(false);
  });
});

describe("friendlyApiError", () => {
  it("rewrites a skew error into an actionable upgrade message", () => {
    const input = gqlError('Unknown type "ImportBlockInput".');
    const out = friendlyApiError(input);
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toMatch(/incompatible/);
    expect(out.message).toMatch(/@cmssy\/cli@latest/);
    // keeps the original for debugging
    expect(out.message).toMatch(/ImportBlockInput/);
    // and preserves the original throwable on `cause`
    expect(out.cause).toBe(input);
  });

  it("passes non-skew errors through unchanged", () => {
    const original = new Error("boom");
    expect(friendlyApiError(original)).toBe(original);
  });
});
