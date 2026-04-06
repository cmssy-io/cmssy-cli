import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

function resolveBlockPath(name: string): string | null {
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return null;
  }
  let blockPath = path.join(projectRoot, "blocks", name);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", name);
  }
  return fs.existsSync(blockPath) ? blockPath : null;
}

function getVariants(blockPath: string): string[] {
  const previewsDir = path.join(blockPath, "previews");
  if (!fs.existsSync(previewsDir)) return [];
  return fs
    .readdirSync(previewsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

function getPreviewPath(blockPath: string, variant?: string): string {
  if (variant) {
    const variantPath = path.join(blockPath, "previews", `${variant}.json`);
    if (fs.existsSync(variantPath)) return variantPath;
  }
  return path.join(blockPath, "preview.json");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const blockPath = resolveBlockPath(name);
  if (!blockPath) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") || undefined;

  // If requesting variant list
  if (url.searchParams.get("list") === "variants") {
    return NextResponse.json({
      variants: getVariants(blockPath),
    });
  }

  const previewPath = getPreviewPath(blockPath, variant);
  let data = {};
  if (fs.existsSync(previewPath)) {
    try {
      data = JSON.parse(fs.readFileSync(previewPath, "utf-8"));
    } catch {
      data = {};
    }
  }

  return NextResponse.json({
    data,
    variants: getVariants(blockPath),
    currentVariant: variant || null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const blockPath = resolveBlockPath(name);
  if (!blockPath) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") || undefined;
  const action = url.searchParams.get("action");

  // Save as new variant
  if (action === "save-variant") {
    const body = await request.json();
    const variantName = body.variantName;
    if (
      !variantName ||
      variantName.includes("..") ||
      variantName.includes("/")
    ) {
      return NextResponse.json(
        { error: "Invalid variant name" },
        { status: 400 },
      );
    }
    const previewsDir = path.join(blockPath, "previews");
    fs.mkdirSync(previewsDir, { recursive: true });
    const variantPath = path.join(previewsDir, `${variantName}.json`);
    fs.writeFileSync(variantPath, JSON.stringify(body.data, null, 2));
    return NextResponse.json({ success: true, variant: variantName });
  }

  // Delete variant
  if (action === "delete-variant" && variant) {
    const variantPath = path.join(blockPath, "previews", `${variant}.json`);
    if (fs.existsSync(variantPath)) {
      fs.unlinkSync(variantPath);
    }
    return NextResponse.json({ success: true });
  }

  // Regular save
  const body = await request.json();
  const previewPath = getPreviewPath(blockPath, variant);
  fs.writeFileSync(previewPath, JSON.stringify(body, null, 2));

  return NextResponse.json({ success: true });
}
