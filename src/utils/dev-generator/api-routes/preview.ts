import fs from "fs-extra";
import path from "path";

export function generatePreviewApiRoute(devRoot: string) {
  const dir = path.join(devRoot, "app/api/preview/[blockName]");
  fs.mkdirSync(dir, { recursive: true });

  const content = `import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ blockName: string }> }
) {
  const { blockName } = await params;
  let blockPath = path.join(projectRoot, "blocks", blockName);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", blockName);
  }

  const previewPath = path.join(blockPath, "preview.json");
  const data = fs.existsSync(previewPath)
    ? JSON.parse(fs.readFileSync(previewPath, "utf-8"))
    : {};

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ blockName: string }> }
) {
  const { blockName } = await params;
  const body = await request.json();

  let blockPath = path.join(projectRoot, "blocks", blockName);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", blockName);
  }

  const previewPath = path.join(blockPath, "preview.json");
  fs.writeFileSync(previewPath, JSON.stringify(body, null, 2));

  return NextResponse.json({ success: true });
}
`;
  fs.writeFileSync(path.join(dir, "route.ts"), content);
}
