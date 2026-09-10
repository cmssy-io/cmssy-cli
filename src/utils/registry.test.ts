import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerBlock } from "./registry.js";

const SEED = `import { heroBlock } from "@/blocks/hero/block";

export const blocks = [heroBlock];
`;

async function seed(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cmssy-reg-"));
  const f = join(dir, "blocks.ts");
  await writeFile(f, SEED);
  return f;
}

describe("registerBlock", () => {
  it("adds an import and array entry", async () => {
    const f = await seed();
    expect(await registerBlock(f, "featureGrid", "feature-grid")).toBe(true);
    const out = await readFile(f, "utf8");
    expect(out).toContain(
      'import { featureGridBlock } from "@/blocks/feature-grid/block";',
    );
    expect(out).toContain(
      "export const blocks = [heroBlock, featureGridBlock];",
    );
  });

  it("is idempotent", async () => {
    const f = await seed();
    await registerBlock(f, "featureGrid", "feature-grid");
    expect(await registerBlock(f, "featureGrid", "feature-grid")).toBe(false);
    const out = await readFile(f, "utf8");
    expect(out.match(/featureGridBlock/g)?.length).toBe(2);
  });

  it("tolerates whitespace variations in the array declaration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-reg-"));
    const f = join(dir, "blocks.ts");
    await writeFile(f, "export const blocks=[\n  heroBlock,\n];\n");
    expect(await registerBlock(f, "featureGrid", "feature-grid")).toBe(true);
    const out = await readFile(f, "utf8");
    expect(out).toContain("heroBlock, featureGridBlock");
    expect(out).toContain(
      'import { featureGridBlock } from "@/blocks/feature-grid/block";',
    );
  });

  it("preserves comments inside the array", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-reg-"));
    const f = join(dir, "blocks.ts");
    await writeFile(f, "export const blocks = [heroBlock /* keep me */];\n");
    expect(await registerBlock(f, "featureGrid", "feature-grid")).toBe(true);
    const out = await readFile(f, "utf8");
    expect(out).toContain("/* keep me */");
    expect(out).toContain("featureGridBlock");
  });

  it("registers in the array when the import already exists, without duplicating it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-reg-"));
    const f = join(dir, "blocks.ts");
    await writeFile(
      f,
      'import { heroBlock } from "@/blocks/hero/block";\nimport { featureGridBlock } from "@/blocks/feature-grid/block";\n\nexport const blocks = [heroBlock];\n',
    );
    expect(await registerBlock(f, "featureGrid", "feature-grid")).toBe(true);
    const out = await readFile(f, "utf8");
    expect(out.match(/import \{ featureGridBlock \}/g)?.length).toBe(1);
    expect(out).toContain("[heroBlock, featureGridBlock]");
  });

  it("throws (without writing) when the blocks array is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cmssy-reg-"));
    const f = join(dir, "blocks.ts");
    const original = "export const other = [];\n";
    await writeFile(f, original);
    await expect(
      registerBlock(f, "featureGrid", "feature-grid"),
    ).rejects.toThrow();
    expect(await readFile(f, "utf8")).toBe(original);
  });
});
