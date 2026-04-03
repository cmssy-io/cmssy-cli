import fs from "fs-extra";
import path from "path";

export function generateConfigApiRoute(devRoot: string) {
  const dir = path.join(devRoot, "app/api/config");
  fs.mkdirSync(dir, { recursive: true });

  const content = `import { NextResponse } from "next/server";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

function getEnvPath() {
  const fs = require("fs");
  const path = require("path");
  return path.join(projectRoot, ".env");
}

function readEnv(): Record<string, string> {
  const fs = require("fs");
  const envPath = getEnvPath();
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function writeEnv(updates: Record<string, string>) {
  const fs = require("fs");
  const envPath = getEnvPath();
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(\`^(\${key})=.*$\`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, \`\${key}=\${value}\`);
    } else {
      content = content.trimEnd() + "\\n" + \`\${key}=\${value}\` + "\\n";
    }
  }

  fs.writeFileSync(envPath, content);
}

function maskToken(token: string | undefined): string | null {
  if (!token || token.length < 8) return token ? "***" : null;
  return token.substring(0, 3) + "***" + token.substring(token.length - 3);
}

function readCmssyConfig(): Record<string, any> | null {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(projectRoot, "cmssy.config.js");
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const match = content.match(/export\\s+default\\s+({[\\s\\S]*});?/);
    if (match) return JSON.parse(match[1].replace(/,\\s*}/g, "}").replace(/'/g, '"'));
  } catch {}
  return null;
}

export async function GET() {
  const env = readEnv();
  const cmssyConfig = readCmssyConfig();

  return NextResponse.json({
    env: {
      apiUrl: env.CMSSY_API_URL || "https://api.cmssy.io/graphql",
      hasToken: !!env.CMSSY_API_TOKEN,
      maskedToken: maskToken(env.CMSSY_API_TOKEN),
      workspaceId: env.CMSSY_WORKSPACE_ID || null,
    },
    project: cmssyConfig,
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const updates: Record<string, string> = {};

    if (body.apiUrl !== undefined) {
      updates.CMSSY_API_URL = body.apiUrl;
    }
    if (body.apiToken !== undefined) {
      updates.CMSSY_API_TOKEN = body.apiToken;
    }
    if (body.workspaceId !== undefined) {
      updates.CMSSY_WORKSPACE_ID = body.workspaceId;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No values to update" }, { status: 400 });
    }

    writeEnv(updates);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`;
  fs.writeFileSync(path.join(dir, "route.ts"), content);
}
