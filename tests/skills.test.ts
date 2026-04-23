import fs from "fs-extra";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { skillsInstallCommand } from "../src/commands/skills.js";

describe("skills install", () => {
  let tmpDir: string;
  let originalCwd: string;
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmssy-skills-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.removeSync(tmpDir);
    exitSpy.mockClear();
  });

  it("installs the claude skill into ./.claude/skills when --local", async () => {
    await skillsInstallCommand("claude", { local: true });

    const installed = path.join(
      tmpDir,
      ".claude",
      "skills",
      "cmssy-block",
      "SKILL.md",
    );
    expect(fs.existsSync(installed)).toBe(true);
    expect(fs.readFileSync(installed, "utf8")).toContain("name: cmssy-block");
  });

  it("defaults to claude when target is omitted", async () => {
    await skillsInstallCommand(undefined, { local: true });

    const installed = path.join(
      tmpDir,
      ".claude",
      "skills",
      "cmssy-block",
      "SKILL.md",
    );
    expect(fs.existsSync(installed)).toBe(true);
  });

  it("rejects unknown targets", async () => {
    await expect(
      skillsInstallCommand("vscode", { local: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("fails non-interactively when file exists and -y is passed", async () => {
    await skillsInstallCommand("claude", { local: true });

    await expect(
      skillsInstallCommand("claude", { local: true, yes: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("overwrites when --force is passed", async () => {
    await skillsInstallCommand("claude", { local: true });

    const installed = path.join(
      tmpDir,
      ".claude",
      "skills",
      "cmssy-block",
      "SKILL.md",
    );
    fs.writeFileSync(installed, "tampered");

    await skillsInstallCommand("claude", { local: true, force: true });

    expect(fs.readFileSync(installed, "utf8")).toContain("name: cmssy-block");
  });
});
