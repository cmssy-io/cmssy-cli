import { describe, expect, it } from "vitest";
import { extractBlockType } from "./publish-helpers.js";

describe("extractBlockType", () => {
  it("strips an @scope/ prefix", () => {
    expect(extractBlockType("@cmssy/blocks.hero")).toBe("hero");
    expect(extractBlockType("@org/templates.landing")).toBe("landing");
  });

  it("strips a non-scoped path prefix (regression - was lost when convertBlockTypeToSimple was removed)", () => {
    expect(extractBlockType("vendor/blocks.hero")).toBe("hero");
    expect(extractBlockType("cmssy/blocks.pricing-table")).toBe(
      "pricing-table",
    );
  });

  it("strips the bare blocks./templates. prefix", () => {
    expect(extractBlockType("blocks.hero")).toBe("hero");
    expect(extractBlockType("templates.landing")).toBe("landing");
  });

  it("leaves an already-simple type unchanged", () => {
    expect(extractBlockType("hero")).toBe("hero");
    expect(extractBlockType("pricing-table")).toBe("pricing-table");
  });

  it("takes the last segment when multiple slashes are present", () => {
    expect(extractBlockType("@scope/sub/blocks.hero")).toBe("hero");
  });
});
