import fs from "fs-extra";
import path from "path";
import type { ScannedResource } from "../scanner.js";
import {
  convertBlockTypeToSimple,
  convertConfigToPagesData,
  loadTemplateConfigSync,
  toPascalCase,
} from "./helpers.js";

export function generatePreviewPages(
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

  const hasIndex =
    fs.existsSync(path.join(blockSrcDir, "index.tsx")) ||
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
  // Read pages data from pages.json or fall back to config.ts
  const templateDir = path.join(projectRoot, "templates", resource.name);
  const pagesJsonPath = path.join(templateDir, "pages.json");

  let pagesData: { layoutPositions: Record<string, any>; pages: any[] };

  if (fs.existsSync(pagesJsonPath)) {
    pagesData = JSON.parse(fs.readFileSync(pagesJsonPath, "utf-8"));
  } else {
    // No pages.json — load from config.ts and convert format
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
    const hasIndex =
      fs.existsSync(path.join(blockSrcDir, "index.tsx")) ||
      fs.existsSync(path.join(blockSrcDir, "index.ts"));
    const hasCss = fs.existsSync(path.join(blockSrcDir, "index.css"));

    if (!hasIndex) continue;

    const pascalName = toPascalCase(blockName);
    blockImports.push(
      `import ${pascalName} from "@blocks/${blockName}/src/index";`,
    );
    if (hasCss) {
      cssImports.push(`import "@blocks/${blockName}/src/index.css";`);
    }
    componentMapEntries.push(`  "${blockName}": ${pascalName},`);
  }

  // Generate [[...slug]] catch-all route
  const pageDir = path.join(
    devRoot,
    "app/preview",
    resource.name,
    "[[...slug]]",
  );
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
