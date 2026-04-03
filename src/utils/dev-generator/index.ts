import fs from "fs-extra";
import path from "path";
import type { ScannedResource } from "../scanner.js";
import { generateNextConfig, generateTsConfig } from "./next-config.js";
import { generateRootLayout, generateGlobalsCss } from "./layout.js";
import { generateHomePage } from "./home-page.js";
import {
  generateBlocksApiRoute,
  generateBlockConfigApiRoute,
} from "./api-routes/blocks.js";
import { generatePreviewApiRoute } from "./api-routes/preview.js";
import { generateWorkspacesApiRoute } from "./api-routes/workspaces.js";
import { generatePreviewPages } from "./preview-pages.js";

const DEV_DIR = ".cmssy/dev";

/**
 * Generate the .cmssy/dev/ Next.js app structure for cmssy dev.
 * This creates a minimal Next.js app that imports blocks directly,
 * enabling "use client" boundaries, next/image, and SSR in dev preview.
 */
export function generateDevApp(
  projectRoot: string,
  resources: ScannedResource[],
): string {
  const devRoot = path.join(projectRoot, DEV_DIR);

  // Clean and recreate
  fs.removeSync(devRoot);
  fs.mkdirSync(path.join(devRoot, "app/preview"), { recursive: true });
  fs.mkdirSync(path.join(devRoot, "app/api/blocks"), { recursive: true });
  fs.mkdirSync(path.join(devRoot, "app/api/preview"), { recursive: true });
  fs.mkdirSync(path.join(devRoot, "app/api/workspaces"), { recursive: true });

  // Generate all files
  generateNextConfig(devRoot, projectRoot);
  generateTsConfig(devRoot, projectRoot);
  generateRootLayout(devRoot);
  generateGlobalsCss(devRoot, projectRoot);
  generateHomePage(devRoot);
  generateBlocksApiRoute(devRoot);
  generateBlockConfigApiRoute(devRoot);
  generatePreviewApiRoute(devRoot);
  generateWorkspacesApiRoute(devRoot);
  generatePreviewPages(devRoot, projectRoot, resources);

  return devRoot;
}

/**
 * Regenerate only the preview pages (called when new blocks are detected).
 */
export function regeneratePreviewPages(
  projectRoot: string,
  resources: ScannedResource[],
): void {
  const devRoot = path.join(projectRoot, DEV_DIR);
  const previewDir = path.join(devRoot, "app/preview");

  // Remove old preview pages
  if (fs.existsSync(previewDir)) {
    fs.removeSync(previewDir);
  }
  fs.mkdirSync(previewDir, { recursive: true });

  generatePreviewPages(devRoot, projectRoot, resources);
}
