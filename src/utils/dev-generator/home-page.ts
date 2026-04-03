import fs from "fs-extra";
import path from "path";

export function generateHomePage(devRoot: string) {
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

interface WorkspaceInfo {
  connected: boolean;
  reason?: string;
  error?: string;
  workspace?: { id: string; slug: string; name: string; myRole?: { name: string } };
  workspaces?: any[];
  publishedBlocks?: Array<{ blockType: string; name: string; version: string }>;
}

type SyncStatus = "local-only" | "published" | "outdated";

function getSyncStatus(blockName: string, localVersion: string, wsInfo: WorkspaceInfo | null): SyncStatus {
  if (!wsInfo?.connected || !wsInfo.publishedBlocks) return "local-only";
  const remote = wsInfo.publishedBlocks.find((b) => b.blockType === blockName || b.name === blockName);
  if (!remote) return "local-only";
  if (remote.version === localVersion) return "published";
  return "outdated";
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
  const [wsInfo, setWsInfo] = useState<WorkspaceInfo | null>(null);
  const [wsLoading, setWsLoading] = useState(true);

  // Load workspace info
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => { setWsInfo(data); setWsLoading(false); })
      .catch(() => setWsLoading(false));
  }, []);

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
        {/* Workspace Connection */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e0e0e0", fontSize: "12px" }}>
          {wsLoading ? (
            <div style={{ color: "#999" }}>Connecting...</div>
          ) : wsInfo?.connected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{wsInfo.workspace?.name}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWsLoading(true);
                  fetch("/api/workspaces")
                    .then((r) => r.json())
                    .then((data) => { setWsInfo(data); setWsLoading(false); })
                    .catch(() => setWsLoading(false));
                }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#667eea", fontSize: "11px", padding: "2px 4px" }}
                title="Refresh"
              >\u21BB</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
              <span style={{ color: "#999" }}>
                {wsInfo?.reason === "no_token" ? "Not configured" : wsInfo?.reason === "auth_error" ? "Invalid token" : "Disconnected"}
              </span>
            </div>
          )}
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{b.displayName}</div>
                {wsInfo?.connected && (() => {
                  const status = getSyncStatus(b.name, b.version, wsInfo);
                  const colors: Record<SyncStatus, { bg: string; text: string; label: string }> = {
                    "published": { bg: selected?.name === b.name ? "rgba(255,255,255,0.2)" : "#dcfce7", text: selected?.name === b.name ? "#fff" : "#166534", label: "\u2713" },
                    "outdated": { bg: selected?.name === b.name ? "rgba(255,255,255,0.2)" : "#fef3c7", text: selected?.name === b.name ? "#fff" : "#92400e", label: "\u2191" },
                    "local-only": { bg: "transparent", text: "transparent", label: "" },
                  };
                  const c = colors[status];
                  if (status === "local-only") return null;
                  return (
                    <span title={status} style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: c.bg, color: c.text, fontWeight: 600 }}>{c.label}</span>
                  );
                })()}
              </div>
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
