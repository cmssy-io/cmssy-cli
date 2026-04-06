import { describe, it, expect } from "vitest";
import { validatePreviewData } from "../src/test-helpers/index.js";

describe("validatePreviewData", () => {
  it("returns valid for empty schema", () => {
    const result = validatePreviewData({}, {});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns valid when required fields present", () => {
    const schema = {
      title: { type: "singleLine", required: true },
      body: { type: "multiLine", required: true },
    };
    const data = { title: "Hello", body: "World" };
    expect(validatePreviewData(schema, data).valid).toBe(true);
  });

  it("detects missing required field", () => {
    const schema = {
      title: { type: "singleLine", required: true },
    };
    const result = validatePreviewData(schema, {});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("title");
  });

  it("detects empty string as missing", () => {
    const schema = {
      title: { type: "singleLine", required: true },
    };
    const result = validatePreviewData(schema, { title: "" });
    expect(result.valid).toBe(false);
  });

  it("detects null as missing", () => {
    const schema = {
      title: { type: "singleLine", required: true },
    };
    const result = validatePreviewData(schema, { title: null });
    expect(result.valid).toBe(false);
  });

  it("ignores optional fields", () => {
    const schema = {
      title: { type: "singleLine", required: true },
      subtitle: { type: "singleLine" },
    };
    const result = validatePreviewData(schema, { title: "Hello" });
    expect(result.valid).toBe(true);
  });

  it("reports multiple missing fields", () => {
    const schema = {
      title: { type: "singleLine", required: true },
      body: { type: "multiLine", required: true },
    };
    const result = validatePreviewData(schema, {});
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
