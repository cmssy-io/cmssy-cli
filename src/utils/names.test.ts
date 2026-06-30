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

  it.each(["123", "2cool", "3d-grid"])(
    "throws when the name starts with a digit (%s)",
    (input) => {
      expect(() => blockNames(input)).toThrow(/start with a letter/);
    },
  );

  it("strips punctuation so identifiers stay valid", () => {
    expect(blockNames("feature-grid!")).toEqual({
      type: "feature-grid",
      camel: "featureGrid",
      Pascal: "FeatureGrid",
      Label: "Feature Grid",
    });
    expect(blockNames("hero (v2)")).toEqual({
      type: "hero-v2",
      camel: "heroV2",
      Pascal: "HeroV2",
      Label: "Hero V2",
    });
  });
});
