import { useState } from 'react';
import { Block, FieldConfig } from '../types';

interface EditorProps {
  block: Block | null;
  loading: boolean;
  previewData: Record<string, unknown>;
  onPreviewDataChange: (data: Record<string, unknown>) => void;
  onNavigateToPage?: (pageSlug: string) => void;
}

export function Editor({
  block,
  loading,
  previewData,
  onPreviewDataChange,
  onNavigateToPage,
}: EditorProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="editor-panel collapsed">
        <div className="editor-header">
          <button className="panel-toggle" onClick={() => setCollapsed(false)} title="Expand">
            <span className="toggle-icon">☰</span>
          </button>
        </div>
      </div>
    );
  }

  const isTemplate = block?.type === 'template' && block.pages && block.pages.length > 0;

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <button className="panel-toggle" onClick={() => setCollapsed(true)} title="Collapse">
          <span className="toggle-icon">☰</span>
        </button>
        <div className="editor-header-content">
          <h2>Properties</h2>
          <p>{block?.name || 'No block selected'}</p>
        </div>
      </div>
      <div className="editor-content">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>Loading properties...</span>
          </div>
        ) : !block ? (
          <div className="editor-empty">Select a block to edit its properties</div>
        ) : isTemplate ? (
          <TemplateEditor block={block} onNavigateToPage={onNavigateToPage} />
        ) : block.schema ? (
          <SchemaEditor
            schema={block.schema}
            data={previewData}
            onChange={onPreviewDataChange}
          />
        ) : (
          <div className="editor-empty">No schema defined for this block</div>
        )}
      </div>
    </div>
  );
}

// Template editor component
function TemplateEditor({
  block,
  onNavigateToPage,
}: {
  block: Block;
  onNavigateToPage?: (pageSlug: string) => void;
}) {
  const pages = block.pages || [];
  const layoutPositions = block.layoutPositions || [];

  return (
    <div className="template-editor">
      <div className="template-info">
        <div className="template-info-badge">Template</div>
        <p className="template-info-desc">{block.description || 'No description'}</p>
      </div>

      <div className="template-section">
        <h4 className="template-section-title">Pages ({pages.length})</h4>
        <div className="template-pages-list">
          {pages.length === 0 ? (
            <div className="editor-empty">No pages defined</div>
          ) : (
            pages.map((page) => (
              <div
                key={page.slug}
                className="template-page-item"
                onClick={() => onNavigateToPage?.(page.slug)}
              >
                <div className="template-page-header">
                  <span className="template-page-name">{page.name}</span>
                  <span className="template-page-blocks">{page.blocksCount} blocks</span>
                </div>
                <div className="template-page-slug">/{page.slug}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {layoutPositions.length > 0 && (
        <div className="template-section">
          <h4 className="template-section-title">Layout Positions</h4>
          {layoutPositions.map((pos) => (
            <div key={pos.position} className="template-layout-position">
              <span className="position-type">{pos.position}</span>
              <span className="position-block">{pos.type}</span>
            </div>
          ))}
        </div>
      )}

      <div className="template-hint">
        <p>Click on a page to preview it, or use the tabs in the preview header.</p>
      </div>
    </div>
  );
}

// Schema-based field editor
function SchemaEditor({
  schema,
  data,
  onChange,
  prefix = '',
}: {
  schema: Record<string, FieldConfig>;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
  prefix?: string;
}) {
  const updateField = (key: string, value: unknown) => {
    const newData = { ...data, [key]: value };
    onChange(newData);
  };

  return (
    <>
      {Object.entries(schema).map(([key, field]) => (
        <FieldEditor
          key={prefix + key}
          fieldKey={key}
          field={field}
          value={data[key]}
          onChange={(value) => updateField(key, value)}
        />
      ))}
    </>
  );
}

// Individual field editor
function FieldEditor({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const required = field.required ? <span className="field-required">*</span> : null;

  // Boolean field
  if (field.type === 'boolean') {
    return (
      <div className="field-group">
        <label className="field-checkbox-label">
          <input
            type="checkbox"
            checked={Boolean(value ?? field.defaultValue)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Text fields
  if (field.type === 'singleLine' || field.type === 'text' || field.type === 'string') {
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <input
          type="text"
          className="field-input"
          value={String(value ?? field.defaultValue ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Multiline text
  if (field.type === 'multiLine' || field.type === 'richText') {
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <textarea
          className="field-input field-textarea"
          value={String(value ?? field.defaultValue ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Number field
  if (field.type === 'number' || field.type === 'numeric') {
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <input
          type="number"
          className="field-input"
          value={value !== undefined ? String(value) : String(field.defaultValue ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : '')}
        />
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Date field
  if (field.type === 'date') {
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <input
          type="date"
          className="field-input"
          value={String(value ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Link field
  if (field.type === 'link') {
    const linkValue = (value as { url?: string; text?: string; target?: string }) ?? {};
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <div className="link-field">
          <input
            type="url"
            className="field-input"
            placeholder="URL"
            value={linkValue.url || ''}
            onChange={(e) => onChange({ ...linkValue, url: e.target.value })}
            style={{ marginBottom: 8 }}
          />
          <input
            type="text"
            className="field-input"
            placeholder="Link text"
            value={linkValue.text || ''}
            onChange={(e) => onChange({ ...linkValue, text: e.target.value })}
            style={{ marginBottom: 8 }}
          />
          <label className="field-checkbox-label">
            <input
              type="checkbox"
              checked={linkValue.target === '_blank'}
              onChange={(e) => onChange({ ...linkValue, target: e.target.checked ? '_blank' : '_self' })}
            />
            <span>Open in new tab</span>
          </label>
        </div>
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Select field
  if (field.type === 'select') {
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <select
          className="field-input field-select"
          value={String(value ?? field.defaultValue ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select an option...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Color field
  if (field.type === 'color') {
    const colorValue = String(value ?? field.defaultValue ?? '#000000');
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <div className="color-field">
          <input
            type="color"
            className="color-preview"
            value={colorValue}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className="field-input color-input"
            value={colorValue}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Media field (simple URL string)
  if (field.type === 'media') {
    const mediaUrl = (value as string) || '';
    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <div className="media-field">
          <div className="media-preview">
            {mediaUrl ? (
              <img src={mediaUrl} alt={field.label} />
            ) : (
              <div className="media-placeholder">No image</div>
            )}
          </div>
          <input
            type="url"
            className="field-input"
            placeholder="Image URL"
            value={mediaUrl}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Repeater field
  if (field.type === 'repeater' && field.schema) {
    const items = (value as Record<string, unknown>[]) ?? [];
    const minItems = field.minItems ?? 0;
    const maxItems = field.maxItems ?? 999;

    const addItem = () => {
      const newItem: Record<string, unknown> = {};
      Object.entries(field.schema!).forEach(([k, f]) => {
        if (f.defaultValue !== undefined) newItem[k] = f.defaultValue;
      });
      onChange([...items, newItem]);
    };

    const removeItem = (index: number) => {
      onChange(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, newItemData: Record<string, unknown>) => {
      const newItems = [...items];
      newItems[index] = newItemData;
      onChange(newItems);
    };

    return (
      <div className="field-group">
        <label className="field-label">
          {field.label}
          {required}
        </label>
        <div className="repeater-items">
          {items.length === 0 ? (
            <div style={{ padding: 12, color: '#999', textAlign: 'center' }}>No items yet</div>
          ) : (
            items.map((item, index) => (
              <div key={index} className="repeater-item">
                <div className="repeater-item-header">
                  <div className="repeater-item-title">Item {index + 1}</div>
                  {items.length > minItems && (
                    <button
                      type="button"
                      className="repeater-item-remove"
                      onClick={() => removeItem(index)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <SchemaEditor
                  schema={field.schema!}
                  data={item}
                  onChange={(newData) => updateItem(index, newData)}
                  prefix={`${fieldKey}.${index}.`}
                />
              </div>
            ))
          )}
        </div>
        {items.length < maxItems && (
          <button type="button" className="repeater-add" onClick={addItem}>
            + Add Item
          </button>
        )}
        {field.helpText && <div className="field-help">{field.helpText}</div>}
      </div>
    );
  }

  // Fallback for unsupported types
  return (
    <div className="field-group">
      <label className="field-label">{field.label}</label>
      <div style={{ color: '#999', fontSize: 12 }}>Unsupported field type: {field.type}</div>
    </div>
  );
}
