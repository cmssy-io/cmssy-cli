import chalk from "chalk";
import fs from "fs-extra";
import { GraphQLClient } from "graphql-request";
import path from "path";
import semver from "semver";
import { hasConfig, loadConfig } from "../utils/config.js";
import {
  IMPORT_TEMPLATE_MUTATION,
  type ImportTemplateResponse,
} from "../utils/graphql.js";
import {
  convertBlockTypeToSimple,
  convertConfigToPagesData,
  loadTemplateConfig,
} from "../utils/publish-helpers.js";
import {
  resolveWorkspaceId,
  warnIfWorkspaceIdLooksWrong,
} from "../utils/resolve-workspace.js";

interface PublishTemplateOptions {
  workspace?: string | boolean;
  patch?: boolean;
  minor?: boolean;
  major?: boolean;
  noBump?: boolean;
  dryRun?: boolean;
  overwriteContent?: boolean;
}

const REQUEST_TIMEOUT_MS = 180_000;

/**
 * Templates are declarative - no sandbox build needed. Reads
 * `templates/<name>/config.ts` + `pages.json` + `preview.json` and
 * uploads via the existing `IMPORT_TEMPLATE_MUTATION`. The mutation
 * triggers cache revalidation backend-side (CMS-604/CMS-843), so the
 * public site picks up the new template without manual intervention.
 *
 * Mirrors `publish-block` UX (same option flags, same workspace
 * resolution) so users can mentally swap `block` ↔ `template` without
 * relearning the command.
 */
export async function publishTemplateCommand(
  templateName: string,
  options: PublishTemplateOptions,
): Promise<void> {
  console.log(chalk.blue.bold("\n📄 Cmssy - Publish Template\n"));

  if (!hasConfig()) {
    console.error(chalk.red("✖ Not configured. Run: cmssy link\n"));
    process.exit(1);
  }
  const config = loadConfig();
  if (!config.apiToken) {
    console.error(
      chalk.red("✖ Missing CMSSY_API_TOKEN. Run: cmssy link --token <token>\n"),
    );
    process.exit(1);
  }

  const apiUrl = config.apiUrl ?? "https://api.cmssy.io/graphql";

  const workspaceId = await resolveWorkspaceId(options.workspace, config);
  warnIfWorkspaceIdLooksWrong(workspaceId);

  // Resolve template dir
  const templatesDir = path.join(process.cwd(), "templates");
  const templatePath = path.join(templatesDir, templateName);
  if (
    !fs.existsSync(templatePath) ||
    !fs.statSync(templatePath).isDirectory()
  ) {
    console.error(
      chalk.red(`✖ Template not found: templates/${templateName}/\n`),
    );
    process.exit(1);
  }

  // Read package.json (for version bumping)
  const pkgJsonPath = path.join(templatePath, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    console.error(
      chalk.red(
        `✖ Missing templates/${templateName}/package.json - run \`cmssy create template ${templateName}\` to scaffold.\n`,
      ),
    );
    process.exit(1);
  }
  const packageJson = fs.readJsonSync(pkgJsonPath);

  // Load template config (defineTemplate metadata)
  const templateConfig = loadTemplateConfig(templatePath, process.cwd());
  if (!templateConfig) {
    console.error(
      chalk.red(
        `✖ Missing templates/${templateName}/config.ts - templates require a defineTemplate() config.\n`,
      ),
    );
    process.exit(1);
  }

  // Resolve pages data: prefer pages.json on disk, fall back to
  // config.ts's `pages` array (defineTemplate inline form).
  const pagesJsonPath = path.join(templatePath, "pages.json");
  let pagesData: { layoutPositions?: any; pages?: any[]; pageTypes?: any[] };
  if (fs.existsSync(pagesJsonPath)) {
    pagesData = fs.readJsonSync(pagesJsonPath);
  } else if (templateConfig.pages || templateConfig.layoutPositions) {
    pagesData = convertConfigToPagesData(templateConfig);
  } else {
    console.error(
      chalk.red(
        `✖ Template has no pages - add a templates/${templateName}/pages.json or define pages in config.ts.\n`,
      ),
    );
    process.exit(1);
  }

  // Bump version unless --no-bump
  const currentVersion = packageJson.version ?? "0.0.0";
  let nextVersion = currentVersion;
  if (!options.noBump) {
    const bumpType = options.major
      ? "major"
      : options.minor
        ? "minor"
        : options.patch
          ? "patch"
          : "patch"; // default to patch when no flag
    nextVersion = semver.inc(currentVersion, bumpType) ?? currentVersion;
  }

  // Build IMPORT_TEMPLATE_MUTATION input. Pages get their slug
  // normalized and block types collapsed to short form so the backend
  // resolves them against `workspace_blocks.blockType`.
  const pages = (pagesData.pages ?? []).map((page: any) => {
    const slug =
      page.slug === "/" ? "/" : String(page.slug).replace(/^\/+/, "");
    const result: Record<string, any> = {
      name: page.name,
      slug,
      blocks: (page.blocks ?? []).map((block: any) => ({
        type: convertBlockTypeToSimple(block.type),
        content: block.content ?? {},
      })),
    };
    if (page.pageType) result.pageType = page.pageType;
    if (page.parentSlug)
      result.parentSlug = String(page.parentSlug).replace(/^\/+/, "");
    if (page.layoutPositions) {
      const lpEntries = Array.isArray(page.layoutPositions)
        ? page.layoutPositions.map((lp: any) => [lp.position, lp])
        : Object.entries(page.layoutPositions);
      result.layoutPositions = lpEntries.map(
        ([position, data]: [string, any]) => ({
          position,
          type: convertBlockTypeToSimple(data.type),
          content: data.content ?? {},
        }),
      );
    }
    return result;
  });

  const rawLayoutPositions = pagesData.layoutPositions ?? {};
  const layoutEntries: [string, any][] = Array.isArray(rawLayoutPositions)
    ? rawLayoutPositions.map((lp: any) => [lp.position, lp])
    : Object.entries(rawLayoutPositions);
  const layoutPositions = layoutEntries.map(([position, data]) => ({
    position,
    type: convertBlockTypeToSimple(data.type),
    content: data.content ?? {},
  }));

  // Required block types - union of all per-page + global layout positions.
  const requiredBlockTypes = new Set<string>();
  for (const page of pages) {
    for (const block of page.blocks) requiredBlockTypes.add(block.type);
    if (page.layoutPositions) {
      for (const lp of page.layoutPositions) requiredBlockTypes.add(lp.type);
    }
  }
  for (const lp of layoutPositions) requiredBlockTypes.add(lp.type);

  // Fields mirror ImportTemplateInput in backend
  // (apps/backend/src/graphql/resolvers/workspace-template.ts:154). `tags`,
  // `previewImageUrl`, and freeform metadata aren't on the input - we
  // ship only what the schema accepts; the rest is consumed locally
  // (e.g. `tags` is used for `cmssy publish --marketplace` flow only).
  const input: Record<string, any> = {
    blockType: convertBlockTypeToSimple(packageJson.name ?? templateName),
    name: templateConfig.name ?? templateName,
    description: templateConfig.description ?? "",
    category: templateConfig.category ?? "website",
    version: nextVersion,
    pages,
    layoutPositions,
    requiredBlocks: Array.from(requiredBlockTypes),
    // Default backend behavior preserves existing page content on
    // republish; --overwrite-content flips it to overwrite.
    preserveContent: !options.overwriteContent,
  };

  if (Array.isArray(pagesData.pageTypes) && pagesData.pageTypes.length > 0) {
    input.pageTypes = pagesData.pageTypes;
  }

  // Dry run: print the plan and exit
  console.log(chalk.gray(`Template:    `) + chalk.white(templateName));
  console.log(
    chalk.gray(`Version:     `) +
      chalk.white(`${currentVersion} → ${nextVersion}`),
  );
  console.log(chalk.gray(`Workspace:   `) + chalk.white(workspaceId));
  console.log(chalk.gray(`Pages:       `) + chalk.white(String(pages.length)));
  console.log(
    chalk.gray(`Required blocks: `) +
      chalk.white(Array.from(requiredBlockTypes).join(", ") || "(none)"),
  );

  if (options.dryRun) {
    console.log(chalk.yellow("\n🔍 Dry run - nothing will be uploaded.\n"));
    return;
  }

  // Bump package.json version on disk BEFORE upload so a successful
  // publish leaves the source tree in a consistent state. Mirrors
  // legacy publish.ts behavior.
  if (nextVersion !== currentVersion) {
    packageJson.version = nextVersion;
    fs.writeJsonSync(pkgJsonPath, packageJson, { spaces: 2 });
  }

  // Upload via existing IMPORT_TEMPLATE_MUTATION
  const client = new GraphQLClient(apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
      "X-Workspace-ID": workspaceId,
    },
  });

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Template upload timed out after ${REQUEST_TIMEOUT_MS / 1000}s. ` +
            "Large pages.json or slow network can cause this; retry or split the template.",
        ),
      );
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    const result = (await Promise.race([
      client.request(IMPORT_TEMPLATE_MUTATION, { input }),
      timeoutPromise,
    ])) as ImportTemplateResponse;

    if (timeoutId) clearTimeout(timeoutId);

    if (!result.importTemplate?.success) {
      throw new Error(
        result.importTemplate?.message ?? "Failed to import template",
      );
    }
    const { pagesCreated = 0, pagesUpdated = 0 } = result.importTemplate;
    console.log(
      chalk.green(
        `\n✔ Published ${templateName}@${nextVersion} - ${pagesCreated} pages created, ${pagesUpdated} updated.\n`,
      ),
    );
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    // Roll back the version bump on failure so the next attempt
    // doesn't accidentally skip a version.
    if (nextVersion !== currentVersion) {
      packageJson.version = currentVersion;
      fs.writeJsonSync(pkgJsonPath, packageJson, { spaces: 2 });
    }
    console.error(
      chalk.red(
        `\n✖ Failed to publish template ${templateName}: ${err instanceof Error ? err.message : String(err)}\n`,
      ),
    );
    process.exit(1);
  }
}
