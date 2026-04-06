import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  let blockPath = path.join(projectRoot, "blocks", name);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", name);
  }

  const previewPath = path.join(blockPath, "preview.json");
  const data = fs.existsSync(previewPath)
    ? JSON.parse(fs.readFileSync(previewPath, "utf-8"))
    : {};

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const body = await request.json();

  let blockPath = path.join(projectRoot, "blocks", name);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", name);
  }

  const previewPath = path.join(blockPath, "preview.json");
  fs.writeFileSync(previewPath, JSON.stringify(body, null, 2));

  return NextResponse.json({ success: true });
}
