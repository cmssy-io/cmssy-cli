/**
 * cmssy codegen - Generate TypeScript types from workspace public GraphQL schema.
 *
 * Thin wrapper over @graphql-codegen/cli. Generates codegen config pointing
 * to the workspace's public API, then runs codegen.
 */
import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import path from "path";
import { loadConfig } from "../utils/config.js";

export interface CodegenOptions {
  workspace?: string;
  output?: string;
  init?: boolean;
}

const DEFAULT_OUTPUT = "src/graphql/types.ts";
const CODEGEN_CONFIG_FILE = "codegen.ts";

function getWorkspaceApiUrl(apiUrl: string, workspaceSlug: string): string {
  // apiUrl = "https://api.cmssy.io/graphql" → base = "https://api.cmssy.io"
  const base = apiUrl.replace(/\/graphql$/, "");
  return `${base}/public/${workspaceSlug}/graphql`;
}

function generateCodegenConfig(schemaUrl: string, output: string): string {
  return `import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: ${JSON.stringify(schemaUrl)},
  generates: {
    ${JSON.stringify(output)}: {
      plugins: ["typescript", "typescript-operations"],
      config: {
        avoidOptionals: true,
        enumsAsTypes: true,
        immutableTypes: true,
      },
    },
  },
};

export default config;
`;
}

export async function codegenCommand(options: CodegenOptions) {
  const config = loadConfig();
  const output = options.output || DEFAULT_OUTPUT;

  // --init: generate a codegen.ts with a placeholder schema URL.
  // No --workspace required - the user can fill in the slug themselves
  // before running `cmssy codegen`. Keeps `cmssy codegen --init` working
  // on a fresh project before the user has run `cmssy link`.
  if (options.init) {
    const configPath = path.join(process.cwd(), CODEGEN_CONFIG_FILE);
    if (fs.existsSync(configPath)) {
      console.error(
        chalk.yellow(`⚠ ${CODEGEN_CONFIG_FILE} already exists. Skipping.`),
      );
    } else {
      const placeholderUrl = options.workspace
        ? getWorkspaceApiUrl(config.apiUrl, options.workspace)
        : getWorkspaceApiUrl(config.apiUrl, "<your-workspace-slug>");
      const configContent = generateCodegenConfig(placeholderUrl, output);
      fs.writeFileSync(configPath, configContent);
      console.warn(chalk.green(`✔ Created ${CODEGEN_CONFIG_FILE}`));
      if (!options.workspace) {
        console.warn(
          chalk.dim(
            `  Replace <your-workspace-slug> in ${CODEGEN_CONFIG_FILE} with your slug (see \`cmssy workspaces\`).`,
          ),
        );
      }
    }

    console.warn(
      chalk.dim(
        `\nInstall codegen dependencies:\n  npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations\n\nThen run:\n  cmssy codegen --workspace <slug>`,
      ),
    );
    return;
  }

  // The public schema URL is keyed by workspace *slug*, not ID. `cmssy link`
  // stores the workspace ObjectId in CMSSY_WORKSPACE_ID, so we can't use it
  // here without an extra API round-trip. Require --workspace explicitly
  // and tell the user exactly what's needed.
  const workspaceSlug = options.workspace;

  if (!workspaceSlug) {
    const hint = config.workspaceId
      ? chalk.gray(
          "\n  Tip: your .env has CMSSY_WORKSPACE_ID (an ID, not a slug). Pass the slug from `cmssy workspaces` via --workspace.",
        )
      : "";
    console.error(
      chalk.red(
        "✖ Missing workspace slug. Use: cmssy codegen --workspace <slug>",
      ) + hint,
    );
    process.exit(1);
  }

  const schemaUrl = getWorkspaceApiUrl(config.apiUrl, workspaceSlug);

  // Check if codegen.ts exists
  const configPath = path.join(process.cwd(), CODEGEN_CONFIG_FILE);
  const hasConfig = fs.existsSync(configPath);

  const spinner = ora(
    "Generating TypeScript types from workspace schema...",
  ).start();

  try {
    if (hasConfig) {
      // Use existing codegen.ts config
      const { execSync } = await import("child_process");
      execSync("npx graphql-codegen --config codegen.ts", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } else {
      // Run codegen inline without config file
      const { execSync } = await import("child_process");
      // Write a temporary codegen config, run, then delete
      const tempConfig = generateCodegenConfig(schemaUrl, output);
      const tempDir = fs.mkdtempSync(path.join(process.cwd(), ".codegen-"));
      const tempPath = path.join(tempDir, "codegen.ts");
      fs.writeFileSync(tempPath, tempConfig);

      try {
        execSync(`npx graphql-codegen --config "${tempPath}"`, {
          cwd: process.cwd(),
          stdio: "inherit",
        });
      } finally {
        fs.removeSync(tempDir);
      }
    }

    // Also download schema.graphql for reference
    const schemaDir = hasConfig
      ? path.dirname(path.join(process.cwd(), CODEGEN_CONFIG_FILE))
      : path.dirname(output);
    const schemaPath = path.join(schemaDir, "schema.graphql");
    fs.ensureDirSync(schemaDir);

    try {
      const { getIntrospectionQuery, buildClientSchema, printSchema } =
        await import("graphql");

      const response = await fetch(schemaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: getIntrospectionQuery() }),
      });

      if (response.ok) {
        const json = (await response.json()) as { data: unknown };
        const schema = buildClientSchema(
          json.data as Parameters<typeof buildClientSchema>[0],
        );
        fs.writeFileSync(schemaPath, printSchema(schema));
      }
    } catch {
      // Schema download is best-effort
    }

    spinner.succeed(chalk.green(`Types generated at ${chalk.bold(output)}`));

    if (fs.existsSync(schemaPath)) {
      console.warn(chalk.dim(`  Schema saved to ${schemaPath}`));
    }
  } catch (error) {
    spinner.fail(chalk.red("Failed to generate types"));

    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("graphql-codegen")) {
      console.error(
        chalk.yellow(
          "\nMissing dependencies. Install them:\n  npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations",
        ),
      );
    } else {
      console.error(chalk.red(msg));
    }
    process.exit(1);
  }
}
