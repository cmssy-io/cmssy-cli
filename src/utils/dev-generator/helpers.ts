import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";

/**
 * Convert full block type name to simple name.
 * "@cmssy-marketing/blocks.hero" -> "hero"
 * "@vendor/blocks.pricing-table" -> "pricing-table"
 * "hero" -> "hero" (already simple)
 */
export function convertBlockTypeToSimple(blockType: string): string {
  let simple = blockType;
  if (simple.includes("/")) {
    simple = simple.split("/").pop()!;
  }
  if (simple.startsWith("blocks.")) {
    simple = simple.substring(7);
  } else if (simple.startsWith("templates.")) {
    simple = simple.substring(10);
  }
  return simple;
}

/**
 * Load config.ts synchronously using tsx/esbuild.
 * Used to generate template preview pages when pages.json is missing.
 */
export function loadTemplateConfigSync(
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
 * Convert template config (from config.ts defineTemplate) to pages.json format.
 * - layoutPositions: array → object keyed by position
 * - page slugs: "home" → "/", others → "/{slug}"
 */
export function convertConfigToPagesData(config: Record<string, any>): {
  layoutPositions: Record<string, any>;
  pages: any[];
} {
  // Convert layoutPositions from array to object
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
    // Already in object format
    Object.assign(layoutPositions, config.layoutPositions);
  }

  // Convert page slugs
  const pages = (config.pages || []).map((page: any, index: number) => ({
    name: page.name,
    slug:
      page.slug === "home" || page.slug === "/" || index === 0
        ? "/"
        : page.slug.startsWith("/")
          ? page.slug
          : `/${page.slug}`,
    blocks: page.blocks || [],
  }));

  return { layoutPositions, pages };
}

export function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
