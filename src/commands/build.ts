import chalk from "chalk";
import ora from "ora";
import path from "path";
import { loadConfig } from "../utils/cmssy-config.js";
import { scanResources } from "../utils/scanner.js";
import { buildResource } from "../utils/builder.js";
import { updateBlockInCache } from "../utils/blocks-meta-cache.js";
import { getFieldTypes } from "../utils/field-schema.js";

interface BuildOptions {
  framework?: string;
  block?: string[];
}

export async function buildCommand(options: BuildOptions) {
  const spinner = ora("Starting build...").start();

  try {
    const config = await loadConfig();
    const framework = options.framework || config.framework;

    // Scan for blocks and templates (strict mode - throw errors)
    // If --block is provided, only scan those specific blocks
    const resources = await scanResources({
      strict: true,
      loadConfig: true,
      validateSchema: true,
      loadPreview: false,
      requirePackageJson: true,
      names: options.block,
    });

    // If --block was provided but no matches found, show available blocks
    if (options.block && options.block.length > 0 && resources.length === 0) {
      spinner.fail(`No matching blocks found: ${options.block.join(", ")}`);
      // Quick scan to list available blocks (minimal, no validation)
      const allResources = await scanResources({
        strict: false,
        loadConfig: false,
        validateSchema: false,
        loadPreview: false,
        requirePackageJson: false,
      });
      console.log(chalk.yellow("\nAvailable blocks/templates:"));
      allResources.forEach((r) => console.log(`  - ${r.name}`));
      process.exit(1);
    }

    if (resources.length === 0) {
      spinner.warn("No blocks or templates found");
      process.exit(0);
    }

    spinner.text = `Building ${resources.length} resources...`;

    const outDir = path.join(process.cwd(), config.build?.outDir || "public");

    // Fetch field types from backend (used for type generation)
    const fieldTypes = await getFieldTypes();

    // Build in parallel with concurrency limit
    const CONCURRENCY = 8;
    const buildOptions = {
      framework,
      minify: config.build?.minify ?? true,
      sourcemap: config.build?.sourcemap ?? true,
      outputMode: "versioned" as const,
      generatePackageJson: true,
      generateTypes: true,
      strict: true,
      fieldTypes,
    };

    const results: { resource: typeof resources[0]; success: boolean; error?: any }[] = [];

    // Process in batches for controlled parallelism
    for (let i = 0; i < resources.length; i += CONCURRENCY) {
      const batch = resources.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (resource) => {
          try {
            await buildResource(resource, outDir, buildOptions);
            return { resource, success: true };
          } catch (error) {
            return { resource, success: false, error };
          }
        })
      );
      results.push(...batchResults);
    }

    // Log results and update cache
    let successCount = 0;
    let errorCount = 0;
    for (const { resource, success, error } of results) {
      if (success) {
        successCount++;
        console.log(
          chalk.green(
            `  ✓ ${resource.packageJson.name}@${resource.packageJson.version}`
          )
        );

        // Update metadata cache with fresh data
        if (resource.blockConfig) {
          updateBlockInCache(
            resource.name,
            resource.type,
            resource.blockConfig,
            resource.packageJson?.version
          );
        }
      } else {
        errorCount++;
        console.error(chalk.red(`  ✖ ${resource.name}:`), error);
      }
    }

    if (errorCount === 0) {
      spinner.succeed(`Build complete! ${successCount} resources built`);
      console.log(chalk.cyan(`\nOutput directory: ${outDir}\n`));
    } else {
      spinner.warn(
        `Build completed with errors: ${successCount} succeeded, ${errorCount} failed`
      );
    }
  } catch (error) {
    spinner.fail("Build failed");
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}
