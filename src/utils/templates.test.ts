import { describe, expect, it } from "vitest";
import { renderTemplate } from "./templates.js";

describe("renderTemplate", () => {
  it("replaces known tokens", () => {
    const out = renderTemplate("export const {{camel}}Block // {{type}}", {
      camel: "featureGrid",
      type: "feature-grid",
    });
    expect(out).toBe("export const featureGridBlock // feature-grid");
  });

  it("leaves unknown tokens untouched", () => {
    expect(renderTemplate("{{a}}-{{b}}", { a: "x" })).toBe("x-{{b}}");
  });
});
