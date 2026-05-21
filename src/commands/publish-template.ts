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
  // there is NO `noBump` option.
  bump?: boolean;
  dryRun?: boolean;
  overwriteContent?: boolean;
}

const REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_API_URL = "https://api.cmssy.io/graphql";
// A safe single path segment: case-insensitive alphanumeric, `-`,
// `_`. Accepts the directory names legacy `cmssy publish` scans
// without validation (it calls readdir on templates/ blindly).
// Rejects path separators, `.`, and whitespace so `../`, `..`, and
// absolute paths can't slip through; the realpath containment check
// below is the real defense. Note: a name starting with `-` is valid
// here but Commander treats `-foo` as an option - the user must pass
// it as `cmssy publish-template -- -foo`.
export const TEMPLATE_NAME_REGEX = /^[A-Za-z0-9_-]+$/;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

function bail(msg: string): never {
  console.error(chalk.red(`✖ ${msg}\n`));
  process.exit(1);
}

function readJsonOrBail<T = any>(filePath: string, label: string): T {
  try {
    return fs.readJsonSync(filePath);
  } catch (err) {
    bail(
      `Failed to read ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// pages.json and config.ts both accept layoutPositions as either an
// array `[{position, type, content}]` or an object `{[position]:
// {type, content}}`. Normalize to [position, entry] pairs so the
// validation and build phases share one shape. `isArray` is returned
// so validators can require `position` on array-form entries (object
// form derives it from the parent key).
function normalizeLayoutPositions(raw: unknown): {
  entries: [string, any][];
  isArray: boolean;
} {
  if (Array.isArray(raw)) {
    return {
      entries: raw.map((lp: any) => [lp?.position, lp]),
      isArray: true,
    };
  }
  if (raw && typeof raw === "object") {
    return {
      entries: Object.entries(raw as Record<string, any>),
      isArray: false,
    };
  }
  return { entries: [], isArray: false };
}

/**
 * Templates are declarative - no sandbox build needed. Reads
 * `templates/<name>/config.ts` + `pages.json` and uploads via
 * `IMPORT_TEMPLATE_MUTATION`, which triggers cache revalidation
 * backend-side (CMS-604/CMS-843).
 *
 * Mirrors `publish-block` UX (same option flags, same workspace
 * resolution) so users can mentally swap `block` ↔ `template`.
 */
export async function publishTemplateCommand(
  templateName: string,
  options: PublishTemplateOptions,
): Promise<void> {
  console.log(chalk.blue.bold("\n📄 Cmssy - Publish Template\n"));

  if (!hasConfig()) bail("Not configured. Run: cmssy link");
  const config = loadConfig();
  if (!config.apiToken) {
    bail("Missing CMSSY_API_TOKEN. Run: cmssy link --token <token>");
  }
  const apiUrl = config.apiUrl ?? DEFAULT_API_URL;

  const workspaceId = await resolveWorkspaceId(options.workspace, config);
  warnIfWorkspaceIdLooksWrong(workspaceId);

  const templatePath = resolveTemplatePath(templateName);

  const pkgJsonPath = path.join(templatePath, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    bail(
      `Missing templates/${templateName}/package.json - run \`cmssy create template ${templateName}\` to scaffold.`,
    );
  }
  const packageJson = readJsonOrBail<any>(
    pkgJsonPath,
    `templates/${templateName}/package.json`,
  );

  // `loadTemplateConfig` returns null for both "file missing" AND
  // "file exists but failed to evaluate" - check existence first so
  // the error message points at the right problem.
  const configPath = path.join(templatePath, "config.ts");
  if (!fs.existsSync(configPath)) {
    bail(
      `Missing templates/${templateName}/config.ts - templates require a defineTemplate() config.`,
    );
  }
  const templateConfig = loadTemplateConfig(templatePath, process.cwd());
  if (!templateConfig) {
    bail(
      `Failed to load templates/${templateName}/config.ts - check for syntax errors or missing imports.`,
    );
  }

  const pagesData = loadPagesData(templatePath, templateName, templateConfig);

  const currentVersion = packageJson.version ?? "0.0.0";
  const nextVersion = resolveNextVersion(currentVersion, options, templateName);

  validatePagesData(pagesData, templateName);

  const { pages, layoutPositions, requiredBlockTypes } =
    buildMutationContent(pagesData);

  const input: Record<string, any> = {
    blockType: extractBlockType(packageJson.name ?? templateName),
    name: templateConfig.name ?? templateName,
    description: templateConfig.description ?? "",
    category: templateConfig.category ?? "website",
    version: nextVersion,
    pages,
    layoutPositions,
    // Sorted so the CLI output, the uploaded payload, and a git diff
    // of consecutive publishes are stable. Otherwise the order depends
    // on Object.entries() traversal of `layoutPositions`, which is
    // close to insertion-order in modern engines but not guaranteed.
    requiredBlocks: Array.from(requiredBlockTypes).sort(),
    // Default backend behavior preserves existing page content on
    // republish; --overwrite-content flips it.
    preserveContent: !options.overwriteContent,
  };
  if (Array.isArray(pagesData.pageTypes) && pagesData.pageTypes.length > 0) {
    input.pageTypes = pagesData.pageTypes;
  }

  printPlan({
    templateName,
    currentVersion,
    nextVersion,
    workspaceId,
    pages,
    requiredBlockTypes,
  });

  if (options.dryRun) {
    console.log(chalk.yellow("\n🔍 Dry run - nothing will be uploaded.\n"));
    return;
  }

  // Bump on disk BEFORE upload so a successful publish leaves the
  // source tree consistent; roll back on failure.
  if (nextVersion !== currentVersion) {
    packageJson.version = nextVersion;
    fs.writeJsonSync(pkgJsonPath, packageJson, { spaces: 2 });
  }

  await uploadTemplate({
    apiUrl,
    apiToken: config.apiToken,
    workspaceId,
    input,
    onFailure: () => {
      if (nextVersion !== currentVersion) {
        packageJson.version = currentVersion;
        fs.writeJsonSync(pkgJsonPath, packageJson, { spaces: 2 });
      }
    },
    templateName,
    nextVersion,
  });
}

function resolveTemplatePath(templateName: string): string {
  // Validate name BEFORE touching the filesystem. Anything that could
  // be interpreted as a path segment (`../`, absolute paths) is
  // rejected here.
  if (!TEMPLATE_NAME_REGEX.test(templateName)) {
    bail(
      `Invalid template name "${templateName}" - alphanumeric plus \`-\`/\`_\` only (no path separators).`,
    );
  }
  const templatesRoot = path.resolve(process.cwd(), "templates");
  const templatePath = path.resolve(templatesRoot, templateName);
  if (
    templatePath !== templatesRoot &&
    !templatePath.startsWith(templatesRoot + path.sep)
  ) {
    bail(
      `Template path "${templatePath}" escapes templates/ root (refusing to read).`,
    );
  }
  if (
    !fs.existsSync(templatePath) ||
    !fs.statSync(templatePath).isDirectory()
  ) {
    bail(`Template not found: templates/${templateName}/`);
  }
  // Lexical startsWith catches `..` but NOT symlinks (`templates/foo
  // -> /etc` is syntactically inside templates/ while pointing
  // outside). Compare realpaths to close that gap. realpathSync
  // requires the path to exist - the existsSync check above
  // guarantees that.
  const realRoot = fs.realpathSync(templatesRoot);
  const realPath = fs.realpathSync(templatePath);
  if (realPath !== realRoot && !realPath.startsWith(realRoot + path.sep)) {
    bail(
      `Template path "${templatePath}" resolves to "${realPath}" (outside templates/) - refusing to read.`,
    );
  }
  return templatePath;
}

function loadPagesData(
  templatePath: string,
  templateName: string,
  templateConfig: Record<string, any>,
): { layoutPositions?: any; pages?: any[]; pageTypes?: any[] } {
  const pagesJsonPath = path.join(templatePath, "pages.json");
  if (fs.existsSync(pagesJsonPath)) {
    return readJsonOrBail(
      pagesJsonPath,
      `templates/${templateName}/pages.json`,
    );
  }
  if (templateConfig.pages || templateConfig.layoutPositions) {
    return convertConfigToPagesData(templateConfig);
  }
  bail(
    `Template has no pages - add a templates/${templateName}/pages.json or define pages in config.ts.`,
  );
}

function resolveNextVersion(
  currentVersion: string,
  options: PublishTemplateOptions,
  templateName: string,
): string {
  if (options.bump === false) return currentVersion;
  const flags: semver.ReleaseType[] = [];
  if (options.major) flags.push("major");
  if (options.minor) flags.push("minor");
  if (options.patch) flags.push("patch");
  if (flags.length > 1) {
    bail(
      `Conflicting bump flags: ${flags.map((f) => `--${f}`).join(" + ")}. Pass at most one of --patch / --minor / --major.`,
    );
  }
  const bumpType = flags[0] ?? "patch";
  const bumped = semver.inc(currentVersion, bumpType);
  if (!bumped) {
    // Silent fallback would publish "in place" and hide a real config
    // problem (typo in package.json version, unrecognized pre-release).
    bail(
      `Cannot ${bumpType}-bump invalid version "${currentVersion}" in templates/${templateName}/package.json. Fix it or pass --no-bump.`,
    );
  }
  return bumped;
}

function validatePagesData(
  pagesData: { layoutPositions?: any; pages?: any[] },
  templateName: string,
): void {
  const fail = (msg: string): never =>
    bail(`templates/${templateName}: ${msg}`);

  const validateLayoutPositions = (raw: unknown, scope: string) => {
    const { entries, isArray } = normalizeLayoutPositions(raw);
    entries.forEach(([position, lp], i) => {
      // `position` must be non-empty in BOTH forms: an array entry can
      // omit the field, and an object can have an empty/whitespace key
      // (`{ "  ": {...} }`) - both trim to "" in the payload otherwise.
      if (!isNonEmptyString(position)) {
        fail(
          `${scope} layoutPosition[${i}] has an empty \`position\` ${isArray ? "field" : "key"}`,
        );
      }
      if (!isNonEmptyString(lp?.type)) {
        fail(
          `${scope} layoutPosition[${i}] is missing a non-empty string \`type\``,
        );
      }
    });
  };

  // Guard the .forEach calls below - malformed pages.json could ship
  // `pages: {}` or `blocks: {}` which would throw a TypeError on
  // .forEach and print a raw stack trace instead of an actionable
  // error.
  if (pagesData.pages !== undefined && !Array.isArray(pagesData.pages)) {
    fail("`pages` must be an array");
  }

  (pagesData.pages ?? []).forEach((page, pageIdx) => {
    const pageLabel = isNonEmptyString(page?.slug)
      ? page.slug
      : `page[${pageIdx}]`;
    if (!isNonEmptyString(page?.slug)) {
      fail(`${pageLabel} is missing a non-empty string \`slug\``);
    }
    // After stripping leading `/`, a slug must still have content
    // (unless the page IS the root `/`). Otherwise inputs like `"///"`
    // or `"/   "` pass the non-empty check but normalize to an empty
    // string downstream and get uploaded as blank.
    const normalizedSlug =
      page.slug === "/" ? "/" : page.slug.replace(/^\/+/, "").trim();
    if (normalizedSlug.length === 0) {
      fail(
        `${pageLabel} slug normalizes to empty - use "/" for the root page or provide a non-slash path`,
      );
    }
    if (page.blocks !== undefined && !Array.isArray(page.blocks)) {
      fail(`${pageLabel} \`blocks\` must be an array`);
    }
    (page.blocks ?? []).forEach((block: any, blockIdx: number) => {
      if (!isNonEmptyString(block?.type)) {
        fail(
          `${pageLabel} block[${blockIdx}] is missing a non-empty string \`type\``,
        );
      }
    });
    validateLayoutPositions(page?.layoutPositions, pageLabel);
  });

  validateLayoutPositions(pagesData.layoutPositions, "global");
}

function buildMutationContent(pagesData: {
  layoutPositions?: any;
  pages?: any[];
}): { pages: any[]; layoutPositions: any[]; requiredBlockTypes: Set<string> } {
  const requiredBlockTypes = new Set<string>();

  const buildLpList = (raw: unknown) =>
    normalizeLayoutPositions(raw).entries.map(([position, data]) => {
      // `extractBlockType` trims the type; trim `position` too so a
      // whitespace-padded slot name from pages.json doesn't reach the
      // mutation (validation only checks non-empty-after-trim).
      const type = extractBlockType(data.type);
      requiredBlockTypes.add(type);
      return { position: position.trim(), type, content: data.content ?? {} };
    });

  const pages = (pagesData.pages ?? []).map((page: any) => {
    // Match the validation pass: strip leading slashes AND trim. Skipping
    // `.trim()` here lets inputs like `"/foo "` upload with a trailing
    // space even though validation accepted them.
    const slug = page.slug === "/" ? "/" : page.slug.replace(/^\/+/, "").trim();
    const result: Record<string, any> = {
      name: page.name,
      slug,
      blocks: (page.blocks ?? []).map((block: any) => {
        const type = extractBlockType(block.type);
        requiredBlockTypes.add(type);
        return { type, content: block.content ?? {} };
      }),
    };
    if (page.pageType) result.pageType = page.pageType;
    if (page.parentSlug) {
      result.parentSlug = String(page.parentSlug).replace(/^\/+/, "").trim();
    }
    if (page.layoutPositions) {
      result.layoutPositions = buildLpList(page.layoutPositions);
    }
    return result;
  });

  const layoutPositions = buildLpList(pagesData.layoutPositions);

  return { pages, layoutPositions, requiredBlockTypes };
}

function printPlan(args: {
  templateName: string;
  currentVersion: string;
  nextVersion: string;
  workspaceId: string;
  pages: any[];
  requiredBlockTypes: Set<string>;
}): void {
  const { templateName, currentVersion, nextVersion, workspaceId, pages } =
    args;
  console.log(chalk.gray(`Template:    `) + chalk.white(templateName));
  console.log(
    chalk.gray(`Version:     `) +
      chalk.white(`${currentVersion} → ${nextVersion}`),
  );
  console.log(chalk.gray(`Workspace:   `) + chalk.white(workspaceId));
  console.log(chalk.gray(`Pages:       `) + chalk.white(String(pages.length)));
  console.log(
    chalk.gray(`Required blocks: `) +
      chalk.white(
        Array.from(args.requiredBlockTypes).sort().join(", ") || "(none)",
      ),
  );
}

async function uploadTemplate(args: {
  apiUrl: string;
  apiToken: string;
  workspaceId: string;
  input: Record<string, any>;
  onFailure: () => void;
  templateName: string;
  nextVersion: string;
}): Promise<void> {
  const client = new GraphQLClient(args.apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiToken}`,
      "X-Workspace-ID": args.workspaceId,
    },
  });

  // AbortController + signal so the request is actually cancelled on
  // timeout - otherwise the mutation can succeed server-side AFTER
  // the CLI reports failure and rolls back the local version,
  // leaving the user in an inconsistent state.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const result = (await client.request({
      document: IMPORT_TEMPLATE_MUTATION,
      variables: { input: args.input },
      signal: controller.signal,
    })) as ImportTemplateResponse;

    if (!result.importTemplate?.success) {
      throw new Error(
        result.importTemplate?.message ?? "Failed to import template",
      );
    }
    const { pagesCreated = 0, pagesUpdated = 0 } = result.importTemplate;
    console.log(
      chalk.green(
        `\n✔ Published ${args.templateName}@${args.nextVersion} - ${pagesCreated} pages created, ${pagesUpdated} updated.\n`,
      ),
    );
  } catch (err) {
    // On a true server-side failure we know the publish didn't land,
    // so roll the local version back. On an abort (timeout) the server
    // may have already accepted the mutation - rolling back would
    // leave the user one version behind reality and the next publish
    // would try to reuse the published number. Keep the local bump
    // and tell the user to verify.
    if (controller.signal.aborted) {
      bail(
        `Template upload timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The server may have accepted the mutation - check whether ${args.templateName}@${args.nextVersion} exists in the workspace before retrying. The local version was kept at ${args.nextVersion}; bump manually if you confirm the publish did NOT land.`,
      );
    }
    args.onFailure();
    const userMessage = err instanceof Error ? err.message : String(err);
    bail(`Failed to publish template ${args.templateName}: ${userMessage}`);
  } finally {
    clearTimeout(timer);
  }
}
