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
  schema: "${schemaUrl}",
  generates: {
    "${output}": {
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

  // Resolve workspace
  const workspaceSlug = options.workspace || config.workspaceId;

  if (!workspaceSlug) {
    console.error(
      chalk.red(
        "✖ No workspace specified. Use --workspace <slug> or set CMSSY_WORKSPACE_ID in .env",
      ),
    );
    process.exit(1);
  }

  const schemaUrl = getWorkspaceApiUrl(config.apiUrl, workspaceSlug);
  const output = options.output || DEFAULT_OUTPUT;

  // --init: generate codegen.ts config file
  if (options.init) {
    const configPath = path.join(process.cwd(), CODEGEN_CONFIG_FILE);
    if (fs.existsSync(configPath)) {
      console.error(
        chalk.yellow(`⚠ ${CODEGEN_CONFIG_FILE} already exists. Skipping.`),
      );
    } else {
      const configContent = generateCodegenConfig(schemaUrl, output);
      fs.writeFileSync(configPath, configContent);
      console.warn(chalk.green(`✔ Created ${CODEGEN_CONFIG_FILE}`));
    }

    console.warn(
      chalk.dim(
        `\nInstall codegen dependencies:\n  npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations\n\nThen run:\n  cmssy codegen`,
      ),
    );
    return;
  }

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
        stdio: "pipe",
      });
    } else {
      // Run codegen inline without config file
      const { execSync } = await import("child_process");
      const cmd = [
        "npx graphql-codegen",
        `--schema "${schemaUrl}"`,
        "--require ts-node/register",
        `--generates "${output}"`,
      ].join(" ");

      // Write a temporary codegen.ts, run, then delete
      const tempConfig = generateCodegenConfig(schemaUrl, output);
      const tempPath = path.join(process.cwd(), ".codegen.tmp.ts");
      fs.writeFileSync(tempPath, tempConfig);

      try {
        execSync(`npx graphql-codegen --config .codegen.tmp.ts`, {
          cwd: process.cwd(),
          stdio: "pipe",
        });
      } finally {
        fs.removeSync(tempPath);
      }
    }

    // Also download schema.graphql for reference
    const schemaDir = path.dirname(output);
    const schemaPath = path.join(schemaDir, "schema.graphql");
    fs.ensureDirSync(schemaDir);

    try {
      const response = await fetch(schemaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ __schema { types { name } } }",
          operationName: "IntrospectionQuery",
        }),
      });

      if (response.ok) {
        // Fetch SDL via introspection
        const sdlResponse = await fetch(schemaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query:
              "query { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }",
          }),
        });

        if (sdlResponse.ok) {
          const { buildClientSchema, printSchema } = await import("graphql");
          const json = (await sdlResponse.json()) as { data: unknown };
          const schema = buildClientSchema(
            json.data as Parameters<typeof buildClientSchema>[0],
          );
          fs.writeFileSync(schemaPath, printSchema(schema));
        }
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
