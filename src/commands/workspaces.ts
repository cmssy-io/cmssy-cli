import chalk from "chalk";
import { loadConfig } from "../utils/config.js";
import { GraphQLClient } from "graphql-request";

interface WorkspaceRole {
  name: string;
  slug: string;
}

interface Workspace {
  id: string;
  slug: string;
  name: string;
  myRole: WorkspaceRole | null;
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

export async function workspacesCommand() {
  const config = loadConfig();

  if (!config.apiToken) {
    console.error(
      chalk.red("✖ API token not configured. Run:") +
        chalk.white("\n  cmssy configure")
    );
    process.exit(1);
  }

  try {
    const client = new GraphQLClient(config.apiUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`,
      },
    });

    const data: any = await client.request(MY_WORKSPACES_QUERY);

    const workspaces: Workspace[] = data.myWorkspaces || [];

    if (workspaces.length === 0) {
      console.log(chalk.yellow("\n⚠ No workspaces found"));
      console.log(
        chalk.gray(
          "Create a workspace at https://cmssy.io or ask for an invitation"
        )
      );
      return;
    }

    console.log(chalk.blue(`\n📁 Your Workspaces (${workspaces.length}):\n`));

    for (const workspace of workspaces) {
      const roleName = workspace.myRole?.name || "member";
      const roleSlug = workspace.myRole?.slug || "member";
      const roleColor =
        roleSlug === "owner"
          ? chalk.green
          : roleSlug === "admin"
          ? chalk.blue
          : chalk.gray;

      console.log(chalk.white.bold(workspace.name));
      console.log(chalk.gray(`  Slug: ${workspace.slug}`));
      console.log(chalk.cyan(`  ID:   ${workspace.id}`));
      console.log(roleColor(`  Role: ${roleName}`));
      console.log();
    }

    console.log(chalk.gray("💡 Tip: Copy the ID above and add to .env:"));
    console.log(
      chalk.white(`   CMSSY_WORKSPACE_ID=${workspaces[0].id}`)
    );
    console.log();
  } catch (error: any) {
    console.error(chalk.red(`✖ Failed to fetch workspaces: ${error.message}`));

    if (error.response?.errors) {
      for (const err of error.response.errors) {
        console.error(chalk.red(`  - ${err.message}`));
      }
    }

    process.exit(1);
  }
}
