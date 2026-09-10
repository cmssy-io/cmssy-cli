import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileSafe } from "./files.js";

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cmssy-files-"));
  return join(dir, "nested", "f.txt");
}

describe("writeFileSafe", () => {
  it("writes a new file (creating dirs)", async () => {
    const f = await tmpFile();
    expect(await writeFileSafe(f, "a")).toBe("written");
  });

  it("reports unchanged for identical content", async () => {
    const f = await tmpFile();
    await writeFileSafe(f, "a");
    expect(await writeFileSafe(f, "a")).toBe("unchanged");
  });

  it("skips a differing file unless forced", async () => {
    const f = await tmpFile();
    await writeFileSafe(f, "a");
    expect(await writeFileSafe(f, "b")).toBe("skipped");
    expect(await writeFileSafe(f, "b", { force: true })).toBe("written");
  });
});
