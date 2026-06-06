import chalk from "chalk";
import { buildClient } from "../utils/graphql.js";
import inquirer from "inquirer";
import ora from "ora";
import { loadConfig, saveConfig } from "../utils/config.js";

interface LinkOptions {
  apiUrl?: string;
  token?: string;
  workspace?: string;
}

interface Workspace {
  id: string;
  slug: string;
  name: string;
  myRole: { name: string; slug: string } | null;
}

const MY_WORKSPACES_QUERY = `
  query MyWorkspaces {
    myWorkspaces {
      id
      slug
      name
      myRole {
        name
        slug
      }
    }
  }
`;

export async function linkCommand(options: LinkOptions) {
  console.log(chalk.blue.bold("\n🔗 Cmssy - Link Workspace\n"));

  const existingConfig = loadConfig();

  // Step 1: Get API URL
  const apiUrl =
    options.apiUrl || existingConfig.apiUrl || "https://api.cmssy.io/graphql";

  // Step 2: Get API token
  let apiToken = options.token || existingConfig.apiToken || null;

  if (!apiToken) {
    const answer = await inquirer.prompt([
      {
        type: "password",
        name: "apiToken",
        message: "API Token (from Settings > API Tokens):",
        validate: (input) => {
          if (!input || input.length < 10) {
            return "Please enter a valid API token";
          }
          return true;
        },
      },
    ]);
    apiToken = answer.apiToken;
  }

  // Step 3: Validate token and fetch workspaces
  const spinner = ora("Connecting to Cmssy...").start();

  let workspaces: Workspace[];
  try {
    const client = buildClient(apiUrl, apiToken);

    const data: any = await client.request(MY_WORKSPACES_QUERY);
    workspaces = data.myWorkspaces || [];
    spinner.succeed("Connected");
  } catch (error: any) {
    spinner.fail("Connection failed");

    if (
      error.response?.errors?.some(
        (e: any) =>
          e.extensions?.code === "UNAUTHORIZED" ||
          e.extensions?.code === "UNAUTHENTICATED",
      )
    ) {
      console.error(
        chalk.red(
          "\n✖ Invalid token. Get a new one from Settings > API Tokens\n",
        ),
      );
    } else {
      console.error(chalk.red(`\n✖ ${error.message}\n`));
    }
    process.exit(1);
  }

  if (workspaces.length === 0) {
    console.error(
      chalk.yellow("\n⚠ No workspaces found. Create one at https://cmssy.io\n"),
    );
    process.exit(1);
  }

  // Step 4: Select workspace
  let selectedWorkspace: Workspace;

  if (options.workspace) {
    // Non-interactive mode (CI)
    const found = workspaces.find(
      (w) => w.id === options.workspace || w.slug === options.workspace,
    );
    if (!found) {
      console.error(
        chalk.red(`\n✖ Workspace "${options.workspace}" not found\n`),
      );
      console.log(chalk.gray("Available workspaces:"));
      workspaces.forEach((w) =>
        console.log(chalk.gray(`  ${w.name} (${w.id})`)),
      );
      process.exit(1);
    }
    selectedWorkspace = found;
  } else if (workspaces.length === 1) {
    // Auto-select if only one workspace
    selectedWorkspace = workspaces[0];
    console.log(
      chalk.gray(
        `\nAuto-selected: ${selectedWorkspace.name} (only workspace)\n`,
      ),
    );
  } else {
    // Interactive picker
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "workspaceId",
        message: "Select workspace:",
        choices: workspaces.map((w) => {
          const role = w.myRole?.name || "member";
          return {
            name: `${w.name} ${chalk.gray(`(${w.slug})`)} ${chalk.dim(`- ${role}`)}`,
            value: w.id,
          };
        }),
      },
    ]);
    selectedWorkspace = workspaces.find((w) => w.id === answer.workspaceId)!;
  }

  // Step 5: Save everything to .env
  saveConfig({
    apiUrl,
    apiToken,
    workspaceId: selectedWorkspace.id,
  });

  console.log(chalk.green.bold("\n✓ Linked to workspace\n"));
  console.log(chalk.white(`  Name: ${selectedWorkspace.name}`));
  console.log(chalk.white(`  Slug: ${selectedWorkspace.slug}`));
  console.log(chalk.white(`  ID:   ${selectedWorkspace.id}`));
  console.log(chalk.cyan("\nNext steps:\n"));
  console.log(chalk.white("  cmssy dev                  Start developing"));
  console.log(
    chalk.white("  cmssy build                Bundle blocks for production\n"),
  );
}
