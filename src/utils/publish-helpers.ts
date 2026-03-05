/**
 * Helper functions for the publish command.
 * Extracted for testability.
 */
import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";

/**
 * Convert config.ts schema to schemaFields array for GraphQL mutation.
 */
export function convertSchemaToFields(schema: Record<string, any>): any[] {
  const fields: any[] = [];

  Object.entries(schema).forEach(([key, field]: [string, any]) => {
    const baseField: any = {
      key,
      type: field.type,
      label: field.label,
      required: field.required || false,
    };

    // Add defaultValue if present
    if (field.defaultValue !== undefined) {
      baseField.defaultValue = field.defaultValue;
    }

    // Add placeholder if present
    if (field.placeholder) {
      baseField.placeholder = field.placeholder;
    }

    // Add helpText if present
    if (field.helpText) {
      baseField.helperText = field.helpText;
    }

    // Add group if present
    if (field.group) {
      baseField.group = field.group;
    }

    // Add showWhen conditional visibility
    if (field.showWhen) {
      baseField.showWhen = field.showWhen;
    }

    // Add validation rules
    if (field.validation) {
      baseField.validation = field.validation;
    }

    if (field.type === "select" && field.options) {
      baseField.options = field.options;
    }

    if (field.type === "repeater" && field.schema) {
      baseField.minItems = field.minItems;
      baseField.maxItems = field.maxItems;
      // Backend expects itemSchema to be a flat array of field definitions
      baseField.itemSchema = convertSchemaToFields(field.schema);
    }

    fields.push(baseField);
  });

  return fields;
}

/**
 * Extract default content values from schema.
 */
export function extractDefaultContent(schema: Record<string, any>): any {
  const content: any = {};

  Object.entries(schema).forEach(([key, field]: [string, any]) => {
    if (field.defaultValue !== undefined) {
      content[key] = field.defaultValue;
    } else if (field.type === "repeater") {
      content[key] = [];
    }
  });

  return content;
}

/**
 * Extract block type from full package name.
 * @example "@cmssy/blocks.hero" -> "hero"
 * @example "@org/templates.landing" -> "landing"
 */
export function extractBlockType(packageName: string): string {
  return packageName
    .replace(/@[^/]+\//, "") // Remove @scope/
    .replace(/^blocks\./, "") // Remove blocks. prefix
    .replace(/^templates\./, ""); // Remove templates. prefix
}

/**
 * Detect if a package is a template based on type.
 */
export function isTemplate(packageType: "block" | "template"): boolean {
  return packageType === "template";
}

/**
 * Parse pages.json data and convert to mutation input format.
 */
export function parsePagesJson(pagesData: any): {
  pages: any[];
  layoutPositions: any[];
} {
  // Convert pages
  const pages = (pagesData.pages || []).map((page: any) => ({
    name: page.name,
    slug: page.slug,
    blocks: (page.blocks || []).map((block: any) => ({
      type: block.type,
      content: block.content || {},
    })),
  }));

  // Convert layoutPositions to array format
  const layoutPositions: any[] = [];
  if (pagesData.layoutPositions) {
    for (const [position, data] of Object.entries(
      pagesData.layoutPositions as Record<string, any>,
    )) {
      layoutPositions.push({
        position,
        type: data.type,
        content: data.content || {},
      });
    }
  }

  return { pages, layoutPositions };
}

/**
 * Load template config from config.ts using tsx.
 * Fallback for templates that don't have pages.json.
 */
export function loadTemplateConfig(
  templateDir: string,
  projectRoot: string,
): Record<string, any> | null {
  const configPath = path.join(templateDir, "config.ts");
  if (!fs.existsSync(configPath)) return null;

  try {
    const cliPath = path.dirname(
      path.dirname(new URL(import.meta.url).pathname),
    );
    const possibleTsxPaths = [
      path.join(cliPath, "..", "node_modules", ".bin", "tsx"),
      path.join(cliPath, "..", "..", "node_modules", ".bin", "tsx"),
      path.join(projectRoot, "node_modules", ".bin", "tsx"),
    ];
    let tsxBinary = possibleTsxPaths.find((p) => fs.existsSync(p));
    if (!tsxBinary) tsxBinary = "npx -y tsx";

    const cacheDir = path.join(projectRoot, ".cmssy", "cache");
    fs.ensureDirSync(cacheDir);

    const mockConfigPath = path.join(cacheDir, "cmssy-cli-config.mjs");
    fs.writeFileSync(
      mockConfigPath,
      "export const defineBlock = (config) => config;\nexport const defineTemplate = (config) => config;\n",
    );

    const configContent = fs.readFileSync(configPath, "utf-8");
    const modified = configContent.replace(
      /from\s+['"](?:@?cmssy-?(?:\/cli)?\/config|cmssy-cli\/config)['"]/g,
      `from '${mockConfigPath.replace(/\\/g, "/")}'`,
    );

    const tempPath = path.join(
      cacheDir,
      `temp-template-config-${Date.now()}.ts`,
    );
    fs.writeFileSync(tempPath, modified);

    const evalCode = `import cfg from '${tempPath.replace(/\\/g, "/")}'; console.log(JSON.stringify(cfg.default || cfg));`;
    const cmd = tsxBinary.includes("npx")
      ? `${tsxBinary} --eval "${evalCode}"`
      : `"${tsxBinary}" --eval "${evalCode}"`;

    const output = execSync(cmd, {
      encoding: "utf-8",
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    try {
      fs.removeSync(tempPath);
    } catch {}
    try {
      fs.removeSync(mockConfigPath);
    } catch {}

    const lines = output.trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Convert template config.ts data to pages.json format.
 * - layoutPositions: array → object keyed by position
 * - page slugs: "home" → "/", others → "/{slug}"
 */
export function convertConfigToPagesData(config: Record<string, any>): {
  layoutPositions: Record<string, any>;
  pages: any[];
} {
  const layoutPositions: Record<string, any> = {};
  if (Array.isArray(config.layoutPositions)) {
    for (const lp of config.layoutPositions) {
      layoutPositions[lp.position] = {
        type: lp.type,
        content: lp.content || {},
      };
    }
  } else if (
    config.layoutPositions &&
    typeof config.layoutPositions === "object"
  ) {
    Object.assign(layoutPositions, config.layoutPositions);
  }

  const pages = (config.pages || []).map((page: any, index: number) => ({
    name: page.name,
    slug:
      page.slug === "home" || page.slug === "/" || index === 0
        ? "/"
        : page.slug.startsWith("/")
          ? page.slug
          : `/${page.slug}`,
    blocks: page.blocks || [],
    layoutPositions: page.layoutPositions,
  }));

  return { layoutPositions, pages };
}
