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
  convertConfigToPagesData,
  extractBlockType,
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
  // Commander's `--no-bump` sets this to `false` (default `true`);
  // there is NO `noBump` option. Mirrors the legacy publish command.
  bump?: boolean;
  dryRun?: boolean;
  overwriteContent?: boolean;
}

const REQUEST_TIMEOUT_MS = 180_000;
// Mirror publish-block-buildtime: lowercase alphanumeric + dashes,
// must start with alphanumeric. Anything else (`../`, `/abs`, spaces)
// is rejected before we touch the filesystem.
const TEMPLATE_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Templates are declarative - no sandbox build needed. Reads
 * `templates/<name>/config.ts` + `pages.json` and uploads via the
 * existing `IMPORT_TEMPLATE_MUTATION`. The mutation triggers cache
 * revalidation backend-side (CMS-604/CMS-843), so the public site
 * picks up the new template without manual intervention.
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

  // Validate name format before touching the filesystem. Anything that
  // can be interpreted as a path segment (`../`, absolute paths) gets
  // rejected here - prevents reading/writing arbitrary directories via
  // a crafted name argument.
  if (!TEMPLATE_NAME_REGEX.test(templateName)) {
    console.error(
      chalk.red(
        `✖ Invalid template name "${templateName}" - lowercase alphanumeric + dashes only.\n`,
      ),
    );
    process.exit(1);
  }

  // Resolve template dir + confirm the resolved path stays inside the
  // templates/ root (belt-and-suspenders defense against any name
  // that slipped past the regex above).
  const cwd = process.cwd();
  const templatesRoot = path.resolve(cwd, "templates");
  const templatePath = path.resolve(templatesRoot, templateName);
  if (
    templatePath !== templatesRoot &&
    !templatePath.startsWith(templatesRoot + path.sep)
  ) {
    console.error(
      chalk.red(
        `✖ Template path "${templatePath}" escapes templates/ root (refusing to read).\n`,
      ),
    );
    process.exit(1);
  }
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

  // Bump version unless --no-bump. Commander sets `options.bump = false`
  // for `--no-bump`; default is `true`. Matches the legacy publish
  // command's convention.
  const currentVersion = packageJson.version ?? "0.0.0";
  let nextVersion = currentVersion;
  if (options.bump !== false) {
    const bumpType = options.major
      ? "major"
      : options.minor
        ? "minor"
        : options.patch
          ? "patch"
          : "patch"; // default to patch when no flag
    const bumped = semver.inc(currentVersion, bumpType);
    if (!bumped) {
      // Silent fallback to currentVersion would publish "in place" and
      // hide a real config problem (typo in package.json version,
      // pre-release tag we don't recognize, etc.). Fail loud instead.
      console.error(
        chalk.red(
          `✖ Cannot ${bumpType}-bump invalid version "${currentVersion}" in templates/${templateName}/package.json. Fix it or pass --no-bump.\n`,
        ),
      );
      process.exit(1);
    }
    nextVersion = bumped;
  }

  // Pre-validate user input from pages.json / config.ts before mapping
  // it into the mutation. extractBlockType blindly calls
  // `.replace(...)` on its argument; a missing or non-string `type`
  // would throw a runtime exception with no breadcrumb pointing at
  // the offending page. Surface a clear error instead.
  const pageSource = pagesData.pages ?? [];
  pageSource.forEach((page, pageIdx) => {
    const pageLabel = page?.slug ?? `page[${pageIdx}]`;
    if (typeof page?.slug !== "string" || !page.slug) {
      throw new Error(
        `templates/${templateName}: ${pageLabel} is missing a non-empty string \`slug\``,
      );
    }
    (page.blocks ?? []).forEach((block: any, blockIdx: number) => {
      if (typeof block?.type !== "string" || !block.type) {
        throw new Error(
          `templates/${templateName}: ${pageLabel} block[${blockIdx}] is missing a non-empty string \`type\``,
        );
      }
    });
    const lpSource = Array.isArray(page?.layoutPositions)
      ? page.layoutPositions
      : page?.layoutPositions
        ? Object.values(page.layoutPositions)
        : [];
    lpSource.forEach((lp: any, lpIdx: number) => {
      if (typeof lp?.type !== "string" || !lp.type) {
        throw new Error(
          `templates/${templateName}: ${pageLabel} layoutPosition[${lpIdx}] is missing a non-empty string \`type\``,
        );
      }
    });
  });
  const lpSourceGlobal = Array.isArray(pagesData.layoutPositions)
    ? pagesData.layoutPositions
    : pagesData.layoutPositions
      ? Object.values(pagesData.layoutPositions)
      : [];
  lpSourceGlobal.forEach((lp: any, lpIdx: number) => {
    if (typeof lp?.type !== "string" || !lp.type) {
      throw new Error(
        `templates/${templateName}: global layoutPosition[${lpIdx}] is missing a non-empty string \`type\``,
      );
    }
  });

  // Build IMPORT_TEMPLATE_MUTATION input. Pages get their slug
  // normalized and block types collapsed to short form so the backend
  // resolves them against `workspace_blocks.blockType`.
  const pages = pageSource.map((page: any) => {
    const slug = page.slug === "/" ? "/" : page.slug.replace(/^\/+/, "");
    const result: Record<string, any> = {
      name: page.name,
      slug,
      blocks: (page.blocks ?? []).map((block: any) => ({
        type: extractBlockType(block.type),
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
          type: extractBlockType(data.type),
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
    type: extractBlockType(data.type),
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
    blockType: extractBlockType(packageJson.name ?? templateName),
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

  // Upload via existing IMPORT_TEMPLATE_MUTATION.
  // AbortController + signal so the request is actually cancelled on
  // timeout - otherwise the mutation can succeed server-side AFTER
  // the CLI reports failure and rolls back the local version, leaving
  // the user in an inconsistent state (server v1.2.11, local v1.2.10).
  const client = new GraphQLClient(apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
      "X-Workspace-ID": workspaceId,
    },
  });

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const result = (await client.request({
      document: IMPORT_TEMPLATE_MUTATION,
      variables: { input },
      signal: abortController.signal,
    })) as ImportTemplateResponse;
    clearTimeout(timeoutHandle);

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
    clearTimeout(timeoutHandle);
    // Roll back the version bump on failure so the next attempt
    // doesn't accidentally skip a version.
    if (nextVersion !== currentVersion) {
      packageJson.version = currentVersion;
      fs.writeJsonSync(pkgJsonPath, packageJson, { spaces: 2 });
    }
    const userMessage = abortController.signal.aborted
      ? `Template upload timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Large pages.json or slow network can cause this; retry or split the template.`
      : err instanceof Error
        ? err.message
        : String(err);
    console.error(
      chalk.red(
        `\n✖ Failed to publish template ${templateName}: ${userMessage}\n`,
      ),
    );
    process.exit(1);
  }
}
