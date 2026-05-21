import { describe, expect, it } from "vitest";
import { TEMPLATE_NAME_REGEX } from "../src/commands/publish-template.js";

describe("TEMPLATE_NAME_REGEX", () => {
  it("accepts safe single-segment names", () => {
    for (const name of [
      "marketing-site",
      "blog",
      "My_Template",
      "_internal",
      "-foo",
      "a",
      "123",
      "Site-2024_v2",
    ]) {
      expect(TEMPLATE_NAME_REGEX.test(name)).toBe(true);
    }
  });

  it("rejects path-traversal vectors and anything with a separator", () => {
    for (const name of [
      "../etc",
      "..",
      ".hidden",
      "/abs",
      "foo/bar",
      "foo\\bar",
      "foo bar",
      "foo.bar",
      "",
      "tab\tname",
    ]) {
      expect(TEMPLATE_NAME_REGEX.test(name)).toBe(false);
    }
  });
});
