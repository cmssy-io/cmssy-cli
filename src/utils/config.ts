import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";

export interface CmssyConfig {
  apiUrl: string;
  apiToken: string | null;
  workspaceId?: string | null;
}

export function loadConfig(): CmssyConfig {
  // Load from .env in cwd
  const envPath = path.join(process.cwd(), ".env");

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  return {
    apiUrl: process.env.CMSSY_API_URL || "https://api.cmssy.io/graphql",
    apiToken: process.env.CMSSY_API_TOKEN || null,
    workspaceId: process.env.CMSSY_WORKSPACE_ID || null,
  };
}

export function saveConfig(config: Partial<CmssyConfig>): void {
  const envPath = path.join(process.cwd(), ".env");
  const existingEnv = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";

  let newEnv = existingEnv;

  // Helper: append a key=value, ensuring a leading newline
  function appendKey(key: string, value: string) {
    if (newEnv.includes(`${key}=`)) {
      newEnv = newEnv.replace(new RegExp(`${key}=.*`), `${key}=${value}`);
    } else {
      // Ensure newline before appending to avoid concatenation with last line
      if (newEnv.length > 0 && !newEnv.endsWith("\n")) {
        newEnv += "\n";
      }
      newEnv += `${key}=${value}\n`;
    }
  }

  if (config.apiToken !== undefined) {
    appendKey("CMSSY_API_TOKEN", config.apiToken!);
  }
  if (config.apiUrl !== undefined) {
    appendKey("CMSSY_API_URL", config.apiUrl);
  }
  if (config.workspaceId !== undefined) {
    appendKey("CMSSY_WORKSPACE_ID", config.workspaceId!);
  }

  fs.writeFileSync(envPath, newEnv.trim() + "\n");
}

export function hasConfig(): boolean {
  const config = loadConfig();
  return !!config.apiToken;
}
