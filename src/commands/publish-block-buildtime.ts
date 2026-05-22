import chalk from "chalk";
import fs from "fs-extra";
import ora from "ora";
import path from "path";
import { hasConfig, loadConfig } from "../utils/config.js";
import {
  createClient,
  PUBLISH_BLOCK_MUTATION,
  PUBLISH_JOB_FULL_QUERY,
  PUBLISH_JOB_STATUS_QUERY,
} from "../utils/graphql.js";
import {
  collectBlockSources,
  type CollectResult,
} from "../utils/source-collector.js";
import {
  extractDefaultContent,
  loadBlockConfig,
} from "../utils/block-config.js";
import { convertSchemaToFields } from "../utils/publish-helpers.js";
import type { FieldConfig } from "@cmssy/types";
import {
  resolveWorkspaceId,
  warnIfWorkspaceIdLooksWrong,
} from "../utils/resolve-workspace.js";
import {
  BLOCK_BUILD_STATUS,
  PUBLISH_JOB_STATUS,
  type PublishJob,
} from "../types/publish-job.js";

const BLOCK_TYPE_REGEX = /^[a-z][a-z0-9-]*$/;
const BLOCK_VERSION_REGEX = /^\d/;

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_MS = 10 * 60 * 1000;
const POLL_MAX_CONSECUTIVE_ERRORS = 5;

interface PublishBuildtimeOptions {
  workspace?: string | boolean;
  entry?: string;
  dryRun?: boolean;
}

export async function publishBlockBuildtimeCommand(
  blockName: string,
  options: PublishBuildtimeOptions,
): Promise<void> {
  console.log(chalk.blue.bold("\n📦 Cmssy - Publish (build pipeline)\n"));

  if (!hasConfig()) {
    console.error(chalk.red("✖ Not configured. Run: cmssy link\n"));
    process.exit(1);
  }
  const config = loadConfig();
  if (!config.apiToken) {
    console.error(
      chalk.red("✖ CMSSY_API_TOKEN missing in .env. Run: cmssy link\n"),
    );
    process.exit(1);
  }

  if (!BLOCK_TYPE_REGEX.test(blockName)) {
    console.error(
      chalk.red(
        `✖ Block name "${blockName}" must match /^[a-z][a-z0-9-]*$/ for the build pipeline (rejects path separators, traversal, uppercase)`,
      ),
    );
    process.exit(1);
  }

  const workspaceId = await resolveWorkspaceId(options.workspace, config);
  warnIfWorkspaceIdLooksWrong(workspaceId);

  const cwd = process.cwd();
  const blocksRoot = path.resolve(cwd, "blocks");
  const blockDir = path.resolve(blocksRoot, blockName);
  if (blockDir !== blocksRoot && !blockDir.startsWith(blocksRoot + path.sep)) {
    console.error(
      chalk.red(
        `✖ Block path "${blockDir}" escapes blocks/ root (refusing to read).`,
      ),
    );
    process.exit(1);
  }
  if (!(await fs.pathExists(blockDir))) {
    console.error(chalk.red(`✖ Block "${blockName}" not found at ${blockDir}`));
    process.exit(1);
  }

  const pkgPath = path.join(blockDir, "package.json");
  if (!(await fs.pathExists(pkgPath))) {
    console.error(
      chalk.red(`✖ ${pkgPath} not found - block must declare name+version`),
    );
    process.exit(1);
  }
  const pkg = (await fs.readJson(pkgPath)) as {
    name?: string;
    version?: string;
  };
  if (typeof pkg.version !== "string") {
    console.error(
      chalk.red(`✖ "version" field missing or not a string in ${pkgPath}`),
    );
    process.exit(1);
  }
  if (typeof pkg.name === "string" && pkg.name !== blockName) {
    console.log(
      chalk.yellow(
        `⚠ package.json name "${pkg.name}" differs from directory "${blockName}"; using directory name as block type.`,
      ),
    );
  }
  const blockType = blockName;
  const blockVersion = pkg.version;
  if (!BLOCK_VERSION_REGEX.test(blockVersion)) {
    console.error(
      chalk.red(
        `✖ Block version "${blockVersion}" must start with a digit (loose semver)`,
      ),
    );
    process.exit(1);
  }

  const spinnerCollect = ora(
    `Collecting source files from blocks/${blockName}/`,
  ).start();
  let collected: CollectResult;
  try {
    collected = await collectBlockSources({
      blockDir,
      entryRel: options.entry,
    });
    spinnerCollect.succeed(
      `Collected ${collected.files.length} source file(s) (entry: ${collected.entryPath})`,
    );
  } catch (err) {
    spinnerCollect.fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(
      chalk.cyan(
        `\nDry run - would publish ${blockType}@${blockVersion} (${collected.files.length} file(s)):`,
      ),
    );
    for (const f of collected.files) {
      console.log(`  ${f.relPath}`);
    }
    console.log(chalk.gray(`\nTarget API: ${config.apiUrl}`));
    console.log(chalk.gray(`Target workspace: ${workspaceId}\n`));
    return;
  }

  // Load config.ts for: (1) defaultContent for the backend smoke test,
  // (2) block metadata (name/schema/requires/...) that the resolver
  // upserts onto the workspace_block row before the build runs -
  // publish-block is self-sufficient since cmssy/cmssy#863, so without
  // this a freshly-published block would have no schema or name.
  // Deferred until after the dry-run short-circuit so the dry-run
  // preview never executes the block's config.ts (side effects).
  let defaultContent: Record<string, unknown> | null = null;
  let blockMetadata: Record<string, unknown> = {};
  try {
    const blockConfig = await loadBlockConfig(blockDir);
    if (blockConfig) {
      // publish-block handles blocks, not templates; the loaded config
      // is a BlockConfig. `useClient` isn't in the @cmssy/types
      // BlockConfig surface yet (CMS-593), so read the shape loosely.
      const cfg = blockConfig as {
        name?: string;
        description?: string;
        category?: string;
        layoutPosition?: string;
        requires?: unknown;
        useClient?: boolean;
        schema?: Record<string, FieldConfig>;
      };
      if (cfg.schema) {
        defaultContent = extractDefaultContent(cfg.schema);
      }
      // Only send fields that are actually defined - the resolver
      // treats an omitted field as "preserve" on a republish.
      blockMetadata = {
        ...(cfg.name !== undefined && { name: cfg.name }),
        ...(cfg.description !== undefined && {
          description: cfg.description,
        }),
        ...(cfg.category !== undefined && { category: cfg.category }),
        ...(cfg.layoutPosition !== undefined && {
          layoutPosition: cfg.layoutPosition,
        }),
        ...(cfg.requires !== undefined && { requires: cfg.requires }),
        ...(cfg.useClient !== undefined && { useClient: cfg.useClient }),
        ...(cfg.schema !== undefined && {
          schemaFields: convertSchemaToFields(cfg.schema),
        }),
      };
    }
  } catch {
    // Non-fatal - publish continues without defaultContent/metadata.
    // For an existing block the resolver preserves stored metadata; a
    // brand-new block with no config.ts is rejected backend-side with
    // a clear "a new block requires a non-empty name" error.
    defaultContent = null;
    blockMetadata = {};
  }

  const client = createClient();
  client.setHeader("x-workspace-id", workspaceId);

  const spinnerEnqueue = ora(
    `Enqueueing publish for ${blockType}@${blockVersion}`,
  ).start();
  let job: PublishJob;
  try {
    const data = await client.request<{ publishBlock: PublishJob }>(
      PUBLISH_BLOCK_MUTATION,
      {
        input: {
          blockType,
          blockVersion,
          entryPath: collected.entryPath,
          defaultContent,
          ...blockMetadata,
          files: collected.files.map((f) => ({
            path: f.relPath,
            contentBase64: f.contentBase64,
          })),
        },
      },
    );
    job = data.publishBlock;
    spinnerEnqueue.succeed(`Job queued: ${job.id}`);
  } catch (err) {
    spinnerEnqueue.fail(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let finalJob: PublishJob;
  try {
    finalJob = await pollJobUntilTerminal(client, job.id);
  } catch (err) {
    console.error(
      chalk.red(`✖ ${err instanceof Error ? err.message : String(err)}`),
    );
    process.exit(1);
  }

  try {
    const full = await client.request<{ publishJobStatus: PublishJob | null }>(
      PUBLISH_JOB_FULL_QUERY,
      { jobId: job.id },
    );
    if (full.publishJobStatus) finalJob = full.publishJobStatus;
  } catch {
    void 0;
  }

  printJobReport(finalJob);

  if (finalJob.status !== PUBLISH_JOB_STATUS.COMPLETED) {
    process.exit(1);
  }
}

async function pollJobUntilTerminal(
  client: ReturnType<typeof createClient>,
  jobId: string,
): Promise<PublishJob> {
  const spinner = ora("Building...").start();
  const start = Date.now();
  let last: PublishJob | null = null;
  let consecutiveErrors = 0;
  try {
    while (Date.now() - start < POLL_MAX_MS) {
      let res: { publishJobStatus: PublishJob | null } | null = null;
      try {
        res = await client.request<{ publishJobStatus: PublishJob | null }>(
          PUBLISH_JOB_STATUS_QUERY,
          { jobId },
        );
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= POLL_MAX_CONSECUTIVE_ERRORS) {
          spinner.fail(
            `Polling failed ${consecutiveErrors} times in a row; giving up.`,
          );
          throw err;
        }
        spinner.text = `Polling error ${consecutiveErrors}/${POLL_MAX_CONSECUTIVE_ERRORS} (will retry): ${
          err instanceof Error ? err.message : String(err)
        }`;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (!res.publishJobStatus) {
        spinner.fail(
          `Job ${jobId} not visible (workspace mismatch or job deleted).`,
        );
        throw new Error(
          `publishJobStatus returned null for job ${jobId} - check workspace context`,
        );
      }
      last = res.publishJobStatus;
      spinner.text = renderProgress(last);
      if (
        last.status === PUBLISH_JOB_STATUS.COMPLETED ||
        last.status === PUBLISH_JOB_STATUS.FAILED
      ) {
        if (last.status === PUBLISH_JOB_STATUS.COMPLETED) {
          spinner.succeed(`Job completed: ${jobId}`);
        } else {
          spinner.fail(`Job failed: ${jobId}`);
        }
        return last;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    const lastStatus = last?.status ?? "unknown";
    spinner.fail(
      `Polling timed out after ${Math.round(POLL_MAX_MS / 1000)}s (job ${jobId}, last status: ${lastStatus})`,
    );
    throw new Error(
      `publish job ${jobId} did not reach a terminal state within ${Math.round(POLL_MAX_MS / 1000)}s (last status: ${lastStatus}). Check the workspace publish jobs UI for progress.`,
    );
  } finally {
    if (spinner.isSpinning) spinner.stop();
  }
}

function renderProgress(job: PublishJob): string {
  const phases: string[] = [];
  const t = job.timings;
  if (t.spawnMs) phases.push(`spawn ${t.spawnMs}ms`);
  if (t.networkLockdownMs) phases.push(`netlock ${t.networkLockdownMs}ms`);
  if (t.pnpmInstallMs) phases.push(`pnpm ${t.pnpmInstallMs}ms`);
  if (t.snapshotMs) phases.push(`snap ${t.snapshotMs}ms`);
  const blockBits = job.blocks.map(
    (b) => `${b.type}=${b.status}${b.bundleMs ? `(${b.bundleMs}ms)` : ""}`,
  );
  return [
    `Status: ${job.status}`,
    phases.length ? phases.join(", ") : null,
    blockBits.join(", "),
  ]
    .filter(Boolean)
    .join(" | ");
}

function printJobReport(job: PublishJob): void {
  console.log("");
  if (job.error) {
    console.log(
      chalk.red(
        `✖ Fatal: ${job.error.code} (${job.error.stage}): ${job.error.message}`,
      ),
    );
  }
  for (const b of job.blocks) {
    const head = `${b.type}@${b.version}`;
    if (b.status === BLOCK_BUILD_STATUS.PUBLISHED) {
      const sizes = b.bundleSizes
        ? ` server=${b.bundleSizes.server}B client=${b.bundleSizes.client}B styles=${b.bundleSizes.styles}B`
        : "";
      console.log(chalk.green(`  ✔ ${head} - published${sizes}`));
      if (b.bundleUrls) {
        console.log(chalk.gray(`      server: ${b.bundleUrls.server}`));
        console.log(chalk.gray(`      client: ${b.bundleUrls.client}`));
        console.log(chalk.gray(`      styles: ${b.bundleUrls.styles}`));
      }
    } else {
      const reason = b.error
        ? `${b.error.code} (${b.error.stage}): ${b.error.message}`
        : b.status;
      console.log(chalk.red(`  ✖ ${head} - ${reason}`));
    }
  }
  const t = job.timings;
  const anyTiming =
    t.spawnMs != null ||
    t.networkLockdownMs != null ||
    t.pnpmInstallMs != null ||
    t.snapshotMs != null;
  if (anyTiming) {
    console.log(
      chalk.gray(
        `\nTimings: spawn=${t.spawnMs ?? 0}ms netlock=${t.networkLockdownMs ?? 0}ms pnpm=${t.pnpmInstallMs ?? 0}ms snap=${t.snapshotMs ?? 0}ms`,
      ),
    );
  }
  console.log("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
