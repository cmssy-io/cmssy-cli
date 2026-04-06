import { describe, it, expect } from "vitest";
import {
  diffSchema,
  hasBreakingChanges,
  type Schema,
} from "../src/utils/schema-diff.js";

describe("diffSchema", () => {
  it("returns empty for identical schemas", () => {
    const schema: Schema = {
      title: { type: "singleLine", label: "Title" },
    };
    expect(diffSchema(schema, schema)).toEqual([]);
  });

  it("detects field removed as breaking", () => {
    const local: Schema = {};
    const remote: Schema = { heading: { type: "singleLine" } };
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("breaking");
    expect(changes[0].message).toContain("heading");
    expect(changes[0].message).toContain("removed");
  });

  it("detects field type changed as breaking", () => {
    const local: Schema = { body: { type: "richText" } };
    const remote: Schema = { body: { type: "singleLine" } };
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("breaking");
    expect(changes[0].message).toContain("singleLine");
    expect(changes[0].message).toContain("richText");
  });

  it("detects required field added without default as breaking", () => {
    const local: Schema = {
      name: { type: "singleLine", required: true },
    };
    const remote: Schema = {};
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("breaking");
    expect(changes[0].message).toContain("Required");
  });

  it("detects optional field added as info", () => {
    const local: Schema = {
      badge: { type: "singleLine", defaultValue: "New" },
    };
    const remote: Schema = {};
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("info");
    expect(changes[0].message).toContain("badge");
    expect(changes[0].message).toContain("optional");
  });

  it("detects required field with default as breaking", () => {
    const local: Schema = {
      title: { type: "singleLine", required: true, defaultValue: "Hello" },
    };
    const remote: Schema = {};
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("breaking");
    expect(changes[0].message).toContain("Required");
  });

  it("detects label change as info", () => {
    const local: Schema = {
      sub: { type: "singleLine", label: "Subtitle" },
    };
    const remote: Schema = {
      sub: { type: "singleLine", label: "Sub Title" },
    };
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("info");
    expect(changes[0].message).toContain("label changed");
  });

  it("detects defaultValue change as info", () => {
    const local: Schema = {
      color: { type: "color", defaultValue: "#000" },
    };
    const remote: Schema = {
      color: { type: "color", defaultValue: "#fff" },
    };
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("info");
    expect(changes[0].message).toContain("defaultValue");
  });

  it("detects optional to required as breaking", () => {
    const local: Schema = {
      name: { type: "singleLine", required: true },
    };
    const remote: Schema = {
      name: { type: "singleLine" },
    };
    const changes = diffSchema(local, remote);
    expect(
      changes.some(
        (c) =>
          c.kind === "breaking" && c.message.includes("optional to required"),
      ),
    ).toBe(true);
  });

  it("detects required to optional as info", () => {
    const local: Schema = {
      name: { type: "singleLine" },
    };
    const remote: Schema = {
      name: { type: "singleLine", required: true },
    };
    const changes = diffSchema(local, remote);
    expect(
      changes.some(
        (c) => c.kind === "info" && c.message.includes("required to optional"),
      ),
    ).toBe(true);
  });

  it("detects label removed as info", () => {
    const local: Schema = {
      title: { type: "singleLine" },
    };
    const remote: Schema = {
      title: { type: "singleLine", label: "Title" },
    };
    const changes = diffSchema(local, remote);
    expect(
      changes.some(
        (c) => c.kind === "info" && c.message.includes("label removed"),
      ),
    ).toBe(true);
  });

  it("detects defaultValue removed as info", () => {
    const local: Schema = {
      color: { type: "color" },
    };
    const remote: Schema = {
      color: { type: "color", defaultValue: "#fff" },
    };
    const changes = diffSchema(local, remote);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("info");
    expect(changes[0].message).toContain("defaultValue removed");
  });

  it("handles multiple changes", () => {
    const local: Schema = {
      title: { type: "richText" },
      badge: { type: "singleLine" },
    };
    const remote: Schema = {
      title: { type: "singleLine" },
      heading: { type: "singleLine" },
    };
    const changes = diffSchema(local, remote);
    expect(changes.length).toBeGreaterThanOrEqual(3);
    expect(hasBreakingChanges(changes)).toBe(true);
  });
});

describe("hasBreakingChanges", () => {
  it("returns false for empty changes", () => {
    expect(hasBreakingChanges([])).toBe(false);
  });

  it("returns false for info-only changes", () => {
    expect(hasBreakingChanges([{ kind: "info", message: "test" }])).toBe(false);
  });

  it("returns true when breaking exists", () => {
    expect(
      hasBreakingChanges([
        { kind: "info", message: "a" },
        { kind: "breaking", message: "b" },
      ]),
    ).toBe(true);
  });
});
