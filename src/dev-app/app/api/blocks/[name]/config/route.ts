import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

function loadBlockConfig(blockPath: string): Record<string, unknown> | null {
  const configPath = path.join(blockPath, "config.ts");
  if (!fs.existsSync(configPath)) return null;

  try {
    const tsxPaths = [
      path.join(projectRoot, "node_modules", ".bin", "tsx"),
      path.join(
        projectRoot,
        "node_modules",
        "cmssy-cli",
        "node_modules",
        ".bin",
        "tsx",
      ),
    ];
    const tsxBinary = tsxPaths.find((p) => fs.existsSync(p)) || "npx -y tsx";

    const cacheDir = path.join(projectRoot, ".cmssy", "cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    const tempDir = fs.mkdtempSync(path.join(cacheDir, "block-config-"));
    try {
      const mockConfigPath = path.join(tempDir, "cmssy-cli-config.mjs");
      fs.writeFileSync(
        mockConfigPath,
        "export const defineBlock = (config) => config;\nexport const defineTemplate = (config) => config;",
      );

      const configContent = fs.readFileSync(configPath, "utf-8");
      const modified = configContent.replace(
        /from\s+['"](?:@cmssy\/cli\/config|cmssy-cli\/config)['"]/g,
        `from '${mockConfigPath.replace(/\\\\/g, "/")}'`,
      );

      const tempPath = path.join(tempDir, "temp-block-config.ts");
      fs.writeFileSync(tempPath, modified);

      const evalCode = `import cfg from '${tempPath.replace(/\\\\/g, "/")}'; console.log(JSON.stringify(cfg.default || cfg));`;
      const cmd = tsxBinary.includes("npx")
        ? `${tsxBinary} --eval "${evalCode}"`
        : `"${tsxBinary}" --eval "${evalCode}"`;

      const output = execSync(cmd, {
        encoding: "utf-8",
        cwd: projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const lines = output.trim().split("\n");
      return JSON.parse(lines[lines.length - 1]);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch {}
    }
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  let blockPath = path.join(projectRoot, "blocks", name);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", name);
  }

  if (!fs.existsSync(blockPath)) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const previewPath = path.join(blockPath, "preview.json");
  const previewData = fs.existsSync(previewPath)
    ? JSON.parse(fs.readFileSync(previewPath, "utf-8"))
    : {};

  const config = loadBlockConfig(blockPath);

  const pagesJsonPath = path.join(blockPath, "pages.json");
  let pagesData = fs.existsSync(pagesJsonPath)
    ? JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8"))
    : null;

  if (!pagesData && config && (config.pages || config.layoutPositions)) {
    const layoutPositions: Record<string, any> = {};
    if (Array.isArray(config.layoutPositions)) {
      for (const lp of config.layoutPositions as any[]) {
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

    const pages = ((config.pages || []) as any[]).map(
      (page: any, index: number) => ({
        name: page.name,
        slug:
          page.slug === "home" || page.slug === "/" || index === 0
            ? "/"
            : page.slug.startsWith("/")
              ? page.slug
              : "/" + page.slug,
        blocks: page.blocks || [],
      }),
    );

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
