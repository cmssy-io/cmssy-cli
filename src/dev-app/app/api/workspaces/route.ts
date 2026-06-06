import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

function loadEnvConfig(): {
  apiUrl: string;
  apiToken: string | null;
  workspaceId: string | null;
} {
  const envPath = path.join(projectRoot, ".env");
  const config: any = {
    apiUrl: "https://api.cmssy.io/graphql",
    apiToken: null,
    workspaceId: null,
  };
  if (!fs.existsSync(envPath)) return config;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^(CMSSY_\w+)=(.*)$/);
    if (!match) continue;
    const [, key, val] = match;
    if (key === "CMSSY_API_URL") config.apiUrl = val.trim();
    if (key === "CMSSY_API_TOKEN") config.apiToken = val.trim() || null;
    if (key === "CMSSY_WORKSPACE_ID") config.workspaceId = val.trim() || null;
  }
  return config;
}

const MY_WORKSPACES_QUERY = `
  query MyWorkspaces {
    myWorkspaces {
      id
      slug
      name
      myRole { name slug }
    }
  }
`;

export async function GET() {
  const config = loadEnvConfig();

  if (!config.apiToken) {
    return NextResponse.json({ connected: false, reason: "no_token" });
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
    };

    const wsRes = await fetch(config.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: MY_WORKSPACES_QUERY }),
    });
    const wsData = await wsRes.json();

    if (wsData.errors?.length) {
      return NextResponse.json({
        connected: false,
        reason: "auth_error",
        error: wsData.errors[0].message,
      });
    }

    const workspaces = wsData.data?.myWorkspaces || [];

    let targetWorkspace = null;
    if (config.workspaceId) {
      targetWorkspace = workspaces.find(
        (w: any) => w.id === config.workspaceId,
      );
    }
    if (!targetWorkspace && workspaces.length > 0) {
      targetWorkspace = workspaces[0];
    }

    return NextResponse.json({
      connected: true,
      workspace: targetWorkspace,
      workspaces,
    });
  } catch (error: any) {
    return NextResponse.json({
      connected: false,
      reason: "network_error",
      error: error.message,
    });
  }
}
