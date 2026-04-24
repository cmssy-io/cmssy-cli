import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_ROOT = path.resolve(__dirname, "../skills");

type EditorTarget = "claude";

const EDITOR_TARGETS: readonly EditorTarget[] = ["claude"] as const;

type SkillName = "block" | "mcp-content";

interface SkillDefinition {
  /** Short name passed as the positional argument (e.g. "block"). */
  name: SkillName;
  /** Human-readable label for logs. */
  label: string;
  /** Filename inside `src/skills/<editor>/`. */
  sourceBasename: string;
  /** Directory name created under the editor's skills directory. */
  destDir: string;
  /** Example prompt a user could paste into their editor after install. */
  examplePrompt: string;
}

const SKILLS: Record<SkillName, SkillDefinition> = {
  block: {
    name: "block",
    label: "Block dev (CLI + defineBlock/defineTemplate workflow)",
    sourceBasename: "cmssy-block.md",
    destDir: "cmssy-block",
    examplePrompt: "scaffold a pricing block and publish as patch",
  },
  "mcp-content": {
    name: "mcp-content",
    label: "Content editing via @cmssy/mcp-server",
    sourceBasename: "cmssy-mcp-content.md",
    destDir: "cmssy-mcp-content",
    examplePrompt:
      "add a new testimonials block to the homepage, in English and Polish",
  },
};

interface SkillsInstallOptions {
  local?: boolean;
  force?: boolean;
  yes?: boolean;
  all?: boolean;
  target?: string;
}

function resolveEditorTarget(raw: string | undefined): EditorTarget {
  const target = (raw ?? "claude").trim().toLowerCase();
  if (!(EDITOR_TARGETS as readonly string[]).includes(target)) {
    console.error(
      chalk.red(`✖ Unknown editor target: ${raw}`) +
        chalk.gray(`\n  Supported: ${EDITOR_TARGETS.join(", ")}`),
    );
    process.exit(1);
  }
  return target as EditorTarget;
}

function resolveSourcePath(
  editor: EditorTarget,
  skill: SkillDefinition,
): string {
  return path.join(SKILLS_ROOT, editor, skill.sourceBasename);
}

function resolveInstallDir(
  editor: EditorTarget,
  skill: SkillDefinition,
  opts: { local: boolean; cwd: string },
): string {
  // Editor-specific layout. Today only `claude`, whose layout is:
  //   ~/.claude/skills/<destDir>/SKILL.md   (global)
  //   <cwd>/.claude/skills/<destDir>/SKILL.md  (local)
  if (editor === "claude") {
    const root = opts.local ? opts.cwd : os.homedir();
    return path.join(root, ".claude", "skills", skill.destDir);
  }
  // Fallback (unreachable today, keeps TS happy for future targets)
  throw new Error(`Unsupported editor target: ${editor}`);
}

function postInstallHint(
  editor: EditorTarget,
  skill: SkillDefinition,
  installPath: string,
): string {
  if (editor === "claude") {
    return [
      chalk.gray("Next step:"),
      chalk.white(
        "  Restart Claude Code (or open a new session) so it picks up the skill.",
      ),
      chalk.gray("  Then try something like:"),
      chalk.white(`    "${skill.examplePrompt}"`),
      "",
      chalk.gray(`Installed at: ${installPath}`),
    ].join("\n");
  }
  return chalk.gray(`Installed at: ${installPath}`);
}

async function installOne(
  skill: SkillDefinition,
  editor: EditorTarget,
  options: SkillsInstallOptions,
): Promise<"installed" | "skipped"> {
  const sourcePath = resolveSourcePath(editor, skill);

  if (!(await fs.pathExists(sourcePath))) {
    console.error(
      chalk.red(`✖ Skill source missing: ${sourcePath}`) +
        chalk.gray(
          "\n  This is a packaging bug - please report it at https://github.com/cmssy-io/cmssy-cli/issues",
        ),
    );
    process.exit(1);
  }

  const installDir = resolveInstallDir(editor, skill, {
    local: !!options.local,
    cwd: process.cwd(),
  });
  const installPath = path.join(installDir, "SKILL.md");
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
      console.log(
        chalk.yellow(`⚠ Skipped ${skill.name} - ${installPath} unchanged.`),
      );
      return "skipped";
    }
  }

  await fs.ensureDir(installDir);
  await fs.copy(sourcePath, installPath, { overwrite: true });

  const scope = options.local ? "local (.claude/)" : "global (~/.claude/)";
  console.log(
    chalk.green(`✔ Installed ${skill.label} skill`) + chalk.gray(` → ${scope}`),
  );
  console.log();
  console.log(postInstallHint(editor, skill, installPath));
  console.log();

  return "installed";
}

export async function skillsInstallCommand(
  rawSkill: string | undefined,
  options: SkillsInstallOptions,
): Promise<void> {
  const editor = resolveEditorTarget(options.target);

  // Normalize once - whitespace-only or empty input is treated as "no skill"
  // so `cmssy skills install "   "` behaves like `cmssy skills install`.
  const skill = rawSkill?.trim().toLowerCase() || undefined;

  // Friendly error if user passes an editor name where a skill name is expected
  // (covers the pre-0.14.0 `cmssy skills install claude` shape).
  if (skill && (EDITOR_TARGETS as readonly string[]).includes(skill)) {
    console.error(
      chalk.red(`✖ "${rawSkill}" is an editor target, not a skill name.`) +
        chalk.gray(
          `\n  The first positional argument is now the skill name (e.g. "block", "mcp-content").`,
        ) +
        chalk.gray(
          `\n  Pass editor with --target, e.g.: cmssy skills install block --target ${skill}`,
        ),
    );
    process.exit(1);
  }

  if (options.all) {
    if (skill) {
      console.error(
        chalk.red(`✖ Cannot combine --all with a skill name.`) +
          chalk.gray("\n  Either pass a skill name or use --all, not both."),
      );
      process.exit(1);
    }

    for (const entry of Object.values(SKILLS)) {
      await installOne(entry, editor, options);
    }
    return;
  }

  let skillName: SkillName;

  if (skill) {
    if (!Object.hasOwn(SKILLS, skill)) {
      console.error(
        chalk.red(`✖ Unknown skill: ${rawSkill}`) +
          chalk.gray(
            `\n  Available skills: ${Object.keys(SKILLS).join(", ")}`,
          ) +
          chalk.gray(`\n  Run 'cmssy skills list' to see all skills.`),
      );
      process.exit(1);
    }
    skillName = skill as SkillName;
  } else {
    // No skill passed (or whitespace-only) → interactive prompt (unless -y)
    if (options.yes) {
      console.error(
        chalk.red(`✖ No skill specified.`) +
          chalk.gray(
            `\n  Pass a skill name (e.g. 'block', 'mcp-content') or use --all.`,
          ) +
          chalk.gray(`\n  Run 'cmssy skills list' to see all skills.`),
      );
      process.exit(1);
    }

    const { chosen } = await inquirer.prompt<{ chosen: SkillName }>([
      {
        type: "list",
        name: "chosen",
        message: "Which skill to install?",
        choices: Object.values(SKILLS).map((s) => ({
          name: `${s.name} - ${s.label}`,
          value: s.name,
        })),
      },
    ]);
    skillName = chosen;
  }

  await installOne(SKILLS[skillName], editor, options);
}

export function skillsListCommand(): void {
  console.log();
  console.log(chalk.bold("Available skills:"));
  console.log();

  const padName = Math.max(...Object.values(SKILLS).map((s) => s.name.length));

  for (const skill of Object.values(SKILLS)) {
    console.log(`  ${chalk.cyan(skill.name.padEnd(padName))}  ${skill.label}`);
  }

  console.log();
  console.log(
    chalk.gray(`Supported editor targets: ${EDITOR_TARGETS.join(", ")}`),
  );
  console.log();
  console.log(chalk.gray("Install with:"));
  console.log(chalk.white("  cmssy skills install <skill>"));
  console.log(chalk.white("  cmssy skills install --all"));
  console.log();
}
