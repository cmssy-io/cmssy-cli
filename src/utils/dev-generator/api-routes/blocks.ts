import fs from "fs-extra";
import path from "path";

export function generateBlocksApiRoute(devRoot: string) {
  const content = `import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Project root is passed via env var set by cmssy dev
const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

export async function GET() {
  const blocks: any[] = [];

  // Scan blocks/
  const blocksDir = path.join(projectRoot, "blocks");
  if (fs.existsSync(blocksDir)) {
    const dirs = fs.readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const pkgPath = path.join(blocksDir, dir.name, "package.json");
      const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")) : {};
      blocks.push({
        type: "block",
        name: dir.name,
        displayName: pkg.cmssy?.displayName || dir.name,
        version: pkg.version || "1.0.0",
        category: pkg.cmssy?.category || "other",
        tags: pkg.cmssy?.tags || [],
        description: pkg.description || "",
        hasConfig: fs.existsSync(path.join(blocksDir, dir.name, "config.ts")),
      });
    }
  }

  // Scan templates/
  const templatesDir = path.join(projectRoot, "templates");
  if (fs.existsSync(templatesDir)) {
    const dirs = fs.readdirSync(templatesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const pkgPath = path.join(templatesDir, dir.name, "package.json");
      const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")) : {};
      blocks.push({
        type: "template",
        name: dir.name,
        displayName: pkg.cmssy?.displayName || dir.name,
        version: pkg.version || "1.0.0",
        category: pkg.cmssy?.category || "pages",
        tags: pkg.cmssy?.tags || [],
        description: pkg.description || "",
        hasConfig: fs.existsSync(path.join(templatesDir, dir.name, "config.ts")),
      });
    }
  }

  return NextResponse.json(blocks);
}
`;
  fs.mkdirSync(path.join(devRoot, "app/api/blocks"), { recursive: true });
  fs.writeFileSync(path.join(devRoot, "app/api/blocks/route.ts"), content);
}

export function generateBlockConfigApiRoute(devRoot: string) {
  const dir = path.join(devRoot, "app/api/blocks/[name]/config");
  fs.mkdirSync(dir, { recursive: true });

  const content = `import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

function loadBlockConfig(blockPath: string): Record<string, unknown> | null {
  const configPath = path.join(blockPath, "config.ts");
  if (!fs.existsSync(configPath)) return null;

  try {
    // Find tsx binary
    const tsxPaths = [
      path.join(projectRoot, "node_modules", ".bin", "tsx"),
      path.join(projectRoot, "node_modules", "cmssy-cli", "node_modules", ".bin", "tsx"),
    ];
    const tsxBinary = tsxPaths.find((p) => fs.existsSync(p)) || "npx -y tsx";

    // Create mock cmssy-cli/config module
    const cacheDir = path.join(projectRoot, ".cmssy", "cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    const mockConfigPath = path.join(cacheDir, "cmssy-cli-config.mjs");
    fs.writeFileSync(mockConfigPath,
      "export const defineBlock = (config) => config;\\nexport const defineTemplate = (config) => config;"
    );

    // Replace import path in config
    const configContent = fs.readFileSync(configPath, "utf-8");
    const modified = configContent.replace(
      /from\\s+['"](?:@cmssy\\/cli\\/config|cmssy-cli\\/config)['"]/g,
      \`from '\${mockConfigPath.replace(/\\\\\\\\/g, "/")}'\`
    );

    const tempPath = path.join(cacheDir, "temp-block-config.ts");
    fs.writeFileSync(tempPath, modified);

    const evalCode = \`import cfg from '\${tempPath.replace(/\\\\\\\\/g, "/")}'; console.log(JSON.stringify(cfg.default || cfg));\`;
    const cmd = tsxBinary.includes("npx")
      ? \`\${tsxBinary} --eval "\${evalCode}"\`
      : \`"\${tsxBinary}" --eval "\${evalCode}"\`;

    const output = execSync(cmd, {
      encoding: "utf-8",
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Clean up
    try { fs.unlinkSync(tempPath); } catch {}
    try { fs.unlinkSync(mockConfigPath); } catch {}

    const lines = output.trim().split("\\n");
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Look in blocks/ first, then templates/
  let blockPath = path.join(projectRoot, "blocks", name);
  let resourceType: "block" | "template" = "block";
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", name);
    resourceType = "template";
  }

  if (!fs.existsSync(blockPath)) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  // Load preview data
  const previewPath = path.join(blockPath, "preview.json");
  const previewData = fs.existsSync(previewPath)
    ? JSON.parse(fs.readFileSync(previewPath, "utf-8"))
    : {};

  // Load config schema
  const config = loadBlockConfig(blockPath);

  // Check for pages.json (templates), fall back to config.ts
  const pagesJsonPath = path.join(blockPath, "pages.json");
  let pagesData = fs.existsSync(pagesJsonPath)
    ? JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8"))
    : null;

  // If no pages.json but config has pages (template), convert on the fly
  if (!pagesData && config && (config.pages || config.layoutPositions)) {
    const layoutPositions: Record<string, any> = {};
    if (Array.isArray(config.layoutPositions)) {
      for (const lp of config.layoutPositions as any[]) {
        layoutPositions[lp.position] = { type: lp.type, content: lp.content || {} };
      }
    } else if (config.layoutPositions && typeof config.layoutPositions === "object") {
      Object.assign(layoutPositions, config.layoutPositions);
    }

    const pages = ((config.pages || []) as any[]).map((page: any, index: number) => ({
      name: page.name,
      slug: page.slug === "home" || page.slug === "/" || index === 0
        ? "/"
        : page.slug.startsWith("/") ? page.slug : "/" + page.slug,
      blocks: page.blocks || [],
    }));

    pagesData = { layoutPositions, pages };
  }

  return NextResponse.json({
    name,
    schema: config?.schema || {},
    previewData,
    pages: config?.pages,
    layoutPositions: config?.layoutPositions,
    pagesData,
  });
}
`;
  fs.writeFileSync(path.join(dir, "route.ts"), content);
}
