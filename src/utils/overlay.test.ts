import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyOverlay } from "./overlay.js";

async function tmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cmssy-overlay-"));
}

describe("applyOverlay", () => {
  it("writes the full overlay on a fresh target", async () => {
    const dir = await tmpDir();
    const report = await applyOverlay(dir, "fresh");
    expect(report.written).toContain("cmssy.config.ts");
    expect(report.written).toContain("blocks/hero/block.ts");
    expect(report.written).toContain(".env.example");
    expect(existsSync(join(dir, "app", "[[...path]]", "page.tsx"))).toBe(true);
    expect(report.skipped).toHaveLength(0);
  });

  it("never clobbers an existing file in existing mode", async () => {
    const dir = await tmpDir();
    await mkdir(join(dir, "cmssy"), { recursive: true });
    await writeFile(join(dir, "cmssy", "blocks.ts"), "// mine\n");
    const report = await applyOverlay(dir, "existing");
    expect(report.skipped).toContain("cmssy/blocks.ts");
    expect(report.written).toContain("cmssy.config.ts");
  });

  it("does not introduce styling files into an existing project", async () => {
    const dir = await tmpDir();
    const report = await applyOverlay(dir, "existing");
    expect(report.omitted).toEqual(
      expect.arrayContaining([
        "styles/globals.css",
        "postcss.config.mjs",
        "app/layout.tsx",
      ]),
    );
    expect(existsSync(join(dir, "styles", "globals.css"))).toBe(false);
    expect(existsSync(join(dir, "postcss.config.mjs"))).toBe(false);
    expect(report.written).toContain("cmssy.config.ts");
    expect(report.written).toContain("blocks/hero/block.ts");
  });

  it("places overlay under src/ for a src-dir project, configs at root", async () => {
    const dir = await tmpDir();
    await applyOverlay(dir, "fresh", true);
    expect(existsSync(join(dir, "src", "cmssy.config.ts"))).toBe(true);
    expect(existsSync(join(dir, "src", "cmssy", "blocks.ts"))).toBe(true);
    expect(existsSync(join(dir, "src", "app", "[[...path]]", "page.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(dir, "next.config.mjs"))).toBe(true);
    expect(existsSync(join(dir, ".env.example"))).toBe(true);
    expect(existsSync(join(dir, "src", "next.config.mjs"))).toBe(false);
  });
});
