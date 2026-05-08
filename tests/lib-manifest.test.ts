import { afterEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  buildLibManifest,
  loadLibManifestFromProject,
} from "../src/utils/lib-manifest.js";

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length) {
    const p = tmpRoots.pop()!;
    await fs.remove(p);
  }
});

async function makeProject(pkg: Record<string, unknown>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cmssy-proj-"));
  tmpRoots.push(root);
  await fs.writeJson(path.join(root, "package.json"), pkg);
  return root;
}

describe("buildLibManifest", () => {
  it("filters out reserved peer deps (react, react-dom, esbuild)", () => {
    const m = buildLibManifest({
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      esbuild: "^0.27.3",
      lodash: "^4.0.0",
    });
    expect(m.dependencies).toEqual({ lodash: "^4.0.0" });
  });

  it("rejects npm:, git, file:, workspace:, link:, http(s) version specs", () => {
    expect(() => buildLibManifest({ alias: "npm:other@^1.0.0" })).toThrow(
      /unsupported version source/,
    );
    expect(() => buildLibManifest({ pkg: "git+https://x" })).toThrow(
      /unsupported version source/,
    );
    expect(() => buildLibManifest({ pkg: "file:./local" })).toThrow(
      /unsupported version source/,
    );
    expect(() => buildLibManifest({ pkg: "workspace:*" })).toThrow(
      /unsupported version source/,
    );
    expect(() => buildLibManifest({ pkg: "link:../foo" })).toThrow(
      /unsupported version source/,
    );
    expect(() =>
      buildLibManifest({ pkg: "https://npm.example/x.tgz" }),
    ).toThrow(/unsupported version source/);
  });

  it("rejects invalid npm package names", () => {
    expect(() => buildLibManifest({ "Invalid Caps": "^1.0.0" })).toThrow(
      /invalid npm package name/,
    );
  });

  it("rejects empty version specs", () => {
    expect(() => buildLibManifest({ lodash: "" })).toThrow(/empty version/);
  });

  it("treats whitespace-only version specs as empty", () => {
    expect(() => buildLibManifest({ lodash: "   " })).toThrow(/empty version/);
  });

  it("rejects unsupported version sources case-insensitively and after trim", () => {
    expect(() => buildLibManifest({ a: "  NPM:other@^1" })).toThrow(
      /unsupported version source/,
    );
    expect(() => buildLibManifest({ b: "GIT+https://x" })).toThrow(
      /unsupported version source/,
    );
    expect(() => buildLibManifest({ c: "  Workspace:*" })).toThrow(
      /unsupported version source/,
    );
  });

  it("trims valid version specs before storing", () => {
    const m = buildLibManifest({ lodash: "  ^4.0.0  " });
    expect(m.dependencies.lodash).toBe("^4.0.0");
  });

  it("rejects version specs with illegal characters", () => {
    expect(() => buildLibManifest({ lodash: "1.0.0; rm -rf /" })).toThrow(
      /illegal characters/,
    );
  });

  it("aggregates multiple errors in a single message", () => {
    expect(() =>
      buildLibManifest({
        "Bad Name": "^1.0.0",
        ok: "^1.0.0",
        weird: "1; rm",
      }),
    ).toThrow(/invalid npm package name[\s\S]+illegal characters/);
  });

  it("preserves valid scoped names and ranges", () => {
    const m = buildLibManifest({
      "@scope/pkg": "^1.2.3",
      tsx: ">=4.0.0 <5.0.0",
      semver: "*",
    });
    expect(m.dependencies).toEqual({
      "@scope/pkg": "^1.2.3",
      tsx: ">=4.0.0 <5.0.0",
      semver: "*",
    });
  });
});

describe("loadLibManifestFromProject", () => {
  it("reads package.json deps and validates them", async () => {
    const cwd = await makeProject({
      name: "test",
      version: "0.0.0",
      dependencies: { lodash: "^4.0.0", "@scope/pkg": "^1.0.0" },
    });
    const m = await loadLibManifestFromProject(cwd);
    expect(m.dependencies).toEqual({
      lodash: "^4.0.0",
      "@scope/pkg": "^1.0.0",
    });
  });

  it("throws when package.json is missing", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cmssy-empty-"));
    tmpRoots.push(cwd);
    await expect(loadLibManifestFromProject(cwd)).rejects.toThrow(
      /package\.json not found/,
    );
  });

  it("returns empty manifest when no dependencies field exists", async () => {
    const cwd = await makeProject({ name: "test", version: "0.0.0" });
    const m = await loadLibManifestFromProject(cwd);
    expect(m.dependencies).toEqual({});
  });
});
