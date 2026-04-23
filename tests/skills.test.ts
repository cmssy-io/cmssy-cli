import fs from "fs-extra";
import inquirer from "inquirer";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { skillsInstallCommand } from "../src/commands/skills.js";

describe("skills install", () => {
  let tmpDir: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmssy-skills-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit(${code})`);
      });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.removeSync(tmpDir);
    exitSpy.mockRestore();
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

  it("rejects Object.prototype keys (prototype pollution)", async () => {
    await expect(
      skillsInstallCommand("constructor", { local: true }),
    ).rejects.toThrow("process.exit(1)");
    await expect(
      skillsInstallCommand("toString", { local: true }),
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

  it("trims whitespace around target name", async () => {
    await skillsInstallCommand("  claude  ", { local: true });

    const installed = path.join(
      tmpDir,
      ".claude",
      "skills",
      "cmssy-block",
      "SKILL.md",
    );
    expect(fs.existsSync(installed)).toBe(true);
  });

  it("aborts interactive overwrite without touching existing SKILL.md", async () => {
    await skillsInstallCommand("claude", { local: true });

    const installed = path.join(
      tmpDir,
      ".claude",
      "skills",
      "cmssy-block",
      "SKILL.md",
    );
    fs.writeFileSync(installed, "user-modified-content");

    const promptSpy = vi
      .spyOn(inquirer, "prompt")
      .mockResolvedValue({ overwrite: false } as never);

    await skillsInstallCommand("claude", { local: true });

    expect(promptSpy).toHaveBeenCalledOnce();
    expect(fs.readFileSync(installed, "utf8")).toBe("user-modified-content");

    promptSpy.mockRestore();
  });
});
