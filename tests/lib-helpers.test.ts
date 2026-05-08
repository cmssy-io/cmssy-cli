import { afterEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { buildAddArgs, detectPackageManager } from "../src/commands/lib.js";

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length) {
    const p = tmpRoots.pop()!;
    await fs.remove(p);
  }
});

async function tmpdir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cmssy-pm-"));
  tmpRoots.push(root);
  return root;
}

describe("buildAddArgs", () => {
  it("returns argv array for npm install", () => {
    expect(buildAddArgs("npm", ["lodash", "zod@^4"])).toEqual([
      "install",
      "lodash",
      "zod@^4",
    ]);
  });
  it("returns argv array for pnpm add", () => {
    expect(buildAddArgs("pnpm", ["lodash", "@scope/pkg@^1.0.0"])).toEqual([
      "add",
      "lodash",
      "@scope/pkg@^1.0.0",
    ]);
  });
  it("returns argv array for yarn add", () => {
    expect(buildAddArgs("yarn", ["zod"])).toEqual(["add", "zod"]);
  });
  it("returns argv array for bun add", () => {
    expect(buildAddArgs("bun", ["zod", "lodash"])).toEqual([
      "add",
      "zod",
      "lodash",
    ]);
  });
  it("preserves package specs verbatim - no shell escaping needed", () => {
    expect(
      buildAddArgs("npm", ["lodash@<3.0.0", "zod@>=4 <5", "*name*"]),
    ).toEqual(["install", "lodash@<3.0.0", "zod@>=4 <5", "*name*"]);
  });
});

describe("detectPackageManager", () => {
  it("detects pnpm via pnpm-lock.yaml", async () => {
    const dir = await tmpdir();
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
  it("detects yarn via yarn.lock", async () => {
    const dir = await tmpdir();
    await fs.writeFile(path.join(dir, "yarn.lock"), "");
    expect(detectPackageManager(dir)).toBe("yarn");
  });
  it("detects bun via bun.lockb", async () => {
    const dir = await tmpdir();
    await fs.writeFile(path.join(dir, "bun.lockb"), "");
    expect(detectPackageManager(dir)).toBe("bun");
  });
  it("detects bun via bun.lock (text format)", async () => {
    const dir = await tmpdir();
    await fs.writeFile(path.join(dir, "bun.lock"), "");
    expect(detectPackageManager(dir)).toBe("bun");
  });
  it("falls back to npm when no lockfile exists", async () => {
    const dir = await tmpdir();
    expect(detectPackageManager(dir)).toBe("npm");
  });
  it("prefers pnpm over yarn when both lockfiles exist", async () => {
    const dir = await tmpdir();
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "");
    await fs.writeFile(path.join(dir, "yarn.lock"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
});
