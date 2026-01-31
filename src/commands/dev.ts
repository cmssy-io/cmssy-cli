import chalk from "chalk";
import { exec } from "child_process";
import express from "express";
import fs from "fs-extra";
import { GraphQLClient } from "graphql-request";
import ora from "ora";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, ViteDevServer, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { loadBlockConfig, validateSchema as validateBlockSchema } from "../utils/block-config.js";
import { loadMetaCache, updateBlockInCache, BlocksMetaCache } from "../utils/blocks-meta-cache.js";
import { isTemplateConfig, TemplateConfig, TemplatePageBlueprint } from "../types/block-config.js";
import { loadConfig } from "../utils/cmssy-config.js";
import { loadConfig as loadEnvConfig } from "../utils/config.js";
import { getFieldTypes, FieldTypeDefinition } from "../utils/field-schema.js";
import { ScannedResource, scanResources } from "../utils/scanner.js";
import { generateTypes } from "../utils/type-generator.js";

// Custom plugin to resolve @import "main.css" to styles/main.css
function cmssyCssImportPlugin(projectRoot: string): Plugin {
  return {
    name: "cmssy-css-import",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith(".css")) {
        // Replace @import "main.css" with the content path
        if (code.includes('@import "main.css"') || code.includes("@import 'main.css'")) {
          const mainCssPath = path.join(projectRoot, "styles", "main.css");
          const mainCssContent = fs.readFileSync(mainCssPath, "utf-8");
          return code
            .replace('@import "main.css";', mainCssContent)
            .replace("@import 'main.css';", mainCssContent);
        }
      }
      return null;
    },
  };
}

// Merge default values from schema into preview data
// Preview data values take precedence over defaults
function mergeDefaultsWithPreview(
  schema: Record<string, any>,
  previewData: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...previewData };

  for (const [key, field] of Object.entries(schema)) {
    // If field is missing or undefined, use defaultValue
    if (merged[key] === undefined || merged[key] === null) {
      if (field.defaultValue !== undefined) {
        merged[key] = field.defaultValue;
      } else if (field.type === "repeater") {
        // Repeaters default to empty array if no defaultValue
        merged[key] = [];
      }
    }

    // For repeaters with items, merge nested defaults
    if (field.type === "repeater" && field.schema && Array.isArray(merged[key])) {
      merged[key] = (merged[key] as any[]).map((item: any) => {
        const mergedItem: Record<string, unknown> = { ...item };
        for (const [nestedKey, nestedField] of Object.entries(field.schema as Record<string, any>)) {
          // Add default value if missing
          if (mergedItem[nestedKey] === undefined && nestedField.defaultValue !== undefined) {
            mergedItem[nestedKey] = nestedField.defaultValue;
          }
        }
        return mergedItem;
      });
    }
  }

  return merged;
}

interface DevOptions {
  port: string;
}


export async function devCommand(options: DevOptions) {
  const spinner = ora("Starting development server...").start();

  try {
    const config = await loadConfig();
    const port = parseInt(options.port, 10);
    const projectRoot = process.cwd();

    // Scan for blocks and templates - FAST: no config loading at startup
    spinner.text = "Scanning blocks...";
    const resources = await scanResources({
      strict: false,
      loadConfig: false,  // Lazy load configs when needed
      validateSchema: false,
      loadPreview: false,  // Lazy load preview data
      requirePackageJson: false,
    });

    if (resources.length === 0) {
      spinner.warn("No blocks or templates found");
      console.log(chalk.yellow("\nCreate your first block:\n"));
      console.log(chalk.white("  npx cmssy create block my-block\n"));
      process.exit(0);
    }

    // Load metadata cache for instant filters
    spinner.text = "Loading metadata cache...";
    const metaCache = loadMetaCache(projectRoot);
    let cachedCount = 0;

    // Merge cached metadata into resources
    resources.forEach((r) => {
      const cached = metaCache.blocks[r.name];
      if (cached) {
        r.category = cached.category;
        r.displayName = cached.displayName || r.name;
        r.description = cached.description;
        // Store tags in a temp property for API
        (r as any).cachedTags = cached.tags;
        cachedCount++;
      }
    });

    if (cachedCount > 0) {
      spinner.text = `Loaded ${cachedCount} blocks from cache`;
    }

    // Fetch field types from backend (used for type generation)
    spinner.text = "Fetching field types...";
    let fieldTypes: FieldTypeDefinition[] = [];
    try {
      fieldTypes = await getFieldTypes();
    } catch (error) {
      // Will use fallback types if backend is unreachable
    }

    spinner.text = "Starting Vite server...";

    // Dev UI paths (must be before Vite config)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const devUiReactPath = path.join(__dirname, "../dev-ui-react");

    // Create Express app for API routes
    const app = express();
    app.use(express.json());

    // Create Vite server in middleware mode
    const vite = await createViteServer({
      root: projectRoot,
      server: {
        middlewareMode: true,
        hmr: { port: port + 1 },
        fs: {
          // Allow serving files from cmssy-cli package (dev-ui-react)
          allow: [projectRoot, path.dirname(__dirname)],
        },
      },
      appType: "custom",
      plugins: [cmssyCssImportPlugin(projectRoot), react()],
      resolve: {
        alias: [
          // React packages must resolve from user's project, not cmssy-cli
          { find: "react", replacement: path.join(projectRoot, "node_modules/react") },
          { find: "react-dom", replacement: path.join(projectRoot, "node_modules/react-dom") },
          { find: "@blocks", replacement: path.join(projectRoot, "blocks") },
          { find: "@templates", replacement: path.join(projectRoot, "templates") },
          { find: "@styles", replacement: path.join(projectRoot, "styles") },
          { find: "@lib", replacement: path.join(projectRoot, "lib") },
          // Handle relative imports to lib from any depth
          { find: /^(\.\.\/)+lib/, replacement: path.join(projectRoot, "lib") },
          // Serve dev UI React files from cmssy-cli package
          { find: /^\/dev-ui-react\/(.*)/, replacement: path.join(devUiReactPath, "$1") },
        ],
      },
      css: {
        postcss: {
          plugins: [tailwindcss()],
        },
      },
      optimizeDeps: {
        include: ["react", "react-dom", "framer-motion"],
      },
    });

    // API: Get all blocks (uses cache for instant filters)
    app.get("/api/blocks", (_req, res) => {
      const blockList = resources.map((r) => ({
        type: r.type,
        name: r.name,
        displayName: r.displayName || r.name,
        version: r.packageJson?.version || "1.0.0",
        // Use cached or loaded metadata
        category: r.blockConfig?.category || r.category || "other",
        tags: r.blockConfig?.tags || (r as any).cachedTags || [],
        description: r.blockConfig?.description || r.description,
        hasConfig: !!r.blockConfig,
      }));
      res.json(blockList);
    });

    // API: Lazy load block config (called when block is selected)
    app.get("/api/blocks/:name/config", async (req, res) => {
      const { name } = req.params;
      const resource = resources.find((r) => r.name === name);

      if (!resource) {
        res.status(404).json({ error: "Block not found" });
        return;
      }

      // Load config if not already loaded
      if (!resource.blockConfig) {
        try {
          const blockConfig = await loadBlockConfig(resource.path);
          if (blockConfig) {
            // Validate schema
            if (blockConfig.schema) {
              const validation = await validateBlockSchema(blockConfig.schema, resource.path);
              if (!validation.valid) {
                console.log(chalk.yellow(`\n⚠️  Schema warnings for ${name}:`));
                validation.errors.forEach((err) => console.log(chalk.yellow(`   • ${err}`)));
              }
            }
            resource.blockConfig = blockConfig;
            resource.displayName = blockConfig.name || resource.name;
            resource.description = blockConfig.description;
            resource.category = blockConfig.category;

            // Update metadata cache
            updateBlockInCache(
              name,
              resource.type,
              blockConfig,
              resource.packageJson?.version,
              projectRoot
            );
          }
        } catch (error: any) {
          console.log(chalk.red(`\n❌ Failed to load config for ${name}: ${error.message}`));
          res.status(500).json({ error: error.message });
          return;
        }
      }

      // Always load preview data fresh from file (don't use stale cache)
      const previewPath = path.join(resource.path, "preview.json");
      if (fs.existsSync(previewPath)) {
        resource.previewData = fs.readJsonSync(previewPath);
      } else {
        resource.previewData = {};
      }

      const cfg = resource.blockConfig;

      // Merge default values from schema into previewData (preview.json values take precedence)
      const mergedPreviewData = mergeDefaultsWithPreview(cfg?.schema || {}, resource.previewData || {});

      // Build response with template-specific fields if applicable
      const response: Record<string, unknown> = {
        name: resource.name,
        displayName: cfg?.name || resource.displayName || resource.name,
        description: cfg?.description || resource.description,
        category: cfg?.category || "other",
        tags: cfg?.tags || [],
        schema: cfg?.schema || {},
        previewData: mergedPreviewData,
        version: resource.packageJson?.version || "1.0.0",
      };

      // Add template-specific fields
      if (cfg && isTemplateConfig(cfg)) {
        response.pages = cfg.pages;
        response.layoutSlots = cfg.layoutSlots || [];
      }

      res.json(response);
    });

    // API: Get user's workspaces
    app.get("/api/workspaces", async (_req, res) => {
      try {
        const envConfig = loadEnvConfig();
        if (!envConfig.apiToken) {
          res.status(401).json({
            error: "API token not configured",
            message: "Run 'cmssy configure' to set up your API credentials",
          });
          return;
        }

        const client = new GraphQLClient(envConfig.apiUrl, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${envConfig.apiToken}`,
          },
        });

        const query = `
          query MyWorkspaces {
            myWorkspaces {
              id
              slug
              name
              myRole { name slug }
            }
          }
        `;

        const data: any = await client.request(query);
        res.json(data.myWorkspaces || []);
      } catch (error: any) {
        console.error("Failed to fetch workspaces:", error);
        res.status(500).json({
          error: "Failed to fetch workspaces",
          message: error.message || "Unknown error",
        });
      }
    });

    // API: Get preview data for a block (lazy loads if needed)
    app.get("/api/preview/:blockName", (req, res) => {
      const { blockName } = req.params;
      const resource = resources.find((r) => r.name === blockName);
      if (!resource) {
        res.status(404).json({ error: "Block not found" });
        return;
      }

      // Always load preview data fresh from file
      const previewPath = path.join(resource.path, "preview.json");
      if (fs.existsSync(previewPath)) {
        resource.previewData = fs.readJsonSync(previewPath);
      } else {
        resource.previewData = {};
      }

      res.json(resource.previewData);
    });

    // API: Save preview data for a block
    app.post("/api/preview/:blockName", (req, res) => {
      const { blockName } = req.params;
      const newPreviewData = req.body;
      const resource = resources.find((r) => r.name === blockName);

      if (!resource) {
        res.status(404).json({ error: "Block not found" });
        return;
      }

      resource.previewData = newPreviewData;
      const previewPath = path.join(resource.path, "preview.json");
      try {
        fs.writeJsonSync(previewPath, newPreviewData, { spaces: 2 });
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get published version from backend
    app.get("/api/blocks/:name/published-version", async (req, res) => {
      const { name } = req.params;
      const { workspaceId } = req.query;
      const resource = resources.find((r) => r.name === name);

      if (!resource) {
        res.status(404).json({ error: "Block not found" });
        return;
      }
      if (!workspaceId) {
        res.status(400).json({ error: "workspaceId is required" });
        return;
      }

      try {
        const envConfig = loadEnvConfig();
        if (!envConfig.apiToken) {
          res.json({ version: null, published: false });
          return;
        }

        const client = new GraphQLClient(envConfig.apiUrl, {
          headers: {
            Authorization: `Bearer ${envConfig.apiToken}`,
            "x-workspace-id": workspaceId as string,
          },
        });

        const packageName = resource.packageJson?.name || "";
        const blockType = packageName.split(".").pop() || name;

        const query = `
          query GetPublishedVersion($blockType: String!) {
            workspaceBlockByType(blockType: $blockType) { version }
          }
        `;

        const data: any = await client.request(query, { blockType });
        const publishedVersion = data.workspaceBlockByType?.version || null;
        res.json({ version: publishedVersion, published: publishedVersion !== null });
      } catch (error: any) {
        res.json({ version: null, published: false, error: error.message });
      }
    });

    // API: Get block publish status
    app.get("/api/blocks/:name/status", (req, res) => {
      const { name } = req.params;
      const resource = resources.find((r) => r.name === name);

      if (!resource) {
        res.status(404).json({ error: "Block not found" });
        return;
      }

      res.json({
        name: resource.name,
        version: resource.packageJson?.version || "1.0.0",
        packageName: resource.packageJson?.name || `@local/${resource.type}s.${resource.name}`,
        published: false,
        lastPublished: null,
      });
    });

    // API: Publish block
    app.post("/api/blocks/:name/publish", async (req, res) => {
      const { name } = req.params;
      const { target, workspaceId, versionBump } = req.body;
      const resource = resources.find((r) => r.name === name);

      if (!resource) {
        res.status(404).json({ error: "Block not found" });
        return;
      }

      if (!target || (target !== "marketplace" && target !== "workspace")) {
        res.status(400).json({ error: "Invalid target" });
        return;
      }

      if (target === "workspace" && !workspaceId) {
        res.status(400).json({ error: "Workspace ID required" });
        return;
      }

      const args = ["publish", resource.name, `--${target}`];
      if (target === "workspace" && workspaceId) args.push(workspaceId);
      if (versionBump && versionBump !== "none") {
        args.push(`--${versionBump}`);
      } else {
        args.push("--no-bump");
      }

      const command = `cmssy ${args.join(" ")}`;
      console.log("[PUBLISH] Executing:", command);

      exec(command, {
        cwd: projectRoot,
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, CI: "true", FORCE_COLOR: "0", NO_COLOR: "1" },
      }, (error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`;
        const success = output.includes("published successfully") ||
          output.includes("published to workspace") ||
          output.includes("submitted for review");

        if (success) {
          const pkgPath = path.join(resource.path, "package.json");
          if (fs.existsSync(pkgPath)) {
            resource.packageJson = fs.readJsonSync(pkgPath);
          }
          res.json({
            success: true,
            message: target === "marketplace" ? "Submitted for review" : "Published to workspace",
            version: resource.packageJson?.version,
          });
        } else {
          res.status(500).json({ success: false, error: stderr || error?.message || "Publish failed" });
        }
      });
    });

    // API: List resources (legacy)
    app.get("/api/resources", (_req, res) => {
      res.json(resources.map((r) => ({
        type: r.type,
        name: r.name,
        displayName: r.displayName,
        description: r.description,
        category: r.category,
      })));
    });

    // API: Get template pages (for template preview)
    app.get("/api/templates/:name/pages", async (req, res) => {
      const { name } = req.params;
      const resource = resources.find((r) => r.name === name && r.type === "template");

      if (!resource) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      // Lazy load config if needed
      if (!resource.blockConfig) {
        try {
          const blockConfig = await loadBlockConfig(resource.path);
          if (blockConfig) {
            resource.blockConfig = blockConfig;
          }
        } catch (error: any) {
          res.status(500).json({ error: error.message });
          return;
        }
      }

      const config = resource.blockConfig as TemplateConfig;
      if (!config || !isTemplateConfig(config)) {
        res.status(400).json({ error: "Not a valid template (missing pages)" });
        return;
      }

      res.json({
        name: resource.name,
        displayName: config.name || resource.name,
        pages: config.pages.map((p) => ({
          name: p.name,
          slug: p.slug,
          blocksCount: p.blocks.length,
        })),
        layoutSlots: config.layoutSlots || [],
      });
    });

    // Template page preview - renders full page with all blocks
    app.get("/preview/template/:name/:pageSlug?", async (req, res) => {
      const { name, pageSlug } = req.params;
      const resource = resources.find((r) => r.name === name && r.type === "template");

      if (!resource) {
        res.status(404).send("Template not found");
        return;
      }

      // Lazy load config if needed
      if (!resource.blockConfig) {
        try {
          const blockConfig = await loadBlockConfig(resource.path);
          if (blockConfig) {
            resource.blockConfig = blockConfig;
          }
        } catch (error: any) {
          res.status(500).send(`Failed to load template: ${error.message}`);
          return;
        }
      }

      const templateConfig = resource.blockConfig as TemplateConfig;
      if (!templateConfig || !isTemplateConfig(templateConfig)) {
        res.status(400).send("Not a valid template (missing pages)");
        return;
      }

      // Find page (default to first page)
      const page = pageSlug
        ? templateConfig.pages.find((p) => p.slug === pageSlug)
        : templateConfig.pages[0];

      if (!page) {
        res.status(404).send(`Page "${pageSlug}" not found in template`);
        return;
      }

      const html = generateTemplatePreviewHTML(resource, templateConfig, page, resources, port);
      const transformed = await vite.transformIndexHtml(req.url, html);
      res.send(transformed);
    });

    // Preview page - serves HTML that loads block via Vite
    app.get("/preview/:name", async (req, res) => {
      const { name } = req.params;
      const resource = resources.find((r) => r.name === name);

      if (!resource) {
        res.status(404).send("Resource not found");
        return;
      }

      // Always load preview data fresh from file
      const previewPath = path.join(resource.path, "preview.json");
      if (fs.existsSync(previewPath)) {
        resource.previewData = fs.readJsonSync(previewPath);
      } else {
        resource.previewData = {};
      }

      const html = generatePreviewHTML(resource, config, port);
      const transformed = await vite.transformIndexHtml(req.url, html);
      res.send(transformed);
    });

    // Legacy preview route
    app.get("/preview/:type/:name", async (req, res) => {
      const { name } = req.params;
      const resource = resources.find((r) => r.name === name);

      if (!resource) {
        res.status(404).send("Resource not found");
        return;
      }

      // Always load preview data fresh from file
      const previewPath2 = path.join(resource.path, "preview.json");
      if (fs.existsSync(previewPath2)) {
        resource.previewData = fs.readJsonSync(previewPath2);
      } else {
        resource.previewData = {};
      }

      const html = generatePreviewHTML(resource, config, port);
      const transformed = await vite.transformIndexHtml(req.url, html);
      res.send(transformed);
    });

    // Home page - serve React dev UI
    app.get("/", async (req, res) => {
      const indexPath = path.join(devUiReactPath, "index.html");
      let html = fs.readFileSync(indexPath, "utf-8");

      // Transform HTML through Vite for HMR support
      html = await vite.transformIndexHtml(req.url, html);
      res.send(html);
    });

    // Use Vite's middleware for JS/TS/CSS transforms (handles /dev-ui-react/ via alias)
    app.use(vite.middlewares);

    // Start server
    const server = app.listen(port, () => {
      spinner.succeed("Development server started (Vite)");
      console.log(chalk.green.bold("\n─────────────────────────────────────────"));
      console.log(chalk.green.bold("   Cmssy Dev Server (Vite HMR)"));
      console.log(chalk.green.bold("─────────────────────────────────────────\n"));

      const blocks = resources.filter((r) => r.type === "block");
      const templates = resources.filter((r) => r.type === "template");

      console.log(chalk.cyan(`   ${blocks.length} blocks, ${templates.length} templates`));
      console.log(chalk.green(`\n   Local:   ${chalk.cyan(`http://localhost:${port}`)}`));
      console.log(chalk.green("   Vite HMR enabled ✓"));
      console.log(chalk.green("   Press Ctrl+C to stop"));
      console.log(chalk.green.bold("\n─────────────────────────────────────────\n"));

      // Listen for Ctrl+C directly on stdin (works even if SIGINT is blocked)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("data", (data) => {
          // Ctrl+C = \x03, Ctrl+D = \x04
          if (data[0] === 0x03 || data[0] === 0x04) {
            console.log(chalk.yellow("\n\nShutting down..."));
            process.exit(0);
          }
        });
      }

      // Also register SIGINT as fallback
      process.removeAllListeners("SIGINT");
      process.on("SIGINT", () => {
        console.log(chalk.yellow("\n\nShutting down..."));
        process.exit(0);
      });
    });

    // Watch for new blocks/config changes
    setupConfigWatcher({ resources, vite, fieldTypes });

  } catch (error) {
    spinner.fail("Failed to start development server");
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}

interface ConfigWatcherOptions {
  resources: ScannedResource[];
  vite: ViteDevServer;
  fieldTypes: FieldTypeDefinition[];
}

function setupConfigWatcher(options: ConfigWatcherOptions) {
  const { resources, vite, fieldTypes } = options;
  const projectRoot = process.cwd();

  // Watch for block.config.ts changes to regenerate types
  vite.watcher.on("change", async (filePath) => {
    if (filePath.endsWith("block.config.ts")) {
      const relativePath = path.relative(projectRoot, filePath);
      const parts = relativePath.split(path.sep);
      const resourceName = parts[1]; // blocks/hero/block.config.ts -> hero

      const resource = resources.find((r) => r.name === resourceName);
      if (resource) {
        console.log(chalk.blue(`\n⚙️  Config changed: ${resourceName}`));
        try {
          const blockConfig = await loadBlockConfig(resource.path);
          if (blockConfig) {
            // Validate schema and show errors
            if (blockConfig.schema) {
              const validation = await validateBlockSchema(blockConfig.schema, resource.path);
              if (!validation.valid) {
                console.log(chalk.red(`\n❌ Schema validation errors in ${resourceName}:`));
                validation.errors.forEach((err) => {
                  console.log(chalk.red(`   • ${err}`));
                });
                console.log(chalk.yellow(`\nFix the errors above in block.config.ts\n`));
              }
            }

            resource.blockConfig = blockConfig;
            resource.displayName = blockConfig.name || resource.name;
            resource.description = blockConfig.description;
            resource.category = blockConfig.category;
            if (blockConfig.schema) {
              await generateTypes({
                blockPath: resource.path,
                schema: blockConfig.schema,
                fieldTypes,
              });
            }

            // Update metadata cache
            updateBlockInCache(
              resourceName,
              resource.type,
              blockConfig,
              resource.packageJson?.version
            );

            console.log(chalk.green(`✓ Types regenerated for ${resourceName}\n`));
          }
        } catch (error: any) {
          console.log(chalk.red(`\n❌ Failed to load config for ${resourceName}:`));
          console.log(chalk.red(`   ${error.message}\n`));
          // Show hint for common errors
          if (error.message.includes('SyntaxError') || error.message.includes('Unexpected')) {
            console.log(chalk.yellow(`   Hint: Check for syntax errors in block.config.ts\n`));
          }
        }
      }
    }

    // Watch for new package.json (new block detection)
    if (filePath.endsWith("package.json") && !filePath.includes("node_modules")) {
      const relativePath = path.relative(projectRoot, filePath);
      const parts = relativePath.split(path.sep);

      if ((parts[0] === "blocks" || parts[0] === "templates") && parts.length === 3) {
        const resourceName = parts[1];
        if (!resources.find((r) => r.name === resourceName)) {
          console.log(chalk.green(`\n✨ New block detected: ${resourceName}`));
          // Re-scan resources
          try {
            const newResources = await scanResources({
              strict: false,
              loadConfig: true,
              validateSchema: true,
              loadPreview: true,
              requirePackageJson: true,
            });
            const newResource = newResources.find((r) => r.name === resourceName);
            if (newResource) {
              resources.push(newResource);
              console.log(chalk.green(`✓ ${resourceName} added\n`));
            }
          } catch (error) {
            console.error(chalk.red(`Failed to scan new block ${resourceName}:`), error);
          }
        }
      }
    }
  });
}

function generatePreviewHTML(resource: ScannedResource, config: any, port: number): string {
  const blockPath = `/${resource.type}s/${resource.name}/src/index.tsx`;
  const cssPath = `/${resource.type}s/${resource.name}/src/index.css`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${resource.displayName} - Preview</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23667eea'/%3E%3Ctext x='50' y='70' font-size='60' font-weight='bold' text-anchor='middle' fill='white' font-family='system-ui'%3EC%3C/text%3E%3C/svg%3E">
  <script type="module" src="/@vite/client"></script>
  <link rel="stylesheet" href="${cssPath}">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .preview-header {
      position: fixed; top: 0; left: 0; right: 0;
      background: white; border-bottom: 1px solid #e0e0e0;
      padding: 1rem 2rem; z-index: 1000;
      display: flex; justify-content: space-between; align-items: center;
    }
    .preview-title { font-size: 1.25rem; font-weight: 600; margin: 0; }
    .preview-back { color: #667eea; text-decoration: none; font-weight: 500; }
    .preview-container { margin-top: 60px; min-height: calc(100vh - 60px); }
  </style>
</head>
<body>
  <div class="preview-header">
    <div class="preview-title">${resource.displayName}</div>
    <a href="/" class="preview-back" target="_parent">← Back to Home</a>
  </div>
  <div class="preview-container">
    <div id="preview-root"></div>
  </div>

  <script type="module">
    import module from '${blockPath}';
    const element = document.getElementById('preview-root');
    let props = ${JSON.stringify(resource.previewData || {})};
    let context = module.mount(element, props);

    // Listen for prop updates from parent
    window.addEventListener('message', (event) => {
      if (event.data.type === 'UPDATE_PROPS') {
        props = event.data.props;
        if (module.update && context) {
          module.update(element, props, context);
        } else {
          if (context && module.unmount) module.unmount(element, context);
          context = module.mount(element, props);
        }
      }
    });

    // Vite HMR
    if (import.meta.hot) {
      import.meta.hot.accept('${blockPath}', (newModule) => {
        if (newModule) {
          console.log('🔄 HMR update');
          if (context && module.unmount) module.unmount(element, context);
          context = newModule.default.mount(element, props);
        }
      });
    }
  </script>
</body>
</html>
  `;
}

function generateTemplatePreviewHTML(
  resource: ScannedResource,
  templateConfig: TemplateConfig,
  page: TemplatePageBlueprint,
  allResources: ScannedResource[],
  port: number
): string {
  // Find all blocks used in this page
  const blockImports: string[] = [];
  const blockMounts: string[] = [];

  // Generate imports and mounts for each block in the page
  page.blocks.forEach((blockInstance, index) => {
    // Block type can be "hero" or "@vendor/blocks.hero" - extract the block name
    const blockName = blockInstance.type.includes('.')
      ? blockInstance.type.split('.').pop()!
      : blockInstance.type;

    // Find the block resource
    const blockResource = allResources.find(
      (r) => r.type === "block" && r.name === blockName
    );

    if (blockResource) {
      const blockPath = `/blocks/${blockName}/src/index.tsx`;
      const cssPath = `/blocks/${blockName}/src/index.css`;
      const varName = `block_${index}`;
      const containerId = `block-${index}`;

      blockImports.push(`import ${varName} from '${blockPath}';`);
      blockImports.push(`import '${cssPath}';`);

      const props = JSON.stringify(blockInstance.content || {});
      blockMounts.push(`
        {
          const el = document.getElementById('${containerId}');
          if (el && ${varName}.mount) {
            ${varName}.mount(el, ${props});
          }
        }
      `);
    }
  });

  // Generate layout slot imports/mounts
  const layoutSlots = templateConfig.layoutSlots || [];
  const headerSlot = layoutSlots.find((s) => s.slot === "header");
  const footerSlot = layoutSlots.find((s) => s.slot === "footer");

  if (headerSlot) {
    const blockName = headerSlot.type.includes('.')
      ? headerSlot.type.split('.').pop()!
      : headerSlot.type;
    const blockResource = allResources.find(
      (r) => r.type === "block" && r.name === blockName
    );
    if (blockResource) {
      blockImports.push(`import headerBlock from '/blocks/${blockName}/src/index.tsx';`);
      blockImports.push(`import '/blocks/${blockName}/src/index.css';`);
      blockMounts.push(`
        {
          const el = document.getElementById('layout-header');
          if (el && headerBlock.mount) {
            headerBlock.mount(el, ${JSON.stringify(headerSlot.content || {})});
          }
        }
      `);
    }
  }

  if (footerSlot) {
    const blockName = footerSlot.type.includes('.')
      ? footerSlot.type.split('.').pop()!
      : footerSlot.type;
    const blockResource = allResources.find(
      (r) => r.type === "block" && r.name === blockName
    );
    if (blockResource) {
      blockImports.push(`import footerBlock from '/blocks/${blockName}/src/index.tsx';`);
      blockImports.push(`import '/blocks/${blockName}/src/index.css';`);
      blockMounts.push(`
        {
          const el = document.getElementById('layout-footer');
          if (el && footerBlock.mount) {
            footerBlock.mount(el, ${JSON.stringify(footerSlot.content || {})});
          }
        }
      `);
    }
  }

  // Generate page navigation tabs
  const pageTabs = templateConfig.pages.map((p) => {
    const isActive = p.slug === page.slug;
    return `<a href="/preview/template/${resource.name}/${p.slug}" class="page-tab ${isActive ? 'active' : ''}">${p.name}</a>`;
  }).join('');

  // Generate block containers HTML
  const blockContainers = page.blocks.map((_, index) => {
    return `<div id="block-${index}" class="template-block"></div>`;
  }).join('\n      ');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${templateConfig.name} - ${page.name}</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23667eea'/%3E%3Ctext x='50' y='70' font-size='60' font-weight='bold' text-anchor='middle' fill='white' font-family='system-ui'%3EC%3C/text%3E%3C/svg%3E">
  <script type="module" src="/@vite/client"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    .template-header {
      position: fixed; top: 0; left: 0; right: 0;
      background: #1a1a2e; color: white;
      padding: 0.75rem 1.5rem; z-index: 1000;
      display: flex; justify-content: space-between; align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .template-header-left {
      display: flex; align-items: center; gap: 1.5rem;
    }
    .template-title {
      font-size: 1rem; font-weight: 600; margin: 0;
      display: flex; align-items: center; gap: 0.5rem;
    }
    .template-badge {
      background: #667eea; color: white;
      padding: 0.15rem 0.5rem; border-radius: 4px;
      font-size: 0.7rem; font-weight: 500;
    }
    .page-tabs {
      display: flex; gap: 0.25rem;
    }
    .page-tab {
      color: rgba(255,255,255,0.7); text-decoration: none;
      padding: 0.4rem 0.75rem; border-radius: 6px;
      font-size: 0.85rem; font-weight: 500;
      transition: all 0.2s;
    }
    .page-tab:hover { color: white; background: rgba(255,255,255,0.1); }
    .page-tab.active { color: white; background: #667eea; }

    .template-back {
      color: rgba(255,255,255,0.8); text-decoration: none;
      font-size: 0.85rem; font-weight: 500;
      padding: 0.4rem 0.75rem; border-radius: 6px;
      transition: all 0.2s;
    }
    .template-back:hover { color: white; background: rgba(255,255,255,0.1); }

    .template-content {
      margin-top: 52px;
      min-height: calc(100vh - 52px);
    }
    .template-block {
      /* Blocks render their own styles */
    }
    #layout-header, #layout-footer {
      /* Layout slots */
    }

    .block-error {
      padding: 2rem;
      background: #fff3cd;
      border: 1px solid #ffc107;
      color: #856404;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="template-header">
    <div class="template-header-left">
      <h1 class="template-title">
        <span class="template-badge">Template</span>
        ${templateConfig.name}
      </h1>
      <div class="page-tabs">
        ${pageTabs}
      </div>
    </div>
    <a href="/" class="template-back" target="_parent">← Back to Dev</a>
  </div>

  <div class="template-content">
    ${headerSlot ? '<div id="layout-header"></div>' : ''}
    <main>
      ${blockContainers || '<div class="block-error">No blocks defined for this page</div>'}
    </main>
    ${footerSlot ? '<div id="layout-footer"></div>' : ''}
  </div>

  <script type="module">
    ${blockImports.join('\n    ')}

    // Mount all blocks
    ${blockMounts.join('\n    ')}
  </script>
</body>
</html>
  `;
}
