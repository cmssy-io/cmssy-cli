import { describe, expect, it, vi } from "vitest";
import { resolveWorkspaceId } from "../src/utils/resolve-workspace.js";

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(async () => ({ workspaceId: "  prompted-id  " })),
  },
}));

describe("resolveWorkspaceId", () => {
  it("trims explicit option value", async () => {
    const id = await resolveWorkspaceId("  abc123  ", { workspaceId: null });
    expect(id).toBe("abc123");
  });

  it("treats whitespace-only option as missing and falls back to .env", async () => {
    const id = await resolveWorkspaceId("   ", { workspaceId: "env-id" });
    expect(id).toBe("env-id");
  });

  it("trims .env value before returning", async () => {
    const id = await resolveWorkspaceId(undefined, {
      workspaceId: "  env-id  ",
    });
    expect(id).toBe("env-id");
  });

  it("falls through to inquirer when both option and env are blank", async () => {
    const id = await resolveWorkspaceId(undefined, { workspaceId: "   " });
    expect(id).toBe("prompted-id");
  });

  it("ignores boolean option values (commander -w without arg)", async () => {
    const id = await resolveWorkspaceId(true, { workspaceId: "env-id" });
    expect(id).toBe("env-id");
  });
});
