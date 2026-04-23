import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import type { ScannedResource } from "../scanner.js";
import { generateNextConfig, generateTsConfig } from "./next-config.js";
import { generateGlobalsCss } from "./layout.js";
import { generatePreviewPages } from "./preview-pages.js";

const DEV_DIR = ".cmssy/dev";

/**
 * Resolve the dev-app source directory.
 * In development: src/dev-app/ (from src/utils/dev-generator/)
 * When published: <packageRoot>/src/dev-app (shipped in npm package files)
 */
function getDevAppSourceDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Dev mode: src/utils/dev-generator/ -> ../../dev-app = src/dev-app/
  const srcDevApp = path.resolve(__dirname, "../../dev-app");
  if (fs.existsSync(srcDevApp)) return srcDevApp;

  // Published: dist/utils/dev-generator/ -> ../../../src/dev-app
  const pkgRoot = path.resolve(__dirname, "../../..");
  const publishedDevApp = path.join(pkgRoot, "src/dev-app");
  if (fs.existsSync(publishedDevApp)) return publishedDevApp;

  throw new Error(
    "Could not find dev-app source directory. Ensure src/dev-app/ exists in @cmssy/cli.",
  );
}

/**
 * Copy static dev-app files to the target directory.
 * Only copies files that aren't dynamically generated.
 */
function copyDevAppFiles(devRoot: string): void {
  const sourceDir = getDevAppSourceDir();

  // Copy all files from dev-app to devRoot
  const filesToCopy = [
    "app/page.tsx",
    "app/layout.tsx",
    "app/api/blocks/route.ts",
    "app/api/blocks/[name]/config/route.ts",
    "app/api/preview/[name]/route.ts",
    "app/api/config/route.ts",
    "app/api/context/route.ts",
    "app/api/workspaces/route.ts",
  ];

  for (const file of filesToCopy) {
    const src = path.join(sourceDir, file);
    const dest = path.join(devRoot, file);

    if (!fs.existsSync(src)) {
      throw new Error(
        `Missing required dev-app file: ${file} (expected at ${src})`,
      );
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * Generate the .cmssy/dev/ Next.js app structure for cmssy dev.
 * Copies static UI files from dev-app/ and generates dynamic config files.
 */
export function generateDevApp(
  projectRoot: string,
  resources: ScannedResource[],
): string {
  const devRoot = path.join(projectRoot, DEV_DIR);

  // Clean and recreate
  fs.removeSync(devRoot);
  fs.mkdirSync(devRoot, { recursive: true });

  // Copy static files (page.tsx, layout.tsx, API routes)
  copyDevAppFiles(devRoot);

  // Generate dynamic files (project-specific)
  generateNextConfig(devRoot, projectRoot);
  generateTsConfig(devRoot, projectRoot);
  generateGlobalsCss(devRoot, projectRoot);
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
