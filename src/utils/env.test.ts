import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { setEnvVars } from "./env.js";

async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cmssy-env-"));
  return join(dir, ".env");
}

describe("setEnvVars", () => {
  it("appends keys to a new file", async () => {
    const f = await tmp();
    await setEnvVars(f, { A: "1", B: "2" });
    expect(await readFile(f, "utf8")).toBe("A=1\nB=2\n");
  });

  it("preserves unrelated keys and comments", async () => {
    const f = await tmp();
    await writeFile(f, "# top\nKEEP=yes\n");
    await setEnvVars(f, { NEW: "x" });
    const out = await readFile(f, "utf8");
    expect(out).toContain("# top");
    expect(out).toContain("KEEP=yes");
    expect(out).toContain("NEW=x");
  });

  it("does not overwrite an existing value unless forced", async () => {
    const f = await tmp();
    await writeFile(f, "K=old\n");
    await setEnvVars(f, { K: "new" });
    expect(await readFile(f, "utf8")).toBe("K=old\n");
    await setEnvVars(f, { K: "new" }, { overwrite: true });
    expect(await readFile(f, "utf8")).toBe("K=new\n");
  });

  it("fills an empty existing key without force", async () => {
    const f = await tmp();
    await writeFile(f, "K=\n");
    await setEnvVars(f, { K: "v" });
    expect(await readFile(f, "utf8")).toBe("K=v\n");
  });

  it("treats an inline-comment-only value as empty and keeps the comment", async () => {
    const f = await tmp();
    await writeFile(f, "K= # from settings\n");
    await setEnvVars(f, { K: "v" });
    expect(await readFile(f, "utf8")).toBe("K=v # from settings\n");
  });
});
