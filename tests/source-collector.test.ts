import { afterEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  collectBlockSources,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  normalizeEntryPath,
} from "../src/utils/source-collector.js";

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length) {
    const p = tmpRoots.pop()!;
    await fs.remove(p);
  }
});

async function makeBlock(
  files: Record<string, string | Buffer>,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cmssy-block-"));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fs.ensureDir(path.dirname(abs));
    await fs.writeFile(
      abs,
      typeof content === "string" ? content : (content as Buffer),
    );
  }
  return root;
}

describe("collectBlockSources", () => {
  it("collects supported files and base64-encodes them", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "export const Block = () => null;",
      "src/styles.css": "h1 { color: red; }",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.entryPath).toBe("src/index.tsx");
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "package.json",
      "src/index.tsx",
      "src/styles.css",
    ]);
    const entry = result.files.find((f) => f.relPath === "src/index.tsx")!;
    expect(Buffer.from(entry.contentBase64, "base64").toString("utf8")).toBe(
      "export const Block = () => null;",
    );
  });

  it("skips ignored directories like node_modules and dist", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "x",
      "node_modules/foo/index.js": "skipme",
      "dist/index.js": "skipme",
      ".git/HEAD": "skipme",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "package.json",
      "src/index.tsx",
    ]);
  });

  it("skips dotfile-prefixed directories not in the explicit ignore list", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "x",
      ".weird/sneaky.ts": "skipme",
      ".husky/pre-commit": "skipme",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "package.json",
      "src/index.tsx",
    ]);
  });

  it("skips dotfiles at file level (.env, .npmrc, etc.)", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "x",
      ".env": "SECRET=leaked",
      ".npmrc": "registry=https://x",
      ".gitignore": "node_modules",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "package.json",
      "src/index.tsx",
    ]);
  });

  it("skips test/spec/story files so they do not bloat publish bundles", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "x",
      "src/Block.test.tsx": "test",
      "src/Block.spec.ts": "test",
      "src/Block.stories.tsx": "story",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "package.json",
      "src/index.tsx",
    ]);
  });

  it("rejects when entry file is missing", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/Other.tsx": "x",
    });
    await expect(collectBlockSources({ blockDir: dir })).rejects.toThrow(
      /entry path "src\/index\.tsx" not found/,
    );
  });

  it("skips files with extensions not in the allowlist", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "x",
      "src/cover.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      "src/data.bin": Buffer.from([0, 1, 2]),
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "package.json",
      "src/index.tsx",
    ]);
  });

  it("includes preview.json and config.ts as block metadata", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "config.ts": "export default {};",
      "preview.json": "{}",
      "src/index.tsx": "x",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath).sort()).toEqual([
      "config.ts",
      "package.json",
      "preview.json",
      "src/index.tsx",
    ]);
  });

  it("respects custom entry path", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/main.tsx": "x",
    });
    const result = await collectBlockSources({
      blockDir: dir,
      entryRel: "src/main.tsx",
    });
    expect(result.entryPath).toBe("src/main.tsx");
  });

  it("rejects trees exceeding MAX_FILES", async () => {
    const files: Record<string, string> = {
      "package.json": '{"name":"big","version":"0.1.0"}',
      "src/index.tsx": "x",
    };
    for (let i = 0; i < MAX_FILES + 5; i += 1) {
      files[`src/util${i}.ts`] = "x";
    }
    const dir = await makeBlock(files);
    await expect(collectBlockSources({ blockDir: dir })).rejects.toThrow(
      new RegExp(`more than ${MAX_FILES} source files`),
    );
  });

  it("rejects trees exceeding MAX_TOTAL_BYTES", async () => {
    const big = Buffer.alloc(MAX_TOTAL_BYTES + 1024, 0x61).toString("utf8");
    const dir = await makeBlock({
      "package.json": '{"name":"big","version":"0.1.0"}',
      "src/index.tsx": "x",
      "src/big.ts": big,
    });
    await expect(collectBlockSources({ blockDir: dir })).rejects.toThrow(
      /sources exceed/,
    );
  });

  it("accepts entry path with backslashes (Windows) and leading ./", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/index.tsx": "x",
    });
    const a = await collectBlockSources({
      blockDir: dir,
      entryRel: "src\\index.tsx",
    });
    expect(a.entryPath).toBe("src/index.tsx");
    const b = await collectBlockSources({
      blockDir: dir,
      entryRel: "./src/index.tsx",
    });
    expect(b.entryPath).toBe("src/index.tsx");
  });

  it("returns files sorted by relPath", async () => {
    const dir = await makeBlock({
      "package.json": '{"name":"hero","version":"0.1.0"}',
      "src/z.ts": "x",
      "src/a.ts": "x",
      "src/index.tsx": "x",
      "config.ts": "export default {}",
    });
    const result = await collectBlockSources({ blockDir: dir });
    expect(result.files.map((f) => f.relPath)).toEqual([
      "config.ts",
      "package.json",
      "src/a.ts",
      "src/index.tsx",
      "src/z.ts",
    ]);
  });
});

describe("normalizeEntryPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizeEntryPath("src\\Block\\index.tsx")).toBe(
      "src/Block/index.tsx",
    );
  });
  it("strips leading ./ (single and repeated)", () => {
    expect(normalizeEntryPath("./src/index.tsx")).toBe("src/index.tsx");
    expect(normalizeEntryPath("././src/index.tsx")).toBe("src/index.tsx");
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeEntryPath("  src/index.tsx  ")).toBe("src/index.tsx");
  });
  it("rejects absolute paths", () => {
    expect(() => normalizeEntryPath("/abs/path")).toThrow(/relative/);
  });
  it("rejects empty input", () => {
    expect(() => normalizeEntryPath("./")).toThrow(/empty/);
    expect(() => normalizeEntryPath("")).toThrow(/empty/);
  });
});
