import fs from "fs-extra";
import inquirer from "inquirer";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  skillsInstallCommand,
  skillsListCommand,
} from "../src/commands/skills.js";

describe("skills install", () => {
  let tmpDir: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  const blockSkillPath = () =>
    path.join(tmpDir, ".claude", "skills", "cmssy-block", "SKILL.md");
  const mcpSkillPath = () =>
    path.join(tmpDir, ".claude", "skills", "cmssy-mcp-content", "SKILL.md");

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

  it("installs the block skill into ./.claude/skills when --local", async () => {
    await skillsInstallCommand("block", { local: true });

    expect(fs.existsSync(blockSkillPath())).toBe(true);
    expect(fs.readFileSync(blockSkillPath(), "utf8")).toContain(
      "name: cmssy-block",
    );
    expect(fs.existsSync(mcpSkillPath())).toBe(false);
  });

  it("installs the mcp-content skill when requested", async () => {
    await skillsInstallCommand("mcp-content", { local: true });

    expect(fs.existsSync(mcpSkillPath())).toBe(true);
    expect(fs.readFileSync(mcpSkillPath(), "utf8")).toContain(
      "name: cmssy-mcp-content",
    );
    expect(fs.existsSync(blockSkillPath())).toBe(false);
  });

  it("installs every skill when --all is passed", async () => {
    await skillsInstallCommand(undefined, { local: true, all: true });

    expect(fs.existsSync(blockSkillPath())).toBe(true);
    expect(fs.existsSync(mcpSkillPath())).toBe(true);
  });

  it("trims whitespace around skill name", async () => {
    await skillsInstallCommand("  block  ", { local: true });

    expect(fs.existsSync(blockSkillPath())).toBe(true);
  });

  it("rejects unknown skill names", async () => {
    await expect(
      skillsInstallCommand("foobar", { local: true }),
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

  it("rejects unknown editor targets via --target", async () => {
    await expect(
      skillsInstallCommand("block", { local: true, target: "vscode" }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("rejects the pre-0.14 syntax (editor name as positional arg)", async () => {
    await expect(
      skillsInstallCommand("claude", { local: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("rejects --all combined with a skill name", async () => {
    await expect(
      skillsInstallCommand("block", { local: true, all: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("rejects omitted skill name in non-interactive mode (-y)", async () => {
    await expect(
      skillsInstallCommand(undefined, { local: true, yes: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("treats whitespace-only skill name as omitted (fails with -y)", async () => {
    await expect(
      skillsInstallCommand("   ", { local: true, yes: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("treats whitespace-only skill name as omitted (interactive prompt)", async () => {
    const promptSpy = vi
      .spyOn(inquirer, "prompt")
      .mockResolvedValue({ chosen: "block" } as never);

    await skillsInstallCommand("  \t  ", { local: true });

    expect(promptSpy).toHaveBeenCalledOnce();
    expect(fs.existsSync(blockSkillPath())).toBe(true);

    promptSpy.mockRestore();
  });

  it("allows --all with whitespace-only skill name", async () => {
    await skillsInstallCommand("   ", { local: true, all: true });

    expect(fs.existsSync(blockSkillPath())).toBe(true);
    expect(fs.existsSync(mcpSkillPath())).toBe(true);
  });

  it("fails non-interactively when file exists and -y is passed", async () => {
    await skillsInstallCommand("block", { local: true });

    await expect(
      skillsInstallCommand("block", { local: true, yes: true }),
    ).rejects.toThrow("process.exit(1)");
  });

  it("overwrites when --force is passed", async () => {
    await skillsInstallCommand("block", { local: true });
    fs.writeFileSync(blockSkillPath(), "tampered");

    await skillsInstallCommand("block", { local: true, force: true });

    expect(fs.readFileSync(blockSkillPath(), "utf8")).toContain(
      "name: cmssy-block",
    );
  });

  it("aborts interactive overwrite without touching existing SKILL.md", async () => {
    await skillsInstallCommand("block", { local: true });
    fs.writeFileSync(blockSkillPath(), "user-modified-content");

    const promptSpy = vi
      .spyOn(inquirer, "prompt")
      .mockResolvedValue({ overwrite: false } as never);

    await skillsInstallCommand("block", { local: true });

    expect(promptSpy).toHaveBeenCalledOnce();
    expect(fs.readFileSync(blockSkillPath(), "utf8")).toBe(
      "user-modified-content",
    );

    promptSpy.mockRestore();
  });

  it("uses interactive prompt to pick a skill when none is given", async () => {
    const promptSpy = vi
      .spyOn(inquirer, "prompt")
      .mockResolvedValue({ chosen: "mcp-content" } as never);

    await skillsInstallCommand(undefined, { local: true });

    expect(promptSpy).toHaveBeenCalledOnce();
    expect(fs.existsSync(mcpSkillPath())).toBe(true);
    expect(fs.existsSync(blockSkillPath())).toBe(false);

    promptSpy.mockRestore();
  });
});

describe("skills list", () => {
  it("prints every available skill", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    skillsListCommand();

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("block");
    expect(output).toContain("mcp-content");
    expect(output).toContain("Block dev");
    expect(output).toContain("Content editing");
    expect(output).toContain("cmssy skills install");

    logSpy.mockRestore();
  });
});
