import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_ROOT = path.resolve(__dirname, "../skills");

type SkillTarget = "claude";

interface SkillDefinition {
  /** Target name the user passes on the CLI. */
  target: SkillTarget;
  /** Human label for logs. */
  label: string;
  /** Source file inside src/skills/. */
  sourcePath: string;
  /** Destination filename inside the install dir. */
  destFilename: string;
  /** Resolve the install directory (global vs local). */
  resolveInstallDir: (opts: { local: boolean; cwd: string }) => string;
  /** Hint printed after successful install. */
  postInstallHint: (installPath: string) => string;
}

const SKILLS: Record<SkillTarget, SkillDefinition> = {
  claude: {
    target: "claude",
    label: "Claude Code",
    sourcePath: path.join(SKILLS_ROOT, "claude", "cmssy-block.md"),
    destFilename: "SKILL.md",
    resolveInstallDir: ({ local, cwd }) =>
      local
        ? path.join(cwd, ".claude", "skills", "cmssy-block")
        : path.join(os.homedir(), ".claude", "skills", "cmssy-block"),
    postInstallHint: (installPath) =>
      [
        chalk.gray("Next step:"),
        chalk.white(
          "  Restart Claude Code (or open a new session) so it picks up the skill.",
        ),
        chalk.gray("  Then ask it anything about cmssy blocks, e.g.:"),
        chalk.white('    "scaffold a pricing block and publish as patch"'),
        "",
        chalk.gray(`Installed at: ${installPath}`),
      ].join("\n"),
  },
};

interface SkillsInstallOptions {
  local?: boolean;
  force?: boolean;
  yes?: boolean;
}

export async function skillsInstallCommand(
  rawTarget: string | undefined,
  options: SkillsInstallOptions,
): Promise<void> {
  const target = (rawTarget ?? "claude").toLowerCase();

  if (!Object.hasOwn(SKILLS, target)) {
    console.error(
      chalk.red(`✖ Unknown skill target: ${rawTarget}`) +
        chalk.gray(`\n  Supported: ${Object.keys(SKILLS).join(", ")}`),
    );
    process.exit(1);
  }

  const skill = SKILLS[target as SkillTarget];

  if (!(await fs.pathExists(skill.sourcePath))) {
    console.error(
      chalk.red(`✖ Skill source missing: ${skill.sourcePath}`) +
        chalk.gray(
          "\n  This is a packaging bug - please report it at https://github.com/cmssy-io/cmssy-cli/issues",
        ),
    );
    process.exit(1);
  }

  const installDir = skill.resolveInstallDir({
    local: !!options.local,
    cwd: process.cwd(),
  });
  const installPath = path.join(installDir, skill.destFilename);
  const exists = await fs.pathExists(installPath);

  if (exists && !options.force) {
    if (options.yes) {
      console.error(
        chalk.red(`✖ ${installPath} already exists`) +
          chalk.gray("\n  Pass --force to overwrite."),
      );
      process.exit(1);
    }

    const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
      {
        type: "confirm",
        name: "overwrite",
        message: `${installPath} already exists. Overwrite?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow("⚠ Aborted. Nothing changed."));
      return;
    }
  }

  await fs.ensureDir(installDir);
  await fs.copy(skill.sourcePath, installPath, { overwrite: true });

  const scope = options.local ? "local (.claude/)" : "global (~/.claude/)";
  console.log(
    chalk.green(`✔ Installed ${skill.label} skill`) + chalk.gray(` → ${scope}`),
  );
  console.log();
  console.log(skill.postInstallHint(installPath));
  console.log();
}
