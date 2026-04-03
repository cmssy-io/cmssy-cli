import fs from "fs-extra";
import path from "path";

export function generateWorkspacesApiRoute(devRoot: string) {
  const content = `import { NextResponse } from "next/server";

export async function GET() {
  // Workspace listing requires API token - return empty for now
  // The full implementation uses GraphQL client with cmssy configure credentials
  return NextResponse.json([]);
}
`;
  fs.writeFileSync(path.join(devRoot, "app/api/workspaces/route.ts"), content);
}
