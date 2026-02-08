import { describe, it, expect } from "vitest";
import { VERSIONS } from "../src/utils/versions.js";

describe("VERSIONS", () => {
  it("should export all required version keys", () => {
    expect(VERSIONS).toHaveProperty("react");
    expect(VERSIONS).toHaveProperty("reactDom");
    expect(VERSIONS).toHaveProperty("next");
    expect(VERSIONS).toHaveProperty("typescript");
    expect(VERSIONS).toHaveProperty("tailwindcss");
    expect(VERSIONS).toHaveProperty("tailwindPostcss");
    expect(VERSIONS).toHaveProperty("typesReact");
    expect(VERSIONS).toHaveProperty("typesReactDom");
  });

  it("should use semver range format for all versions", () => {
    const semverRangeRegex = /^\^?\d+\.\d+\.\d+/;
    for (const [key, value] of Object.entries(VERSIONS)) {
      expect(value, `${key} should be a valid semver range`).toMatch(
        semverRangeRegex,
      );
    }
  });

  it("should use React 19+", () => {
    expect(VERSIONS.react).toMatch(/^\^19\./);
    expect(VERSIONS.reactDom).toMatch(/^\^19\./);
  });

  it("should use Next.js 16+", () => {
    expect(VERSIONS.next).toMatch(/^\^16\./);
  });
});
