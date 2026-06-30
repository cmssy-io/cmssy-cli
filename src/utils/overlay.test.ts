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
});
