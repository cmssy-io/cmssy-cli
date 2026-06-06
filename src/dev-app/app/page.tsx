"use client";

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
  workspace?: {
    id: string;
    slug: string;
    name: string;
    myRole?: { name: string };
  };
  workspaces?: any[];
}

const VIEWPORT_STORAGE_KEY = "cmssy-dev-viewport";

const VIEWPORT_PRESETS = [
  { label: "Desktop", width: 1440 },
  { label: "Laptop", width: 1024 },
  { label: "Tablet", width: 768 },
  { label: "Mobile", width: 375 },
] as const;

export default function DevHome() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selected, setSelected] = useState<Block | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const configDataRef = useRef<Record<string, unknown>>({});
  const [variants, setVariants] = useState<string[]>([]);
  const [currentVariant, setCurrentVariant] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadedRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showBlockList, setShowBlockList] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [editorTab, setEditorTab] = useState<"content" | "context">("content");
  const [mockContext, setMockContext] = useState<Record<string, any>>({});
  const [contextPresets, setContextPresets] = useState<string[]>([]);
  const [viewport, setViewport] = useState<number | null>(null);

  // Load saved viewport from localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!saved) return;
    const parsed = parseInt(saved, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setViewport(parsed);
    } else {
      localStorage.removeItem(VIEWPORT_STORAGE_KEY);
    }
  }, []);

  // Persist viewport changes
  useEffect(() => {
    if (viewport === null) {
      localStorage.removeItem(VIEWPORT_STORAGE_KEY);
    } else {
      localStorage.setItem(VIEWPORT_STORAGE_KEY, String(viewport));
    }
  }, [viewport]);

  const [wsInfo, setWsInfo] = useState<WorkspaceInfo | null>(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsData, setSettingsData] = useState<{
    apiUrl: string;
    hasToken: boolean;
    maskedToken: string | null;
    workspaceId: string | null;
    newToken: string;
    newApiUrl: string;
    newWorkspaceId: string;
    saving: boolean;
    testing: boolean;
    testResult: string | null;
    project: any;
  }>({
    apiUrl: "",
    hasToken: false,
    maskedToken: null,
    workspaceId: null,
    newToken: "",
    newApiUrl: "",
    newWorkspaceId: "",
    saving: false,
    testing: false,
    testResult: null,
    project: null,
  });

  // Load config when settings opened
  useEffect(() => {
    if (!showSettings) return;
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setSettingsData((prev) => ({
          ...prev,
          apiUrl: data.env.apiUrl,
          hasToken: data.env.hasToken,
          maskedToken: data.env.maskedToken,
          workspaceId: data.env.workspaceId,
          newApiUrl: data.env.apiUrl,
          newWorkspaceId: data.env.workspaceId || "",
          project: data.project,
        }));
      })
      .catch(console.error);
  }, [showSettings]);

  // Load workspace info
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        setWsInfo(data);
        setWsLoading(false);
      })
      .catch(() => setWsLoading(false));
  }, []);

  // Load mock context + presets
  useEffect(() => {
    fetch("/api/context")
      .then((r) => r.json())
      .then(setMockContext)
      .catch(() => {});
    fetch("/api/context?presets=true")
      .then((r) => r.json())
      .then((data) => setContextPresets(data.presets || []))
      .catch(() => {});
  }, []);

  // Debounced context persistence
  const contextInitRef = useRef(false);
  useEffect(() => {
    // Skip initial render (context loaded from API)
    if (!contextInitRef.current) {
      contextInitRef.current = true;
      return;
    }
    const t = setTimeout(() => {
      fetch("/api/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockContext),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [mockContext]);

  // Load blocks list
  useEffect(() => {
    fetch("/api/blocks")
      .then((r) => r.json())
      .then(setBlocks)
      .catch(console.error);
  }, []);

  // Load config + preview data when block selected or variant changes
  useEffect(() => {
    if (!selected || selected.type === "template") return;
    setConfigLoading(true);

    const variantParam = currentVariant
      ? `?variant=${encodeURIComponent(currentVariant)}`
      : "";

    Promise.all([
      fetch(`/api/blocks/${selected.name}/config`).then((r) => r.json()),
      fetch(`/api/preview/${selected.name}${variantParam}`).then((r) =>
        r.json(),
      ),
    ])
      .then(([config, preview]) => {
        setSelected((prev) =>
          prev ? { ...prev, schema: config.schema } : null,
        );
        const data = preview.data || config.previewData || {};
        configDataRef.current = data;
        setPreviewData(data);
        setVariants(preview.variants || []);
        setConfigLoading(false);
      })
      .catch(() => setConfigLoading(false));
  }, [selected?.name, currentVariant]);

  // Select block — templates redirect to full-page preview
  const handleSelect = useCallback((block: Block) => {
    if (block.type === "template") {
      window.location.href = `/preview/${block.name}`;
      return;
    }
    setSelected(block);
    setPreviewData({});
    configDataRef.current = {};
    setIsDirty(false);
    setCurrentVariant(null);
    setVariants([]);
    iframeLoadedRef.current = false;
  }, []);

  // Send props + context to iframe
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !iframeLoadedRef.current) return;
    if (!previewData || Object.keys(previewData).length === 0) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "UPDATE_PROPS", props: previewData, context: mockContext },
      window.location.origin,
    );
  }, [previewData, mockContext]);

  // Auto-save preview data
  useEffect(() => {
    if (
      !isDirty ||
      !selected ||
      Object.keys(configDataRef.current).length === 0
    )
      return;
    const t = setTimeout(async () => {
      const dataToSave = { ...configDataRef.current, ...previewData };
      const variantParam = currentVariant
        ? `?variant=${encodeURIComponent(currentVariant)}`
        : "";
      await fetch(`/api/preview/${selected.name}${variantParam}`, {
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

  const previewUrl = selected ? `/preview/${selected.name}` : null;

  function renderField(field: any, value: any, onChange: (val: any) => void) {
    if (field.type === "multiLine" || field.type === "richText") {
      return (
        <textarea
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "13px",
            minHeight: "60px",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      );
    }
    if (field.type === "boolean") {
      return (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
          }}
        >
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
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "13px",
          }}
        >
          <option value="">Select...</option>
          {field.options?.map((opt: any) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "multiselect") {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "4px",
            padding: "8px",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
          }}
        >
          {field.options?.map((opt: any) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
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
          {!field.options?.length && (
            <span style={{ color: "#999", fontSize: "12px" }}>
              No options defined
            </span>
          )}
        </div>
      );
    }
    if (field.type === "date") {
      return (
        <input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            fontSize: "13px",
          }}
        />
      );
    }
    if (field.type === "media") {
      return (
        <div>
          {value && (
            <div
              style={{
                marginBottom: "6px",
                borderRadius: "4px",
                overflow: "hidden",
                border: "1px solid #ddd",
              }}
            >
              <img
                src={value as string}
                alt=""
                style={{
                  maxWidth: "100%",
                  maxHeight: "120px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          )}
          <input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Image URL"
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "13px",
            }}
          />
        </div>
      );
    }
    if (field.type === "repeater" && field.schema) {
      const items = (Array.isArray(value) ? value : []) as any[];
      return (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          {items.map((item: any, idx: number) => (
            <div
              key={idx}
              style={{
                padding: "12px",
                borderBottom: "1px solid #eee",
                background: idx % 2 === 0 ? "#fafafa" : "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{ fontSize: "12px", fontWeight: 600, color: "#888" }}
                >
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newItems = [...items];
                    newItems.splice(idx, 1);
                    onChange(newItems);
                  }}
                  style={{
                    fontSize: "11px",
                    color: "#e53935",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  &times; Remove
                </button>
              </div>
              {Object.entries(field.schema).map(
                ([subKey, subField]: [string, any]) => (
                  <div key={subKey} style={{ marginBottom: "8px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: 500,
                        marginBottom: "4px",
                        color: "#666",
                      }}
                    >
                      {subField.label || subKey}
                    </label>
                    {renderField(subField, item[subKey], (subVal) => {
                      const newItems = [...items];
                      newItems[idx] = { ...newItems[idx], [subKey]: subVal };
                      onChange(newItems);
                    })}
                  </div>
                ),
              )}
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
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "13px",
              color: "#667eea",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            + Add item
          </button>
        </div>
      );
    }
    // singleLine, link, numeric, color, form, pageSelector
    return (
      <input
        type={
          field.type === "numeric"
            ? "number"
            : field.type === "color"
              ? "color"
              : field.type === "link"
                ? "url"
                : "text"
        }
        value={(value as string) || ""}
        onChange={(e) =>
          onChange(
            field.type === "numeric" ? Number(e.target.value) : e.target.value,
          )
        }
        placeholder={
          field.placeholder ||
          (field.type === "link"
            ? "https://..."
            : field.type === "form" || field.type === "pageSelector"
              ? "Enter ID..."
              : "")
        }
        style={{
          width: "100%",
          padding: "8px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          fontSize: "13px",
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${showBlockList ? "280px" : "0px"} 1fr ${showEditor ? "400px" : "0px"}`,
        height: "100vh",
        transition: "grid-template-columns 0.2s ease",
      }}
    >
      {/* Block List */}
      <div
        style={{
          background: "#fff",
          borderRight: showBlockList ? "1px solid #e0e0e0" : "none",
          overflow: showBlockList ? "auto" : "hidden",
          width: showBlockList ? "auto" : 0,
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fafafa",
          }}
        >
          <h1 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
            Cmssy Dev
          </h1>
          <p style={{ fontSize: "13px", color: "#666", margin: "4px 0 0" }}>
            {blocks.length} blocks
          </p>
        </div>
        {/* Workspace Connection */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e0e0e0",
            fontSize: "12px",
          }}
        >
          {wsLoading ? (
            <div style={{ color: "#999" }}>Connecting...</div>
          ) : wsInfo?.connected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#22c55e",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontWeight: 500 }}>
                  {wsInfo.workspace?.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWsLoading(true);
                  fetch("/api/workspaces")
                    .then((r) => r.json())
                    .then((data) => {
                      setWsInfo(data);
                      setWsLoading(false);
                    })
                    .catch(() => setWsLoading(false));
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#667eea",
                  fontSize: "11px",
                  padding: "2px 4px",
                }}
                title="Refresh"
              >
                {"\u21BB"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#ef4444",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "#999" }}>
                {wsInfo?.reason === "no_token"
                  ? "Not configured"
                  : wsInfo?.reason === "auth_error"
                    ? "Invalid token"
                    : "Disconnected"}
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
                url.searchParams.set(
                  b.type === "template" ? "template" : "block",
                  b.name,
                );
                window.history.replaceState({}, "", url.toString());
              }}
              style={{
                padding: "12px 16px",
                marginBottom: "4px",
                borderRadius: "8px",
                cursor: "pointer",
                background:
                  selected?.name === b.name ? "#667eea" : "transparent",
                color: selected?.name === b.name ? "white" : "inherit",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: "14px", fontWeight: 500 }}>
                  {b.displayName}
                </div>
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                {b.type} &middot; v{b.version}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div
        style={{
          background: "#fafafa",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            background: "white",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={() => setShowBlockList(!showBlockList)}
            title={showBlockList ? "Hide block list" : "Show block list"}
            style={{
              background: showBlockList ? "#f0f0f0" : "#667eea",
              color: showBlockList ? "#333" : "#fff",
              border: "1px solid #ddd",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {showBlockList ? "\u2190 Blocks" : "\u2192 Blocks"}
          </button>
          <div
            style={{
              flex: 1,
              fontSize: "16px",
              fontWeight: 600,
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selected?.displayName || "Preview"}
          </div>
          <button
            type="button"
            onClick={() => setShowEditor(!showEditor)}
            title={showEditor ? "Hide editor" : "Show editor"}
            style={{
              background: showEditor ? "#f0f0f0" : "#667eea",
              color: showEditor ? "#333" : "#fff",
              border: "1px solid #ddd",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {showEditor ? "Editor \u2192" : "Editor \u2190"}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            style={{
              background: showSettings ? "#667eea" : "#f0f0f0",
              color: showSettings ? "#fff" : "#333",
              border: "1px solid #ddd",
              borderRadius: "6px",
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: "15px",
              lineHeight: 1,
            }}
          >
            {"\u2699"}
          </button>
        </div>
        {/* Responsive viewport toolbar */}
        {previewUrl && (
          <div
            style={{
              padding: "6px 16px",
              background: "#f8f8f8",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "4px",
              rowGap: "6px",
              fontSize: "12px",
            }}
          >
            <button
              type="button"
              aria-pressed={viewport === null}
              onClick={() => setViewport(null)}
              style={{
                padding: "4px 10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                background: viewport === null ? "#667eea" : "#fff",
                color: viewport === null ? "#fff" : "#333",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              Full
            </button>
            {VIEWPORT_PRESETS.map((preset) => (
              <button
                key={preset.width}
                type="button"
                aria-pressed={viewport === preset.width}
                onClick={() => setViewport(preset.width)}
                style={{
                  padding: "4px 10px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  background: viewport === preset.width ? "#667eea" : "#fff",
                  color: viewport === preset.width ? "#fff" : "#333",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                }}
              >
                {preset.label} {preset.width}
              </button>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginLeft: "8px",
              }}
            >
              <input
                type="number"
                value={viewport ?? ""}
                aria-label="Viewport width in pixels"
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  const v =
                    Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                  setViewport(v);
                }}
                placeholder="Custom"
                style={{
                  width: "72px",
                  padding: "4px 6px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "12px",
                  textAlign: "center",
                }}
              />
              <span style={{ color: "#999" }}>px</span>
            </div>
          </div>
        )}
        <div
          style={{
            flex: 1,
            padding: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
          }}
        >
          {previewUrl ? (
            <div
              style={{
                width:
                  viewport !== null && viewport > 0 ? `${viewport}px` : "100%",
                maxWidth: "100%",
                height: "100%",
                background: "white",
                borderRadius: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                overflow: "hidden",
                transition: "width 0.2s ease",
              }}
            >
              <iframe
                ref={iframeRef}
                src={previewUrl}
                key={previewUrl}
                onLoad={() => {
                  iframeLoadedRef.current = true;
                }}
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
      <div
        style={{
          background: "#fff",
          borderLeft: showEditor ? "1px solid #e0e0e0" : "none",
          overflow: showEditor ? "auto" : "hidden",
          width: showEditor ? "auto" : 0,
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: "1px solid #e0e0e0",
            background: "#fafafa",
          }}
        >
          <div style={{ display: "flex", gap: "0" }}>
            {(["content", "context"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setEditorTab(tab)}
                style={{
                  padding: "6px 16px",
                  border: "none",
                  background: editorTab === tab ? "#fff" : "transparent",
                  borderBottom:
                    editorTab === tab
                      ? "2px solid #667eea"
                      : "2px solid transparent",
                  fontSize: "14px",
                  fontWeight: editorTab === tab ? 600 : 400,
                  cursor: "pointer",
                  color: editorTab === tab ? "#333" : "#888",
                  textTransform: "capitalize",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        {/* Variant picker */}
        {selected && (
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => setCurrentVariant(null)}
              style={{
                padding: "3px 8px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                background: currentVariant === null ? "#667eea" : "#fff",
                color: currentVariant === null ? "#fff" : "#333",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 500,
              }}
            >
              Default
            </button>
            {variants.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCurrentVariant(v)}
                style={{
                  padding: "3px 8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  background: currentVariant === v ? "#667eea" : "#fff",
                  color: currentVariant === v ? "#fff" : "#333",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 500,
                }}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                const name = prompt("Variant name (e.g., long-text):");
                if (!name) return;
                const dataToSave = { ...configDataRef.current, ...previewData };
                try {
                  const res = await fetch(
                    `/api/preview/${selected.name}?action=save-variant`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        variantName: name,
                        data: dataToSave,
                      }),
                    },
                  );
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || "Failed to save variant");
                    return;
                  }
                  setVariants((prev) =>
                    prev.includes(name) ? prev : [...prev, name],
                  );
                  setCurrentVariant(name);
                } catch {
                  alert("Failed to save variant");
                }
              }}
              style={{
                padding: "3px 8px",
                border: "1px dashed #ccc",
                borderRadius: "4px",
                background: "transparent",
                color: "#667eea",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 500,
              }}
            >
              + Save as...
            </button>
          </div>
        )}
        {/* Content tab */}
        {editorTab === "content" && (
          <div style={{ padding: "20px" }}>
            {!selected && (
              <p style={{ color: "#999" }}>Select a block to edit</p>
            )}
            {selected && configLoading && (
              <p style={{ color: "#999" }}>Loading...</p>
            )}
            {selected && !configLoading && selected.schema && (
              <div>
                {Object.entries(selected.schema).map(
                  ([key, field]: [string, any]) => (
                    <div key={key} style={{ marginBottom: "20px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "13px",
                          fontWeight: 500,
                          marginBottom: "6px",
                        }}
                      >
                        {field.label || key}
                        {field.required && (
                          <span style={{ color: "#e53935" }}> *</span>
                        )}
                      </label>
                      {renderField(field, previewData[key], (val) => {
                        setPreviewData({ ...previewData, [key]: val });
                        setIsDirty(true);
                      })}
                      {field.helpText && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#666",
                            marginTop: "4px",
                          }}
                        >
                          {field.helpText}
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {/* Context tab */}
        {editorTab === "context" && (
          <div style={{ padding: "20px" }}>
            {/* Presets */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Presets
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {contextPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={async () => {
                      const res = await fetch(
                        `/api/context?preset=${encodeURIComponent(preset)}`,
                      );
                      const data = await res.json();
                      setMockContext(data);
                    }}
                    style={{
                      padding: "4px 10px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Locale */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Locale
              </label>
              <div style={{ marginBottom: "8px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    color: "#666",
                    marginBottom: "4px",
                  }}
                >
                  Current language
                </label>
                <input
                  type="text"
                  value={mockContext.locale?.current || "en"}
                  onChange={(e) => {
                    const updated = {
                      ...mockContext,
                      locale: {
                        ...mockContext.locale,
                        current: e.target.value,
                      },
                    };
                    setMockContext(updated);
                  }}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "8px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    color: "#666",
                    marginBottom: "4px",
                  }}
                >
                  Enabled languages (comma-separated)
                </label>
                <input
                  type="text"
                  value={(mockContext.locale?.enabled || ["en"]).join(", ")}
                  onChange={(e) => {
                    const langs = e.target.value
                      .split(",")
                      .map((s: string) => s.trim())
                      .filter(Boolean);
                    const updated = {
                      ...mockContext,
                      locale: { ...mockContext.locale, enabled: langs },
                    };
                    setMockContext(updated);
                  }}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Auth */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!mockContext.auth?.isAuthenticated}
                  onChange={(e) => {
                    const updated = e.target.checked
                      ? {
                          ...mockContext,
                          auth: {
                            isAuthenticated: true,
                            member: mockContext.auth?.member || {
                              id: "dev-member-1",
                              email: "user@example.com",
                              profile: {
                                firstName: "Jane",
                                lastName: "Doe",
                                displayName: "Jane Doe",
                                avatarUrl: "",
                              },
                              role: "member",
                              verified: true,
                            },
                          },
                        }
                      : { ...mockContext, auth: null };
                    setMockContext(updated);
                  }}
                />
                Authenticated
              </label>
              {mockContext.auth?.isAuthenticated && (
                <div style={{ paddingLeft: "4px" }}>
                  {(["email", "role"] as const).map((field) => (
                    <div key={field} style={{ marginBottom: "6px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          color: "#666",
                          marginBottom: "2px",
                          textTransform: "capitalize",
                        }}
                      >
                        {field}
                      </label>
                      <input
                        type="text"
                        value={
                          field === "email"
                            ? mockContext.auth?.member?.email || ""
                            : mockContext.auth?.member?.role || ""
                        }
                        onChange={(e) => {
                          const updated = {
                            ...mockContext,
                            auth: {
                              ...mockContext.auth,
                              member: {
                                ...mockContext.auth?.member,
                                [field]: e.target.value,
                              },
                            },
                          };
                          setMockContext(updated);
                        }}
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          fontSize: "12px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Raw JSON editor */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Full context (JSON)
              </label>
              <textarea
                value={JSON.stringify(mockContext, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setMockContext(parsed);
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                style={{
                  width: "100%",
                  minHeight: "200px",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Settings Panel (slide-over) */}
      {showSettings && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "420px",
            background: "#fff",
            boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            animation: "slideIn 0.2s ease",
          }}
        >
          <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#fafafa",
            }}
          >
            <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
              Settings
            </h2>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              style={{
                background: "none",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                color: "#666",
                padding: "4px",
              }}
            >
              {"\u2715"}
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
            {/* Connection */}
            <div style={{ marginBottom: "24px" }}>
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#666",
                  marginBottom: "12px",
                }}
              >
                Connection
              </h3>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    marginBottom: "4px",
                  }}
                >
                  API URL
                </label>
                <input
                  type="text"
                  value={settingsData.newApiUrl}
                  onChange={(e) =>
                    setSettingsData({
                      ...settingsData,
                      newApiUrl: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 500,
                    marginBottom: "4px",
                  }}
                >
                  API Token{" "}
                  {settingsData.hasToken && (
                    <span style={{ color: "#22c55e", fontSize: "11px" }}>
                      ({settingsData.maskedToken})
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={settingsData.newToken}
                  onChange={(e) =>
                    setSettingsData({
                      ...settingsData,
                      newToken: e.target.value,
                    })
                  }
                  placeholder={
                    settingsData.hasToken
                      ? "Leave empty to keep current"
                      : "bf_..."
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  disabled={settingsData.testing}
                  onClick={async () => {
                    setSettingsData((s) => ({
                      ...s,
                      testing: true,
                      testResult: null,
                    }));
                    try {
                      if (settingsData.newToken) {
                        await fetch("/api/config", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            apiToken: settingsData.newToken,
                            apiUrl: settingsData.newApiUrl,
                          }),
                        });
                      }
                      const res = await fetch("/api/workspaces");
                      const data = await res.json();
                      if (data.connected) {
                        setSettingsData((s) => ({
                          ...s,
                          testing: false,
                          testResult: "success",
                        }));
                        setWsInfo(data);
                        setWsLoading(false);
                      } else {
                        setSettingsData((s) => ({
                          ...s,
                          testing: false,
                          testResult: data.error || data.reason || "failed",
                        }));
                      }
                    } catch {
                      setSettingsData((s) => ({
                        ...s,
                        testing: false,
                        testResult: "Network error",
                      }));
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    background: "#f8f8f8",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {settingsData.testing ? "Testing..." : "Test Connection"}
                </button>
                {settingsData.testResult && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontSize: "12px",
                      color:
                        settingsData.testResult === "success"
                          ? "#22c55e"
                          : "#ef4444",
                    }}
                  >
                    {settingsData.testResult === "success"
                      ? "\u2713 Connected"
                      : "\u2717 " + settingsData.testResult}
                  </span>
                )}
              </div>
            </div>

            {/* Workspace */}
            <div style={{ marginBottom: "24px" }}>
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#666",
                  marginBottom: "12px",
                }}
              >
                Workspace
              </h3>
              {wsInfo?.connected &&
              wsInfo.workspaces &&
              wsInfo.workspaces.length > 0 ? (
                <select
                  value={settingsData.newWorkspaceId}
                  onChange={(e) =>
                    setSettingsData({
                      ...settingsData,
                      newWorkspaceId: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    fontSize: "13px",
                  }}
                >
                  <option value="">Select workspace...</option>
                  {wsInfo.workspaces.map((w: any) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.slug})
                    </option>
                  ))}
                </select>
              ) : (
                <p style={{ fontSize: "13px", color: "#999" }}>
                  Connect to see available workspaces
                </p>
              )}
            </div>

            {/* Project Info */}
            {settingsData.project && (
              <div style={{ marginBottom: "24px" }}>
                <h3
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#666",
                    marginBottom: "12px",
                  }}
                >
                  Project
                </h3>
                <div
                  style={{
                    background: "#f8f8f8",
                    borderRadius: "6px",
                    padding: "12px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                  }}
                >
                  {Object.entries(settingsData.project).map(([k, v]) => (
                    <div key={k} style={{ marginBottom: "4px" }}>
                      <span style={{ color: "#666" }}>{k}:</span>{" "}
                      <span>
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save */}
            <button
              type="button"
              disabled={settingsData.saving}
              onClick={async () => {
                setSettingsData((s) => ({ ...s, saving: true }));
                const body: any = { apiUrl: settingsData.newApiUrl };
                if (settingsData.newToken)
                  body.apiToken = settingsData.newToken;
                if (settingsData.newWorkspaceId)
                  body.workspaceId = settingsData.newWorkspaceId;
                try {
                  await fetch("/api/config", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  setSettingsData((s) => ({
                    ...s,
                    saving: false,
                    newToken: "",
                  }));
                  const res = await fetch("/api/workspaces");
                  const data = await res.json();
                  setWsInfo(data);
                  const cfgRes = await fetch("/api/config");
                  const cfgData = await cfgRes.json();
                  setSettingsData((s) => ({
                    ...s,
                    hasToken: cfgData.env.hasToken,
                    maskedToken: cfgData.env.maskedToken,
                    workspaceId: cfgData.env.workspaceId,
                  }));
                } catch {
                  setSettingsData((s) => ({ ...s, saving: false }));
                }
              }}
              style={{
                width: "100%",
                padding: "10px",
                background: "#667eea",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {settingsData.saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
