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
    expect(await readFile(f, "utf8")).toContain(
      "[heroBlock, featureGridBlock]",
    );
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
