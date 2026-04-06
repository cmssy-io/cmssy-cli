import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

export async function GET() {
  const blocks: any[] = [];

  const blocksDir = path.join(projectRoot, "blocks");
  if (fs.existsSync(blocksDir)) {
    const dirs = fs
      .readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const pkgPath = path.join(blocksDir, dir.name, "package.json");
      const pkg = fs.existsSync(pkgPath)
        ? JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
        : {};
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

  const templatesDir = path.join(projectRoot, "templates");
  if (fs.existsSync(templatesDir)) {
    const dirs = fs
      .readdirSync(templatesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const pkgPath = path.join(templatesDir, dir.name, "package.json");
      const pkg = fs.existsSync(pkgPath)
        ? JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
        : {};
      blocks.push({
        type: "template",
        name: dir.name,
        displayName: pkg.cmssy?.displayName || dir.name,
        version: pkg.version || "1.0.0",
        category: pkg.cmssy?.category || "pages",
        tags: pkg.cmssy?.tags || [],
        description: pkg.description || "",
        hasConfig: fs.existsSync(
          path.join(templatesDir, dir.name, "config.ts"),
        ),
      });
    }
  }

  return NextResponse.json(blocks);
}
