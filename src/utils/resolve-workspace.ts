import chalk from "chalk";
import inquirer from "inquirer";

const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/;

export interface WorkspaceResolveSource {
  workspaceId?: string | null;
}

export async function resolveWorkspaceId(
  optsValue: string | boolean | undefined,
  config: WorkspaceResolveSource,
): Promise<string> {
  if (typeof optsValue === "string") {
    const trimmed = optsValue.trim();
    if (trimmed.length > 0) return trimmed;
  }
  const fromEnv = config.workspaceId?.trim();
  if (fromEnv) {
    console.log(chalk.gray(`Using workspace ID from .env: ${fromEnv}`));
    return fromEnv;
  }
  const answer = await inquirer.prompt<{ workspaceId: string }>([
    {
      type: "input",
      name: "workspaceId",
      message: "Enter Workspace ID:",
      validate: (v) =>
        v.trim().length > 0
          ? true
          : "Workspace ID is required (or set CMSSY_WORKSPACE_ID)",
    },
  ]);
  return answer.workspaceId.trim();
}

export function warnIfWorkspaceIdLooksWrong(workspaceId: string): void {
  if (!OBJECT_ID_REGEX.test(workspaceId)) {
    console.log(
      chalk.yellow(
        `⚠ workspace id "${workspaceId}" does not look like a 24-char hex ObjectId; backend will reject it.`,
      ),
    );
  }
}
