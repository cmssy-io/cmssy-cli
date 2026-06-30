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
  it("writes the cmssy wiring + self-styled example block", async () => {
    const dir = await tmpDir();
    const report = await applyOverlay(dir);
    expect(report.written).toContain("cmssy.config.ts");
    expect(report.written).toContain("blocks/hero/block.ts");
    expect(report.written).toContain("blocks/hero/Hero.module.css");
    expect(report.written).toContain(".env.example");
    expect(existsSync(join(dir, "app", "[[...path]]", "page.tsx"))).toBe(true);
    expect(report.skipped).toHaveLength(0);
  });

  it("never introduces styling files into the host project", async () => {
    const dir = await tmpDir();
    await applyOverlay(dir);
    expect(existsSync(join(dir, "styles", "globals.css"))).toBe(false);
    expect(existsSync(join(dir, "postcss.config.mjs"))).toBe(false);
    expect(existsSync(join(dir, "app", "layout.tsx"))).toBe(false);
  });

  it("skips next.config.mjs when another next.config.* exists", async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, "next.config.ts"), "export default {};\n");
    const report = await applyOverlay(dir);
    expect(report.skipped).toContain("next.config.mjs");
    expect(existsSync(join(dir, "next.config.mjs"))).toBe(false);
  });

  it("never clobbers an existing file", async () => {
    const dir = await tmpDir();
    await mkdir(join(dir, "cmssy"), { recursive: true });
    await writeFile(join(dir, "cmssy", "blocks.ts"), "// mine\n");
    const report = await applyOverlay(dir);
    expect(report.skipped).toContain("cmssy/blocks.ts");
    expect(report.written).toContain("cmssy.config.ts");
  });

  it("places overlay under src/ for a src-dir project, config files at root", async () => {
    const dir = await tmpDir();
    await applyOverlay(dir, true);
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
