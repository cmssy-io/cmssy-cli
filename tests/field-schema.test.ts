import { describe, it, expect } from "vitest";
import { fieldTypeValues } from "@cmssy/types";
import { FALLBACK_FIELD_TYPES } from "../src/utils/field-schema.js";

describe("FALLBACK_FIELD_TYPES vs @cmssy/types", () => {
  it("should cover every field type from @cmssy/types", () => {
    const fallbackTypes = FALLBACK_FIELD_TYPES.map((ft) => ft.type).sort();
    const sourceTypes = [...fieldTypeValues].sort();

    expect(fallbackTypes).toEqual(sourceTypes);
  });
});
