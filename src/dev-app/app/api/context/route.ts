import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();
const CONTEXT_PATH = path.join(projectRoot, ".cmssy", "dev-context.json");

const DEFAULT_CONTEXT = {
  locale: {
    current: "en",
    default: "en",
    enabled: ["en"],
  },
  auth: null,
  workspace: {
    id: "dev-workspace",
    slug: "dev",
    name: "Dev Workspace",
  },
  isPreview: true,
};

const PRESETS: Record<string, any> = {
  empty: {
    locale: { current: "en", default: "en", enabled: ["en"] },
    auth: null,
    workspace: null,
    isPreview: true,
  },
  "logged-in": {
    locale: { current: "en", default: "en", enabled: ["en"] },
    auth: {
      isAuthenticated: true,
      member: {
        id: "dev-member-1",
        email: "user@example.com",
        profile: {
          firstName: "Jane",
          lastName: "Doe",
          displayName: "Jane Doe",
          avatarUrl: "",
        },
        role: "member",
        verified: true,
      },
    },
    workspace: { id: "dev-workspace", slug: "dev", name: "Dev Workspace" },
    isPreview: true,
  },
  "multi-language": {
    locale: { current: "en", default: "en", enabled: ["en", "pl", "de"] },
    auth: null,
    workspace: { id: "dev-workspace", slug: "dev", name: "Dev Workspace" },
    isPreview: true,
  },
  "blog-posts": {
    locale: { current: "en", default: "en", enabled: ["en"] },
    auth: null,
    workspace: { id: "dev-workspace", slug: "dev", name: "Dev Workspace" },
    isPreview: true,
    pages: {
      posts: [
        {
          slug: "hello-world",
          fullSlug: "/blog/hello-world",
          displayName: { en: "Hello World" },
          pageType: "post",
        },
        {
          slug: "getting-started",
          fullSlug: "/blog/getting-started",
          displayName: { en: "Getting Started" },
          pageType: "post",
        },
        {
          slug: "advanced-tips",
          fullSlug: "/blog/advanced-tips",
          displayName: { en: "Advanced Tips" },
          pageType: "post",
        },
      ],
    },
  },
};

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Return presets list
  if (url.searchParams.get("presets") === "true") {
    return NextResponse.json({
      presets: Object.keys(PRESETS),
    });
  }

  // Return a specific preset
  const preset = url.searchParams.get("preset");
  if (preset && PRESETS[preset]) {
    return NextResponse.json(PRESETS[preset]);
  }

  // Return saved context
  let context = DEFAULT_CONTEXT;
  if (fs.existsSync(CONTEXT_PATH)) {
    try {
      context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    } catch {
      context = DEFAULT_CONTEXT;
    }
  }

  return NextResponse.json(context);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const dir = path.dirname(CONTEXT_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONTEXT_PATH, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = error?.message?.includes("JSON") ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
