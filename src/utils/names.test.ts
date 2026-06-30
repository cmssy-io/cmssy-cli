import { describe, expect, it } from "vitest";
import { blockNames } from "./names.js";

describe("blockNames", () => {
  it.each([
    [
      "Feature Grid",
      "feature-grid",
      "featureGrid",
      "FeatureGrid",
      "Feature Grid",
    ],
    [
      "feature-grid",
      "feature-grid",
      "featureGrid",
      "FeatureGrid",
      "Feature Grid",
    ],
    [
      "featureGrid",
      "feature-grid",
      "featureGrid",
      "FeatureGrid",
      "Feature Grid",
    ],
    ["hero_banner", "hero-banner", "heroBanner", "HeroBanner", "Hero Banner"],
    ["CTA", "cta", "cta", "Cta", "Cta"],
  ])("%s", (input, type, camel, Pascal, Label) => {
    expect(blockNames(input)).toEqual({ type, camel, Pascal, Label });
  });

  it("throws on empty input", () => {
    expect(() => blockNames("   ")).toThrow();
  });
});
