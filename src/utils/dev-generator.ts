import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import type { ScannedResource } from "./scanner.js";

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

// ============================================================================
// File Generators
// ============================================================================

function generateNextConfig(devRoot: string, projectRoot: string) {
  const rel = path.relative(devRoot, projectRoot);
  const content = `import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: resolve(__dirname, "${rel}"),
  },

  allowedDevOrigins: ['*'],

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
`;
  fs.writeFileSync(path.join(devRoot, "next.config.mjs"), content);
}

function generateTsConfig(devRoot: string, projectRoot: string) {
  // Paths must be relative to tsconfig location (.cmssy/dev/)
  const rel = path.relative(devRoot, projectRoot);

  // Read project tsconfig to forward user-defined path aliases and includes
  const projectTsConfigPath = path.join(projectRoot, "tsconfig.json");
  let userPaths: Record<string, string[]> = {};
  let userIncludes: string[] = [];
  if (fs.existsSync(projectTsConfigPath)) {
    try {
      const projectTsConfig = JSON.parse(
        fs.readFileSync(projectTsConfigPath, "utf-8"),
      );
      const rawPaths = projectTsConfig.compilerOptions?.paths || {};
      // Re-map user paths relative to .cmssy/dev/ (project tsconfig uses baseUrl: ".")
      for (const [alias, targets] of Object.entries(rawPaths) as [string, string[]][]) {
        // Skip cmssy-cli/config — we handle it ourselves
        if (alias === "cmssy-cli/config") continue;
        userPaths[alias] = targets.map((t) => `${rel}/${t}`);
      }
      // Re-map user includes relative to .cmssy/dev/
      const rawIncludes = projectTsConfig.include || [];
      userIncludes = rawIncludes.map((inc: string) => `${rel}/${inc}`);
    } catch {
      // Ignore parse errors — fall back to defaults
    }
  }

  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: {
        // User-defined aliases from project tsconfig (e.g. @/* for shadcn)
        ...userPaths,
        // Cmssy built-in aliases (override user if conflicting)
        "@blocks/*": [`${rel}/blocks/*`],
        "@templates/*": [`${rel}/templates/*`],
        "@styles/*": [`${rel}/styles/*`],
        "@lib/*": [`${rel}/lib/*`],
        "cmssy-cli/config": [`${rel}/node_modules/cmssy-cli/config`],
      },
    },
    include: [
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts",
      `${rel}/blocks/**/*.ts`,
      `${rel}/blocks/**/*.tsx`,
      `${rel}/templates/**/*.ts`,
      `${rel}/templates/**/*.tsx`,
      // User-defined includes from project tsconfig (e.g. components/**/*, lib/**/*)
      ...userIncludes,
    ],
    exclude: ["node_modules"],
  };

  fs.writeFileSync(
    path.join(devRoot, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2) + "\n",
  );
}

function generateRootLayout(devRoot: string) {
  const content = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cmssy Dev Server",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23667eea'/%3E%3Ctext x='50' y='70' font-size='60' font-weight='bold' text-anchor='middle' fill='white' font-family='system-ui'%3EC%3C/text%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
  fs.writeFileSync(path.join(devRoot, "app/layout.tsx"), content);
}

function generateGlobalsCss(devRoot: string, projectRoot: string) {
  const rel = path.relative(path.join(devRoot, "app"), projectRoot);

  // Check for project CSS files that contain Tailwind / theme
  const cssFiles = ["styles/main.css", "styles/globals.css", "app/globals.css"];
  const projectCssFile = cssFiles.find((f) =>
    fs.existsSync(path.join(projectRoot, f))
  );

  // Import the project's main CSS (Tailwind + theme) if it exists
  const projectCssImport = projectCssFile
    ? `@import "${rel}/${projectCssFile}";\n\n`
    : "";

  const content = `${projectCssImport}*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
`;
  fs.writeFileSync(path.join(devRoot, "app/globals.css"), content);
}

function generateHomePage(devRoot: string) {
  // The home page embeds the dev UI as a client component
  // It uses an iframe-based architecture: left sidebar (block list),
  // center (preview iframe), right sidebar (editor)
  const content = `"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Block {
  type: "block" | "template";
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  tags?: string[];
  version: string;
  hasConfig?: boolean;
  schema?: Record<string, any>;
  pages?: Array<{ name: string; slug: string; blocksCount: number }>;
  layoutPositions?: Array<{ position: string; type: string }>;
}

export default function DevHome() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selected, setSelected] = useState<Block | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const configDataRef = useRef<Record<string, unknown>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showBlockList, setShowBlockList] = useState(true);
  const [showEditor, setShowEditor] = useState(true);

  // Load blocks list
  useEffect(() => {
    fetch("/api/blocks")
      .then((r) => r.json())
      .then(setBlocks)
      .catch(console.error);
  }, []);

  // Load config when block selected
  useEffect(() => {
    if (!selected || selected.type === "template") return;
    setConfigLoading(true);
    fetch(\`/api/blocks/\${selected.name}/config\`)
      .then((r) => r.json())
      .then((config) => {
        setSelected((prev) =>
          prev ? { ...prev, schema: config.schema } : null
        );
        const data = config.previewData || {};
        configDataRef.current = data;
        setPreviewData(data);
        setConfigLoading(false);
      })
      .catch(() => setConfigLoading(false));
  }, [selected?.name]);

  // Select block — templates redirect to full-page preview
  const handleSelect = useCallback((block: Block) => {
    if (block.type === "template") {
      window.location.href = \`/preview/\${block.name}\`;
      return;
    }
    setSelected(block);
    setPreviewData({});
    configDataRef.current = {};
    setIsDirty(false);
    iframeLoadedRef.current = false;
  }, []);

  // Send props to iframe
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !iframeLoadedRef.current) return;
    if (!previewData || Object.keys(previewData).length === 0) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "UPDATE_PROPS", props: previewData },
      "*"
    );
  }, [previewData]);

  // Auto-save preview data
  useEffect(() => {
    if (!isDirty || !selected || Object.keys(configDataRef.current).length === 0) return;
    const t = setTimeout(async () => {
      const dataToSave = { ...configDataRef.current, ...previewData };
      await fetch(\`/api/preview/\${selected.name}\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });
      setIsDirty(false);
    }, 500);
    return () => clearTimeout(t);
  }, [previewData, selected, isDirty]);

  // URL state
  useEffect(() => {
    if (blocks.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const name = params.get("block") || params.get("template");
    if (name) {
      const b = blocks.find((x) => x.name === name);
      if (b) handleSelect(b);
    }
  }, [blocks, handleSelect]);

  const previewUrl = selected ? \`/preview/\${selected.name}\` : null;

  function renderField(field: any, value: any, onChange: (val: any) => void) {
    if (field.type === "multiLine" || field.type === "richText") {
      return (
        <textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px", minHeight: "60px", resize: "vertical", fontFamily: "inherit" }}
        />
      );
    }
    if (field.type === "boolean") {
      return (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
      );
    }
    if (field.type === "select") {
      return (
        <select
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px" }}
        >
          <option value="">Select...</option>
          {field.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (field.type === "multiselect") {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div style={{ border: "1px solid #ddd", borderRadius: "4px", padding: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {field.options?.map((opt: any) => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.value]
                    : selected.filter((v: string) => v !== opt.value);
                  onChange(next);
                }}
              />
              {opt.label}
            </label>
          ))}
          {!field.options?.length && <span style={{ color: "#999", fontSize: "12px" }}>No options defined</span>}
        </div>
      );
    }
    if (field.type === "date") {
      return (
        <input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px" }}
        />
      );
    }
    if (field.type === "slider") {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const step = field.step ?? 1;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value ?? min}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: "13px", fontWeight: 500, minWidth: "32px", textAlign: "right" }}>{value ?? min}</span>
        </div>
      );
    }
    if (field.type === "media") {
      return (
        <div>
          {value && (
            <div style={{ marginBottom: "6px", borderRadius: "4px", overflow: "hidden", border: "1px solid #ddd" }}>
              <img src={value as string} alt="" style={{ maxWidth: "100%", maxHeight: "120px", objectFit: "contain", display: "block" }} />
            </div>
          )}
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Image URL"
            style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px" }}
          />
        </div>
      );
    }
    if (field.type === "repeater" && field.schema) {
      const items = (Array.isArray(value) ? value : []) as any[];
      return (
        <div style={{ border: "1px solid #ddd", borderRadius: "6px", overflow: "hidden" }}>
          {items.map((item: any, idx: number) => (
            <div key={idx} style={{ padding: "12px", borderBottom: "1px solid #eee", background: idx % 2 === 0 ? "#fafafa" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#888" }}>#{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => {
                    const newItems = [...items];
                    newItems.splice(idx, 1);
                    onChange(newItems);
                  }}
                  style={{ fontSize: "11px", color: "#e53935", background: "none", border: "none", cursor: "pointer" }}
                >&times; Remove</button>
              </div>
              {Object.entries(field.schema).map(([subKey, subField]: [string, any]) => (
                <div key={subKey} style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 500, marginBottom: "4px", color: "#666" }}>
                    {subField.label || subKey}
                  </label>
                  {renderField(subField, item[subKey], (subVal) => {
                    const newItems = [...items];
                    newItems[idx] = { ...newItems[idx], [subKey]: subVal };
                    onChange(newItems);
                  })}
                </div>
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const newItem: any = {};
              Object.entries(field.schema).forEach(([k, f]: [string, any]) => {
                newItem[k] = (f as any).type === "repeater" ? [] : "";
              });
              onChange([...items, newItem]);
            }}
            style={{ width: "100%", padding: "10px", fontSize: "13px", color: "#667eea", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
          >+ Add item</button>
        </div>
      );
    }
    // singleLine, link, numeric, color, form, emailTemplate, emailConfiguration, pageSelector
    return (
      <input
        type={field.type === "numeric" ? "number" : field.type === "color" ? "color" : field.type === "link" ? "url" : "text"}
        value={(value as string) || ""}
        onChange={(e) => onChange(field.type === "numeric" ? Number(e.target.value) : e.target.value)}
        placeholder={field.placeholder || (field.type === "link" ? "https://..." : field.type === "form" || field.type === "emailTemplate" || field.type === "emailConfiguration" || field.type === "pageSelector" ? "Enter ID..." : "")}
        style={{ width: "100%", padding: "8px", border: "1px solid #ddd", borderRadius: "4px", fontSize: "13px" }}
      />
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: \`\${showBlockList ? "280px" : "0px"} 1fr \${showEditor ? "400px" : "0px"}\`, height: "100vh", transition: "grid-template-columns 0.2s ease" }}>
      {/* Block List */}
      <div style={{ background: "#fff", borderRight: showBlockList ? "1px solid #e0e0e0" : "none", overflow: showBlockList ? "auto" : "hidden", width: showBlockList ? "auto" : 0 }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #e0e0e0", background: "#fafafa" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Cmssy Dev</h1>
          <p style={{ fontSize: "13px", color: "#666", margin: "4px 0 0" }}>
            {blocks.length} blocks
          </p>
        </div>
        <div style={{ padding: "12px" }}>
          {blocks.map((b) => (
            <div
              key={b.name}
              onClick={() => {
                handleSelect(b);
                const url = new URL(window.location.href);
                url.searchParams.set(b.type === "template" ? "template" : "block", b.name);
                window.history.replaceState({}, "", url.toString());
              }}
              style={{
                padding: "12px 16px",
                marginBottom: "4px",
                borderRadius: "8px",
                cursor: "pointer",
                background: selected?.name === b.name ? "#667eea" : "transparent",
                color: selected?.name === b.name ? "white" : "inherit",
              }}
            >
              <div style={{ fontSize: "14px", fontWeight: 500 }}>{b.displayName}</div>
              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                {b.type} &middot; v{b.version}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div style={{ background: "#fafafa", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 16px", background: "white", borderBottom: "1px solid #e0e0e0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <button
            type="button"
            onClick={() => setShowBlockList(!showBlockList)}
            title={showBlockList ? "Hide block list" : "Show block list"}
            style={{ background: showBlockList ? "#f0f0f0" : "#667eea", color: showBlockList ? "#333" : "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap" }}
          >{showBlockList ? "\u2190 Blocks" : "\u2192 Blocks"}</button>
          <div style={{ flex: 1, fontSize: "16px", fontWeight: 600, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected?.displayName || "Preview"}
          </div>
          <button
            type="button"
            onClick={() => setShowEditor(!showEditor)}
            title={showEditor ? "Hide editor" : "Show editor"}
            style={{ background: showEditor ? "#f0f0f0" : "#667eea", color: showEditor ? "#333" : "#fff", border: "1px solid #ddd", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap" }}
          >{showEditor ? "Editor \u2192" : "Editor \u2190"}</button>
        </div>
        <div style={{ flex: 1, padding: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {previewUrl ? (
            <div style={{ width: "100%", height: "100%", background: "white", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden" }}>
              <iframe
                ref={iframeRef}
                src={previewUrl}
                key={previewUrl}
                onLoad={() => { iframeLoadedRef.current = true; }}
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#999" }}>
              <p>Select a block to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div style={{ background: "#fff", borderLeft: showEditor ? "1px solid #e0e0e0" : "none", overflow: showEditor ? "auto" : "hidden", width: showEditor ? "auto" : 0 }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #e0e0e0", background: "#fafafa" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Editor</h2>
        </div>
        <div style={{ padding: "20px" }}>
          {!selected && <p style={{ color: "#999" }}>Select a block to edit</p>}
          {selected && configLoading && <p style={{ color: "#999" }}>Loading...</p>}
          {selected && !configLoading && selected.schema && (
            <div>
              {Object.entries(selected.schema).map(([key, field]: [string, any]) => (
                <div key={key} style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
                    {field.label || key}
                    {field.required && <span style={{ color: "#e53935" }}> *</span>}
                  </label>
                  {renderField(field, previewData[key], (val) => {
                    setPreviewData({ ...previewData, [key]: val });
                    setIsDirty(true);
                  })}
                  {field.helpText && (
                    <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>{field.helpText}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
`;
  fs.writeFileSync(path.join(devRoot, "app/page.tsx"), content);
}

function generateBlocksApiRoute(devRoot: string) {
  const content = `import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Project root is passed via env var set by cmssy dev
const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

export async function GET() {
  const blocks: any[] = [];

  // Scan blocks/
  const blocksDir = path.join(projectRoot, "blocks");
  if (fs.existsSync(blocksDir)) {
    const dirs = fs.readdirSync(blocksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const pkgPath = path.join(blocksDir, dir.name, "package.json");
      const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")) : {};
      blocks.push({
        type: "block",
        name: dir.name,
        displayName: pkg.cmssy?.displayName || dir.name,
        version: pkg.version || "1.0.0",
        category: pkg.cmssy?.category || "other",
        tags: pkg.cmssy?.tags || [],
        description: pkg.description || "",
        hasConfig: fs.existsSync(path.join(blocksDir, dir.name, "block.config.ts")),
      });
    }
  }

  // Scan templates/
  const templatesDir = path.join(projectRoot, "templates");
  if (fs.existsSync(templatesDir)) {
    const dirs = fs.readdirSync(templatesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const dir of dirs) {
      const pkgPath = path.join(templatesDir, dir.name, "package.json");
      const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")) : {};
      blocks.push({
        type: "template",
        name: dir.name,
        displayName: pkg.cmssy?.displayName || dir.name,
        version: pkg.version || "1.0.0",
        category: pkg.cmssy?.category || "pages",
        tags: pkg.cmssy?.tags || [],
        description: pkg.description || "",
        hasConfig: fs.existsSync(path.join(templatesDir, dir.name, "block.config.ts")),
      });
    }
  }

  return NextResponse.json(blocks);
}
`;
  fs.mkdirSync(path.join(devRoot, "app/api/blocks"), { recursive: true });
  fs.writeFileSync(path.join(devRoot, "app/api/blocks/route.ts"), content);
}

function generateBlockConfigApiRoute(devRoot: string) {
  const dir = path.join(devRoot, "app/api/blocks/[name]/config");
  fs.mkdirSync(dir, { recursive: true });

  const content = `import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

function loadBlockConfig(blockPath: string): Record<string, unknown> | null {
  const configPath = path.join(blockPath, "block.config.ts");
  if (!fs.existsSync(configPath)) return null;

  try {
    // Find tsx binary
    const tsxPaths = [
      path.join(projectRoot, "node_modules", ".bin", "tsx"),
      path.join(projectRoot, "node_modules", "cmssy-cli", "node_modules", ".bin", "tsx"),
    ];
    const tsxBinary = tsxPaths.find((p) => fs.existsSync(p)) || "npx -y tsx";

    // Create mock cmssy-cli/config module
    const cacheDir = path.join(projectRoot, ".cmssy", "cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    const mockConfigPath = path.join(cacheDir, "cmssy-cli-config.mjs");
    fs.writeFileSync(mockConfigPath,
      "export const defineBlock = (config) => config;\\nexport const defineTemplate = (config) => config;"
    );

    // Replace import path in config
    const configContent = fs.readFileSync(configPath, "utf-8");
    const modified = configContent.replace(
      /from\\s+['"](?:@cmssy\\/cli\\/config|cmssy-cli\\/config)['"]/g,
      \`from '\${mockConfigPath.replace(/\\\\\\\\/g, "/")}'\`
    );

    const tempPath = path.join(cacheDir, "temp-block-config.ts");
    fs.writeFileSync(tempPath, modified);

    const evalCode = \`import cfg from '\${tempPath.replace(/\\\\\\\\/g, "/")}'; console.log(JSON.stringify(cfg.default || cfg));\`;
    const cmd = tsxBinary.includes("npx")
      ? \`\${tsxBinary} --eval "\${evalCode}"\`
      : \`"\${tsxBinary}" --eval "\${evalCode}"\`;

    const output = execSync(cmd, {
      encoding: "utf-8",
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Clean up
    try { fs.unlinkSync(tempPath); } catch {}
    try { fs.unlinkSync(mockConfigPath); } catch {}

    const lines = output.trim().split("\\n");
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Look in blocks/ first, then templates/
  let blockPath = path.join(projectRoot, "blocks", name);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", name);
  }

  if (!fs.existsSync(blockPath)) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  // Load preview data
  const previewPath = path.join(blockPath, "preview.json");
  const previewData = fs.existsSync(previewPath)
    ? JSON.parse(fs.readFileSync(previewPath, "utf-8"))
    : {};

  // Load block.config.ts schema
  const config = loadBlockConfig(blockPath);

  // Check for pages.json (templates), fall back to block.config.ts
  const pagesJsonPath = path.join(blockPath, "pages.json");
  let pagesData = fs.existsSync(pagesJsonPath)
    ? JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8"))
    : null;

  // If no pages.json but config has pages (template), convert on the fly
  if (!pagesData && config && (config.pages || config.layoutPositions)) {
    const layoutPositions: Record<string, any> = {};
    if (Array.isArray(config.layoutPositions)) {
      for (const lp of config.layoutPositions as any[]) {
        layoutPositions[lp.position] = { type: lp.type, content: lp.content || {} };
      }
    } else if (config.layoutPositions && typeof config.layoutPositions === "object") {
      Object.assign(layoutPositions, config.layoutPositions);
    }

    const pages = ((config.pages || []) as any[]).map((page: any, index: number) => ({
      name: page.name,
      slug: page.slug === "home" || page.slug === "/" || index === 0
        ? "/"
        : page.slug.startsWith("/") ? page.slug : "/" + page.slug,
      blocks: page.blocks || [],
    }));

    pagesData = { layoutPositions, pages };
  }

  return NextResponse.json({
    name,
    schema: config?.schema || {},
    previewData,
    pages: config?.pages,
    layoutPositions: config?.layoutPositions,
    pagesData,
  });
}
`;
  fs.writeFileSync(path.join(dir, "route.ts"), content);
}

function generatePreviewApiRoute(devRoot: string) {
  const dir = path.join(devRoot, "app/api/preview/[blockName]");
  fs.mkdirSync(dir, { recursive: true });

  const content = `import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const projectRoot = process.env.CMSSY_PROJECT_ROOT || process.cwd();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ blockName: string }> }
) {
  const { blockName } = await params;
  let blockPath = path.join(projectRoot, "blocks", blockName);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", blockName);
  }

  const previewPath = path.join(blockPath, "preview.json");
  const data = fs.existsSync(previewPath)
    ? JSON.parse(fs.readFileSync(previewPath, "utf-8"))
    : {};

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ blockName: string }> }
) {
  const { blockName } = await params;
  const body = await request.json();

  let blockPath = path.join(projectRoot, "blocks", blockName);
  if (!fs.existsSync(blockPath)) {
    blockPath = path.join(projectRoot, "templates", blockName);
  }

  const previewPath = path.join(blockPath, "preview.json");
  fs.writeFileSync(previewPath, JSON.stringify(body, null, 2));

  return NextResponse.json({ success: true });
}
`;
  fs.writeFileSync(path.join(dir, "route.ts"), content);
}

function generateWorkspacesApiRoute(devRoot: string) {
  const content = `import { NextResponse } from "next/server";

export async function GET() {
  // Workspace listing requires API token - return empty for now
  // The full implementation uses GraphQL client with cmssy configure credentials
  return NextResponse.json([]);
}
`;
  fs.writeFileSync(path.join(devRoot, "app/api/workspaces/route.ts"), content);
}

/**
 * Convert full block type name to simple name.
 * "@cmssy-marketing/blocks.hero" -> "hero"
 * "@vendor/blocks.pricing-table" -> "pricing-table"
 * "hero" -> "hero" (already simple)
 */
function convertBlockTypeToSimple(blockType: string): string {
  let simple = blockType;
  if (simple.includes("/")) {
    simple = simple.split("/").pop()!;
  }
  if (simple.startsWith("blocks.")) {
    simple = simple.substring(7);
  } else if (simple.startsWith("templates.")) {
    simple = simple.substring(10);
  }
  return simple;
}

/**
 * Load block.config.ts synchronously using tsx/esbuild.
 * Used to generate template preview pages when pages.json is missing.
 */
function loadTemplateConfigSync(
  templateDir: string,
  projectRoot: string,
): Record<string, any> | null {
  const configPath = path.join(templateDir, "block.config.ts");
  if (!fs.existsSync(configPath)) return null;

  try {
    const cliPath = path.dirname(path.dirname(new URL(import.meta.url).pathname));
    const possibleTsxPaths = [
      path.join(cliPath, "..", "node_modules", ".bin", "tsx"),
      path.join(cliPath, "..", "..", "node_modules", ".bin", "tsx"),
      path.join(projectRoot, "node_modules", ".bin", "tsx"),
    ];
    let tsxBinary = possibleTsxPaths.find((p) => fs.existsSync(p));
    if (!tsxBinary) tsxBinary = "npx -y tsx";

    const cacheDir = path.join(projectRoot, ".cmssy", "cache");
    fs.ensureDirSync(cacheDir);

    const mockConfigPath = path.join(cacheDir, "cmssy-cli-config.mjs");
    fs.writeFileSync(
      mockConfigPath,
      "export const defineBlock = (config) => config;\nexport const defineTemplate = (config) => config;\n",
    );

    const configContent = fs.readFileSync(configPath, "utf-8");
    const modified = configContent.replace(
      /from\s+['"](?:@?cmssy-?(?:\/cli)?\/config|cmssy-cli\/config)['"]/g,
      `from '${mockConfigPath.replace(/\\/g, "/")}'`,
    );

    const tempPath = path.join(cacheDir, `temp-template-config-${Date.now()}.ts`);
    fs.writeFileSync(tempPath, modified);

    const evalCode = `import cfg from '${tempPath.replace(/\\/g, "/")}'; console.log(JSON.stringify(cfg.default || cfg));`;
    const cmd = tsxBinary.includes("npx")
      ? `${tsxBinary} --eval "${evalCode}"`
      : `"${tsxBinary}" --eval "${evalCode}"`;

    const output = execSync(cmd, {
      encoding: "utf-8",
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    try { fs.removeSync(tempPath); } catch {}
    try { fs.removeSync(mockConfigPath); } catch {}

    const lines = output.trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Convert template config (from block.config.ts defineTemplate) to pages.json format.
 * - layoutPositions: array → object keyed by position
 * - page slugs: "home" → "/", others → "/{slug}"
 */
function convertConfigToPagesData(config: Record<string, any>): {
  layoutPositions: Record<string, any>;
  pages: any[];
} {
  // Convert layoutPositions from array to object
  const layoutPositions: Record<string, any> = {};
  if (Array.isArray(config.layoutPositions)) {
    for (const lp of config.layoutPositions) {
      layoutPositions[lp.position] = {
        type: lp.type,
        content: lp.content || {},
      };
    }
  } else if (config.layoutPositions && typeof config.layoutPositions === "object") {
    // Already in object format
    Object.assign(layoutPositions, config.layoutPositions);
  }

  // Convert page slugs
  const pages = (config.pages || []).map((page: any, index: number) => ({
    name: page.name,
    slug: page.slug === "home" || page.slug === "/" || index === 0
      ? "/"
      : page.slug.startsWith("/") ? page.slug : `/${page.slug}`,
    blocks: page.blocks || [],
  }));

  return { layoutPositions, pages };
}

function generatePreviewPages(
  devRoot: string,
  projectRoot: string,
  resources: ScannedResource[],
) {
  for (const resource of resources) {
    if (resource.type === "template") {
      generateTemplatePreviewPage(devRoot, projectRoot, resource);
    } else {
      generateBlockPreviewPage(devRoot, projectRoot, resource);
    }
  }
}

function generateBlockPreviewPage(
  devRoot: string,
  projectRoot: string,
  resource: ScannedResource,
) {
  const pageDir = path.join(devRoot, "app/preview", resource.name);
  fs.mkdirSync(pageDir, { recursive: true });

  const blockSrcDir = path.join(projectRoot, "blocks", resource.name, "src");

  const hasIndex = fs.existsSync(path.join(blockSrcDir, "index.tsx")) ||
                   fs.existsSync(path.join(blockSrcDir, "index.ts"));
  const hasCss = fs.existsSync(path.join(blockSrcDir, "index.css"));

  if (!hasIndex) return;

  const finalBlockImport = `@blocks/${resource.name}/src/index`;
  const finalCssImport = `@blocks/${resource.name}/src/index.css`;

  const pageContent = `"use client";

import { useState, useEffect } from "react";
import BlockComponent from "${finalBlockImport}";
${hasCss ? `import "${finalCssImport}";` : ""}

export default function ${toPascalCase(resource.name)}Preview() {
  const [data, setData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    fetch("/api/preview/${resource.name}")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "UPDATE_PROPS") {
        setData(e.data.props);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div>
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0,
        background: "white", borderBottom: "1px solid #e0e0e0",
        padding: "1rem 2rem", zIndex: 1000,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>${resource.displayName || resource.name}</div>
        <a href="/" style={{ color: "#667eea", textDecoration: "none", fontWeight: 500 }} target="_parent">
          &larr; Back to Home
        </a>
      </div>
      <div style={{ marginTop: "60px", minHeight: "calc(100vh - 60px)" }}>
        <BlockComponent content={data} />
      </div>
    </div>
  );
}
`;
  fs.writeFileSync(path.join(pageDir, "page.tsx"), pageContent);
}

function generateTemplatePreviewPage(
  devRoot: string,
  projectRoot: string,
  resource: ScannedResource,
) {
  // Read pages data from pages.json or fall back to block.config.ts
  const templateDir = path.join(projectRoot, "templates", resource.name);
  const pagesJsonPath = path.join(templateDir, "pages.json");

  let pagesData: { layoutPositions: Record<string, any>; pages: any[] };

  if (fs.existsSync(pagesJsonPath)) {
    pagesData = JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8"));
  } else {
    // No pages.json — load from block.config.ts and convert format
    const config = loadTemplateConfigSync(templateDir, projectRoot);
    if (!config || (!config.pages && !config.layoutPositions)) return;
    pagesData = convertConfigToPagesData(config);
  }

  const pages = pagesData.pages || [];
  const layoutPositions = pagesData.layoutPositions || {};

  // Collect all unique block types across all pages + layoutPositions
  const blockTypesSet = new Set<string>();
  for (const page of pages) {
    for (const block of page.blocks || []) {
      blockTypesSet.add(convertBlockTypeToSimple(block.type));
    }
  }
  for (const data of Object.values(layoutPositions) as any[]) {
    blockTypesSet.add(convertBlockTypeToSimple(data.type));
  }

  // Check which blocks exist in blocks/ dir with src/index.tsx
  const blockImports: string[] = [];
  const cssImports: string[] = [];
  const componentMapEntries: string[] = [];

  for (const blockName of Array.from(blockTypesSet)) {
    const blockSrcDir = path.join(projectRoot, "blocks", blockName, "src");
    const hasIndex = fs.existsSync(path.join(blockSrcDir, "index.tsx")) ||
                     fs.existsSync(path.join(blockSrcDir, "index.ts"));
    const hasCss = fs.existsSync(path.join(blockSrcDir, "index.css"));

    if (!hasIndex) continue;

    const pascalName = toPascalCase(blockName);
    blockImports.push(`import ${pascalName} from "@blocks/${blockName}/src/index";`);
    if (hasCss) {
      cssImports.push(`import "@blocks/${blockName}/src/index.css";`);
    }
    componentMapEntries.push(`  "${blockName}": ${pascalName},`);
  }

  // Generate [[...slug]] catch-all route
  const pageDir = path.join(devRoot, "app/preview", resource.name, "[[...slug]]");
  fs.mkdirSync(pageDir, { recursive: true });

  const pageContent = `"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
${blockImports.join("\n")}
${cssImports.join("\n")}

const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
${componentMapEntries.join("\n")}
};

interface BlockData {
  type: string;
  content: Record<string, any>;
}

interface PageData {
  name: string;
  slug: string;
  blocks: BlockData[];
}

interface PagesJson {
  layoutPositions?: Record<string, BlockData>;
  pages: PageData[];
}

function convertBlockType(type: string): string {
  let simple = type;
  if (simple.includes("/")) simple = simple.split("/").pop()!;
  if (simple.startsWith("blocks.")) simple = simple.substring(7);
  else if (simple.startsWith("templates.")) simple = simple.substring(10);
  return simple;
}

export default function ${toPascalCase(resource.name)}TemplatePreview() {
  const params = useParams();
  const router = useRouter();
  const slugParts = (params.slug as string[]) || [];
  const currentSlug = slugParts.length > 0 ? "/" + slugParts.join("/") : "/";
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const [pagesData, setPagesData] = useState<PagesJson | null>(null);
  const [contentOverrides, setContentOverrides] = useState<Record<string, BlockData[]>>({});
  const [navVisible, setNavVisible] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [navCollapsed, setNavCollapsed] = useState(false);
  const paletteInputRef = useRef<HTMLInputElement>(null);

  // Fetch pages data from config API
  useEffect(() => {
    fetch("/api/blocks/${resource.name}/config")
      .then((r) => r.json())
      .then((config) => {
        if (config.pagesData) {
          setPagesData(config.pagesData);
        }
      })
      .catch(console.error);
  }, []);

  // Listen for live content updates from editor
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "UPDATE_TEMPLATE_CONTENT") {
        setContentOverrides((prev) => ({
          ...prev,
          [e.data.pageSlug]: e.data.blocks,
        }));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && tabsRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentSlug, pagesData]);

  // Ctrl+K / Cmd+K to open palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setPaletteQuery("");
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when palette opens
  useEffect(() => {
    if (paletteOpen && paletteInputRef.current) {
      paletteInputRef.current.focus();
    }
  }, [paletteOpen]);

  // Auto-hide nav on scroll down, show on scroll up
  useEffect(() => {
    let lastY = 0;
    function onScroll() {
      const y = window.scrollY;
      if (y > 80 && y > lastY) setNavVisible(false);
      else setNavVisible(true);
      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!pagesData) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "24px",
            height: "24px",
            border: "2px solid rgba(255,255,255,0.1)",
            borderTopColor: "#667eea",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", letterSpacing: "0.05em" }}>
            Loading template...
          </div>
        </div>
        <style>{\`@keyframes spin { to { transform: rotate(360deg) } }\`}</style>
      </div>
    );
  }

  // Find current page
  const currentPage = pagesData.pages.find((p) => p.slug === currentSlug);
  if (!currentPage) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafafa",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px", opacity: 0.3 }}>404</div>
          <div style={{ color: "#666", fontSize: "14px" }}>Page not found: {currentSlug}</div>
          <button
            onClick={() => router.push("/preview/${resource.name}")}
            style={{
              marginTop: "20px",
              padding: "8px 20px",
              background: "#667eea",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >Go to homepage</button>
        </div>
      </div>
    );
  }

  // Use overrides if available, otherwise use pages.json content
  const pageBlocks = contentOverrides[currentSlug] || currentPage.blocks || [];

  // Render header layout position
  const headerData = pagesData.layoutPositions?.header;
  const headerType = headerData ? convertBlockType(headerData.type) : null;
  const HeaderComponent = headerType ? BLOCK_COMPONENTS[headerType] : null;

  // Render footer layout position
  const footerData = pagesData.layoutPositions?.footer;
  const footerType = footerData ? convertBlockType(footerData.type) : null;
  const FooterComponent = footerType ? BLOCK_COMPONENTS[footerType] : null;

  // Render sidebar_left layout position
  const sidebarLeftData = pagesData.layoutPositions?.sidebar_left;
  const sidebarLeftType = sidebarLeftData ? convertBlockType(sidebarLeftData.type) : null;
  const SidebarLeftComponent = sidebarLeftType ? BLOCK_COMPONENTS[sidebarLeftType] : null;

  const navigateTo = (slug: string) => {
    const path = slug === "/" ? "/preview/${resource.name}" : \`/preview/${resource.name}\${slug}\`;
    router.push(path);
  };

  return (
    <>
      <style>{\`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');

        .cmssy-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 9999;
          transform: translateY(\${navVisible ? "0" : "-100%"});
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cmssy-nav-inner {
          margin: 10px;
          background: rgba(10, 10, 10, 0.92);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'DM Sans', -apple-system, sans-serif;
        }
        .cmssy-back-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          white-space: nowrap;
          transition: all 0.15s ease;
          font-family: inherit;
          letter-spacing: 0.01em;
        }
        .cmssy-back-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        .cmssy-divider {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .cmssy-template-name {
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          white-space: nowrap;
          letter-spacing: -0.01em;
          flex-shrink: 0;
        }
        .cmssy-tabs-wrapper {
          flex: 1;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: none;
          -ms-overflow-style: none;
          mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent);
        }
        .cmssy-tabs-wrapper::-webkit-scrollbar {
          display: none;
        }
        .cmssy-tabs {
          display: flex;
          gap: 2px;
          padding: 0 8px;
        }
        .cmssy-tab {
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 500;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          font-family: inherit;
          letter-spacing: 0.01em;
        }
        .cmssy-tab-inactive {
          background: transparent;
          color: rgba(255, 255, 255, 0.45);
        }
        .cmssy-tab-inactive:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.8);
        }
        .cmssy-tab-active {
          background: #667eea;
          color: #fff;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
        }
        .cmssy-page-count {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.3);
          white-space: nowrap;
          flex-shrink: 0;
          padding-right: 4px;
        }
        .cmssy-collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 7px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .cmssy-collapse-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        .cmssy-nav-collapsed .cmssy-nav-inner {
          padding: 6px 8px;
          width: fit-content;
        }
        .cmssy-nav-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'DM Sans', -apple-system, sans-serif;
        }
        .cmssy-nav-pill-page {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.7);
          white-space: nowrap;
        }
        .cmssy-search-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 7px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .cmssy-search-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
        }
        .cmssy-search-kbd {
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.35);
          font-family: inherit;
        }
        .cmssy-palette-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 20vh;
          animation: cmssyFadeIn 0.15s ease;
        }
        .cmssy-palette {
          width: 480px;
          max-width: calc(100vw - 32px);
          background: #1a1a1a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
          overflow: hidden;
          animation: cmssySlideUp 0.15s ease;
          font-family: 'DM Sans', -apple-system, sans-serif;
        }
        .cmssy-palette-input-wrapper {
          display: flex;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          gap: 10px;
        }
        .cmssy-palette-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: #fff;
          font-size: 15px;
          font-family: inherit;
          letter-spacing: -0.01em;
        }
        .cmssy-palette-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .cmssy-palette-list {
          max-height: 340px;
          overflow-y: auto;
          padding: 6px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .cmssy-palette-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.1s ease;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }
        .cmssy-palette-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .cmssy-palette-item-active {
          background: rgba(102, 126, 234, 0.15);
        }
        .cmssy-palette-item-active:hover {
          background: rgba(102, 126, 234, 0.2);
        }
        .cmssy-palette-item-name {
          font-size: 14px;
          font-weight: 500;
          color: #fff;
        }
        .cmssy-palette-item-slug {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.3);
          font-family: monospace;
        }
        .cmssy-palette-item-current {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 4px;
          background: #667eea;
          color: #fff;
          font-weight: 600;
          letter-spacing: 0.03em;
        }
        .cmssy-palette-empty {
          padding: 24px 16px;
          text-align: center;
          color: rgba(255, 255, 255, 0.3);
          font-size: 13px;
        }
        @keyframes cmssyFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cmssySlideUp {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      \`}</style>

      {/* Floating Navigation Bar */}
      <div className={\`cmssy-nav \${navCollapsed ? "cmssy-nav-collapsed" : ""}\`}>
        <div className="cmssy-nav-inner">
          {navCollapsed ? (
            <div className="cmssy-nav-pill">
              <a href="/" className="cmssy-back-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Dev
              </a>
              <div className="cmssy-divider" />
              <div className="cmssy-nav-pill-page">{currentPage?.name || "—"}</div>
              <button
                className="cmssy-search-btn"
                onClick={() => { setPaletteOpen(true); setPaletteQuery(""); }}
                title="Search pages (Ctrl+K)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="cmssy-search-kbd">\u2318K</span>
              </button>
              <button
                className="cmssy-collapse-btn"
                onClick={() => setNavCollapsed(false)}
                title="Expand navigation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <a href="/" className="cmssy-back-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Dev
              </a>

              <div className="cmssy-divider" />

              <div className="cmssy-template-name">${resource.displayName || resource.name}</div>

              <div className="cmssy-divider" />

              <div className="cmssy-tabs-wrapper" ref={tabsRef}>
                <div className="cmssy-tabs">
                  {pagesData.pages.map((page) => (
                    <button
                      key={page.slug}
                      ref={page.slug === currentSlug ? activeTabRef : undefined}
                      onClick={() => navigateTo(page.slug)}
                      className={\`cmssy-tab \${page.slug === currentSlug ? "cmssy-tab-active" : "cmssy-tab-inactive"}\`}
                    >
                      {page.name}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="cmssy-search-btn"
                onClick={() => { setPaletteOpen(true); setPaletteQuery(""); }}
                title="Search pages (Ctrl+K)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="cmssy-search-kbd">\u2318K</span>
              </button>

              <button
                className="cmssy-collapse-btn"
                onClick={() => setNavCollapsed(true)}
                title="Collapse navigation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Command Palette */}
      {paletteOpen && (
        <div className="cmssy-palette-overlay" onClick={() => setPaletteOpen(false)}>
          <div className="cmssy-palette" onClick={(e) => e.stopPropagation()}>
            <div className="cmssy-palette-input-wrapper">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={paletteInputRef}
                type="text"
                className="cmssy-palette-input"
                placeholder="Search pages..."
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const q = paletteQuery.toLowerCase();
                    const match = pagesData.pages.find(
                      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
                    );
                    if (match) {
                      navigateTo(match.slug);
                      setPaletteOpen(false);
                    }
                  }
                }}
              />
            </div>
            <div className="cmssy-palette-list">
              {(() => {
                const q = paletteQuery.toLowerCase();
                const filtered = pagesData.pages.filter(
                  (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
                );
                if (filtered.length === 0) {
                  return <div className="cmssy-palette-empty">No pages match &ldquo;{paletteQuery}&rdquo;</div>;
                }
                return filtered.map((page) => (
                  <button
                    key={page.slug}
                    className={\`cmssy-palette-item \${page.slug === currentSlug ? "cmssy-palette-item-active" : ""}\`}
                    onClick={() => {
                      navigateTo(page.slug);
                      setPaletteOpen(false);
                    }}
                  >
                    <div>
                      <div className="cmssy-palette-item-name">{page.name}</div>
                      <div className="cmssy-palette-item-slug">{page.slug}</div>
                    </div>
                    {page.slug === currentSlug && (
                      <span className="cmssy-palette-item-current">Current</span>
                    )}
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Page Content */}
      <div>
        {HeaderComponent && headerData && (
          <HeaderComponent content={headerData.content || {}} />
        )}
        {SidebarLeftComponent && sidebarLeftData ? (
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" }}>
            <SidebarLeftComponent content={sidebarLeftData.content || {}} />
            <main>
              {pageBlocks.map((block, idx) => {
                const blockType = convertBlockType(block.type);
                const Component = BLOCK_COMPONENTS[blockType];
                if (!Component) {
                  return (
                    <div key={idx} style={{
                      padding: "2rem",
                      background: "#fff3cd",
                      textAlign: "center",
                      margin: "1rem",
                      borderRadius: "8px",
                      fontSize: "14px",
                      color: "#856404",
                    }}>
                      Missing block component: {blockType}
                    </div>
                  );
                }
                return <Component key={idx} content={block.content || {}} />;
              })}
            </main>
          </div>
        ) : (
          pageBlocks.map((block, idx) => {
            const blockType = convertBlockType(block.type);
            const Component = BLOCK_COMPONENTS[blockType];
            if (!Component) {
              return (
                <div key={idx} style={{
                  padding: "2rem",
                  background: "#fff3cd",
                  textAlign: "center",
                  margin: "1rem",
                  borderRadius: "8px",
                  fontSize: "14px",
                  color: "#856404",
                }}>
                  Missing block component: {blockType}
                </div>
              );
            }
            return <Component key={idx} content={block.content || {}} />;
          })
        )}
        {FooterComponent && footerData && (
          <FooterComponent content={footerData.content || {}} />
        )}
      </div>
    </>
  );
}
`;
  fs.writeFileSync(path.join(pageDir, "page.tsx"), pageContent);
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
