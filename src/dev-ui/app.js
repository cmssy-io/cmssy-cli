// Cmssy Dev Server - Interactive UI
let currentBlock = null;
let blocks = [];
let previewData = {};
let eventSource = null;

// Filters state
let filters = {
  search: '',
  type: 'all',
  category: '',
  tags: []
};

// Available categories and tags (populated from blocks)
let availableCategories = [];
let availableTags = [];

// Initialize app
async function init() {
  await loadBlocks();
  setupSSE();
}

// Load all blocks from API
async function loadBlocks() {
  try {
    const response = await fetch('/api/blocks');
    blocks = await response.json();
    populateFilters();
    renderBlocksList();
  } catch (error) {
    console.error('Failed to load blocks:', error);
    document.getElementById('blocks-list').innerHTML = `
      <div style="padding: 20px; color: #e53935;">
        Failed to load blocks. Make sure the dev server is running.
      </div>
    `;
  }
}

// Populate filter options from loaded blocks
function populateFilters() {
  // Extract unique categories
  const categoriesSet = new Set();
  const tagsSet = new Set();

  blocks.forEach(block => {
    if (block.category) {
      categoriesSet.add(block.category);
    }
    if (block.tags && Array.isArray(block.tags)) {
      block.tags.forEach(tag => tagsSet.add(tag));
    }
  });

  availableCategories = Array.from(categoriesSet).sort();
  availableTags = Array.from(tagsSet).sort();

  // Populate category dropdown
  const categorySelect = document.getElementById('category-filter');
  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">All Categories</option>';
    availableCategories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      categorySelect.appendChild(option);
    });
  }

  // Populate tags filter
  const tagsContainer = document.getElementById('tags-filter');
  if (tagsContainer) {
    if (availableTags.length === 0) {
      tagsContainer.style.display = 'none';
    } else {
      tagsContainer.style.display = 'flex';
      tagsContainer.innerHTML = availableTags.map(tag => `
        <button
          type="button"
          class="tag-chip ${filters.tags.includes(tag) ? 'active' : ''}"
          data-tag="${escapeHtml(tag)}"
          onclick="toggleTagFilter('${escapeHtml(tag)}')"
        >${escapeHtml(tag)}</button>
      `).join('');

      // Add clear button if any filters active
      if (hasActiveFilters()) {
        tagsContainer.innerHTML += `
          <button type="button" class="clear-filters" onclick="clearAllFilters()">
            Clear all
          </button>
        `;
      }
    }
  }
}

// Check if any filters are active
function hasActiveFilters() {
  return filters.search !== '' ||
         filters.type !== 'all' ||
         filters.category !== '' ||
         filters.tags.length > 0;
}

// Filter handlers
window.handleSearchInput = function(event) {
  filters.search = event.target.value.toLowerCase();
  renderBlocksList();
};

window.setTypeFilter = function(type) {
  filters.type = type;

  // Update tab UI
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === type);
  });

  renderBlocksList();
};

window.setCategoryFilter = function(category) {
  filters.category = category;
  renderBlocksList();
};

window.toggleTagFilter = function(tag) {
  const index = filters.tags.indexOf(tag);
  if (index === -1) {
    filters.tags.push(tag);
  } else {
    filters.tags.splice(index, 1);
  }

  // Update tag chip UI
  document.querySelectorAll('.tag-chip').forEach(chip => {
    if (chip.dataset.tag === tag) {
      chip.classList.toggle('active');
    }
  });

  // Re-render to update clear button
  populateFilters();
  renderBlocksList();
};

window.clearAllFilters = function() {
  filters = {
    search: '',
    type: 'all',
    category: '',
    tags: []
  };

  // Reset UI
  document.getElementById('search-input').value = '';
  document.getElementById('category-filter').value = '';
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.type === 'all');
  });

  populateFilters();
  renderBlocksList();
};

// Get filtered blocks based on current filters
function getFilteredBlocks() {
  return blocks.filter(block => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        (block.displayName || block.name).toLowerCase().includes(searchLower) ||
        (block.description || '').toLowerCase().includes(searchLower) ||
        (block.name || '').toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Type filter
    if (filters.type !== 'all') {
      const blockType = block.type || 'block';
      if (blockType !== filters.type) {
        return false;
      }
    }

    // Category filter
    if (filters.category && block.category !== filters.category) {
      return false;
    }

    // Tags filter (match ANY selected tag)
    if (filters.tags.length > 0) {
      const blockTags = block.tags || [];
      const hasAnyTag = filters.tags.some(tag => blockTags.includes(tag));
      if (!hasAnyTag) return false;
    }

    return true;
  });
}

// Render blocks list
function renderBlocksList() {
  const listEl = document.getElementById('blocks-list');
  const countEl = document.getElementById('blocks-count');

  if (blocks.length === 0) {
    listEl.innerHTML = '<div class="editor-empty">No blocks found</div>';
    countEl.textContent = 'No blocks';
    return;
  }

  // Get filtered blocks
  const filteredBlocks = getFilteredBlocks();

  // Update count with filter info
  if (hasActiveFilters()) {
    countEl.textContent = `${filteredBlocks.length} of ${blocks.length} items`;
  } else {
    countEl.textContent = `${blocks.length} ${blocks.length === 1 ? 'item' : 'items'}`;
  }

  // Handle empty filtered results
  if (filteredBlocks.length === 0) {
    listEl.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <div>No items match your filters</div>
        <button
          type="button"
          style="margin-top: 12px; padding: 6px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;"
          onclick="clearAllFilters()"
        >Clear filters</button>
      </div>
    `;
    return;
  }

  // Group blocks by category
  const grouped = {};
  filteredBlocks.forEach(block => {
    const cat = block.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(block);
  });

  // Sort categories alphabetically (but put Uncategorized last)
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });

  // Render grouped blocks
  listEl.innerHTML = sortedCategories.map(category => `
    <div class="block-category">
      <div class="category-header">
        ${escapeHtml(category)}
        <span class="category-count">${grouped[category].length}</span>
      </div>
      ${grouped[category].map(block => renderBlockItem(block)).join('')}
    </div>
  `).join('');
}

// Render a single block item
function renderBlockItem(block) {
  const isTemplate = block.type === 'template';
  const typeBadge = isTemplate
    ? '<span class="type-badge template">Template</span>'
    : '';

  return `
    <div
      class="block-item ${currentBlock?.name === block.name ? 'active' : ''}"
      data-block="${escapeHtml(block.name)}"
      onclick="selectBlock('${escapeHtml(block.name)}')"
    >
      <div class="block-item-header">
        <div class="block-item-name">
          ${escapeHtml(block.displayName || block.name)}
          ${typeBadge}
        </div>
        <span class="version-badge">v${block.version || '1.0.0'}</span>
      </div>
      <div class="block-item-footer">
        <span class="block-item-type">${escapeHtml(block.category || 'Block')}</span>
        <span class="status-badge status-local">Local</span>
      </div>
    </div>
  `;
}

// Select a block
async function selectBlock(blockName) {
  const block = blocks.find(b => b.name === blockName);
  if (!block) return;

  currentBlock = block;
  renderBlocksList(); // Update active state

  // Load preview data
  try {
    const response = await fetch(`/api/preview/${blockName}`);
    previewData = await response.json();
  } catch (error) {
    console.error('Failed to load preview data:', error);
    previewData = {};
  }

  // Update UI
  document.getElementById('preview-title').textContent = block.displayName || block.name;
  document.getElementById('editor-subtitle').textContent = block.name;

  // Show publish button
  const publishBtn = document.getElementById('publish-btn');
  if (publishBtn) {
    publishBtn.style.display = 'block';
  }

  // Render preview
  renderPreview();

  // Render editor form
  renderEditor();
}

// Render preview iframe
function renderPreview() {
  if (!currentBlock) return;

  const previewContent = document.getElementById('preview-content');
  previewContent.innerHTML = `
    <div class="preview-iframe-wrapper">
      <iframe
        class="preview-iframe"
        src="/preview/${currentBlock.name}"
        id="preview-iframe"
      ></iframe>
    </div>
  `;
}

// Render editor form
function renderEditor() {
  if (!currentBlock || !currentBlock.schema) {
    document.getElementById('editor-content').innerHTML = `
      <div class="editor-empty">No schema defined for this block</div>
    `;
    return;
  }

  const editorContent = document.getElementById('editor-content');
  const fields = Object.entries(currentBlock.schema);

  editorContent.innerHTML = fields.map(([key, field]) =>
    renderField(key, field, previewData[key])
  ).join('');

  // Attach event listeners
  attachFieldListeners();
}

// Render a single field based on type
function renderField(key, field, value) {
  const required = field.required ? '<span class="field-required">*</span>' : '';
  const helpText = field.helpText ? `<div class="field-help">${field.helpText}</div>` : '';

  let inputHtml = '';

  switch (field.type) {
    case 'singleLine':
    case 'text':
    case 'string':
      inputHtml = `
        <input
          type="text"
          class="field-input"
          data-field="${key}"
          value="${escapeHtml(value || field.defaultValue || '')}"
          placeholder="${field.placeholder || ''}"
          ${field.required ? 'required' : ''}
        />
      `;
      break;

    case 'multiLine':
      inputHtml = `
        <textarea
          class="field-input field-textarea"
          data-field="${key}"
          placeholder="${field.placeholder || ''}"
          ${field.required ? 'required' : ''}
        >${escapeHtml(value || field.defaultValue || '')}</textarea>
      `;
      break;

    case 'richText':
      inputHtml = `
        <textarea
          class="field-input field-textarea"
          data-field="${key}"
          placeholder="${field.placeholder || 'Enter rich text...'}"
          ${field.required ? 'required' : ''}
          style="min-height: 120px;"
        >${escapeHtml(value || field.defaultValue || '')}</textarea>
      `;
      break;

    case 'number':
      inputHtml = `
        <input
          type="number"
          class="field-input"
          data-field="${key}"
          value="${value !== undefined ? value : (field.defaultValue || '')}"
          placeholder="${field.placeholder || ''}"
          ${field.required ? 'required' : ''}
        />
      `;
      break;

    case 'boolean':
      inputHtml = `
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input
            type="checkbox"
            class="field-checkbox"
            data-field="${key}"
            ${value || field.defaultValue ? 'checked' : ''}
          />
          <span>${field.label}</span>
        </label>
      `;
      break;

    case 'date':
      inputHtml = `
        <input
          type="date"
          class="field-input"
          data-field="${key}"
          value="${value || field.defaultValue || ''}"
          ${field.required ? 'required' : ''}
        />
      `;
      break;

    case 'link':
      inputHtml = `
        <input
          type="url"
          class="field-input"
          data-field="${key}"
          value="${escapeHtml(value || field.defaultValue || '')}"
          placeholder="${field.placeholder || 'https://...'}"
          ${field.required ? 'required' : ''}
        />
      `;
      break;

    case 'color':
      const colorValue = value || field.defaultValue || '#000000';
      inputHtml = `
        <div class="color-field">
          <input
            type="color"
            class="color-preview"
            data-field="${key}"
            value="${colorValue}"
          />
          <input
            type="text"
            class="field-input color-input"
            data-field="${key}-text"
            value="${colorValue}"
            placeholder="#000000"
          />
        </div>
      `;
      break;

    case 'select':
      const currentValue = value || field.defaultValue || '';
      inputHtml = `
        <select class="field-input field-select" data-field="${key}" ${field.required ? 'required' : ''}>
          <option value="">Select an option...</option>
          ${field.options.map(opt => {
            const optValue = typeof opt === 'string' ? opt : opt.value;
            const optLabel = typeof opt === 'string' ? opt : opt.label;
            return `<option value="${escapeHtml(optValue)}" ${currentValue === optValue ? 'selected' : ''}>${escapeHtml(optLabel)}</option>`;
          }).join('')}
        </select>
      `;
      break;

    case 'media':
      const mediaValue = value || field.defaultValue || {};
      inputHtml = `
        <div class="media-field">
          <div class="media-preview">
            ${mediaValue.url ?
              `<img src="${escapeHtml(mediaValue.url)}" alt="${escapeHtml(mediaValue.alt || '')}"/>` :
              '<div class="media-placeholder">No image</div>'
            }
          </div>
          <div class="media-input-group">
            <input
              type="url"
              class="field-input"
              data-field="${key}.url"
              value="${escapeHtml(mediaValue.url || '')}"
              placeholder="Image URL"
              style="margin-bottom: 8px;"
            />
            <input
              type="text"
              class="field-input"
              data-field="${key}.alt"
              value="${escapeHtml(mediaValue.alt || '')}"
              placeholder="Alt text"
            />
          </div>
        </div>
      `;
      break;

    case 'repeater':
      inputHtml = renderRepeaterField(key, field, value || field.defaultValue || []);
      break;

    default:
      inputHtml = `<div style="color: #999;">Unsupported field type: ${field.type}</div>`;
  }

  // Special case for boolean - don't show separate label
  if (field.type === 'boolean') {
    return `
      <div class="field-group">
        ${inputHtml}
        ${helpText}
      </div>
    `;
  }

  return `
    <div class="field-group">
      <label class="field-label">
        ${field.label}${required}
      </label>
      ${inputHtml}
      ${helpText}
    </div>
  `;
}

// Render repeater field
function renderRepeaterField(key, field, items) {
  const minItems = field.minItems || 0;
  const maxItems = field.maxItems || 999;

  const itemsHtml = items.map((item, index) => {
    const nestedFields = Object.entries(field.schema || {}).map(([nestedKey, nestedField]) => {
      return renderField(`${key}.${index}.${nestedKey}`, nestedField, item[nestedKey]);
    }).join('');

    return `
      <div class="repeater-item" data-repeater-item="${key}.${index}">
        <div class="repeater-item-header">
          <div class="repeater-item-title">Item ${index + 1}</div>
          ${items.length > minItems ? `
            <button
              type="button"
              class="repeater-item-remove"
              onclick="removeRepeaterItem('${key}', ${index})"
            >Remove</button>
          ` : ''}
        </div>
        ${nestedFields}
      </div>
    `;
  }).join('');

  return `
    <div class="repeater-items" data-repeater="${key}">
      ${itemsHtml || '<div style="padding: 12px; color: #999; text-align: center;">No items yet</div>'}
    </div>
    ${items.length < maxItems ? `
      <button
        type="button"
        class="repeater-add"
        onclick="addRepeaterItem('${key}')"
      >+ Add Item</button>
    ` : ''}
  `;
}

// Get nested field definition from schema using dot notation path
function getNestedFieldDefinition(key) {
  const parts = key.split('.');
  let fieldDef = null;
  let schema = currentBlock.schema;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Skip numeric indices (they reference array items, not schema keys)
    if (/^\d+$/.test(part)) {
      continue;
    }

    if (schema && schema[part]) {
      fieldDef = schema[part];
      // If this is a repeater, its nested fields are in .schema
      if (fieldDef.type === 'repeater' && fieldDef.schema) {
        schema = fieldDef.schema;
      }
    } else {
      return null;
    }
  }

  return fieldDef;
}

// Get nested value from previewData using dot notation path
function getNestedValue(key) {
  const parts = key.split('.');
  let value = previewData;

  for (const part of parts) {
    if (value === undefined || value === null) return undefined;
    value = value[part];
  }

  return value;
}

// Set nested value in previewData using dot notation path
function setNestedValue(key, newValue) {
  const parts = key.split('.');
  let obj = previewData;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];

    if (obj[part] === undefined) {
      // Create array if next part is numeric, otherwise object
      obj[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    obj = obj[part];
  }

  obj[parts[parts.length - 1]] = newValue;
}

// Add repeater item
window.addRepeaterItem = function(key) {
  // Get field definition (supports nested paths like "plans.0.features")
  const field = getNestedFieldDefinition(key);
  if (!field || !field.schema) {
    console.error('Could not find repeater field definition for:', key);
    return;
  }

  // Get current items at the nested path
  const currentItems = getNestedValue(key) || [];

  // Create new empty item with defaults
  const newItem = {};
  Object.keys(field.schema).forEach(nestedKey => {
    const nestedField = field.schema[nestedKey];
    if (nestedField.type === 'repeater') {
      newItem[nestedKey] = []; // Nested repeaters start empty
    } else {
      newItem[nestedKey] = nestedField.defaultValue !== undefined ? nestedField.defaultValue : '';
    }
  });

  // Set the updated array at the nested path
  setNestedValue(key, [...currentItems, newItem]);

  // Re-render editor and save
  renderEditor();
  savePreviewData();
};

// Remove repeater item
window.removeRepeaterItem = function(key, index) {
  // Get current items at the nested path
  const currentItems = getNestedValue(key) || [];

  // Filter out the item at the given index
  const newItems = currentItems.filter((_, i) => i !== index);

  // Set the updated array at the nested path
  setNestedValue(key, newItems);

  // Re-render editor and save
  renderEditor();
  savePreviewData();
};

// Attach event listeners to form fields
function attachFieldListeners() {
  const inputs = document.querySelectorAll('[data-field]');
  inputs.forEach(input => {
    const eventType = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(eventType, handleFieldChange);
  });
}

// Handle field value change
function handleFieldChange(event) {
  const input = event.target;
  const fieldPath = input.dataset.field;

  let value;
  if (input.type === 'checkbox') {
    value = input.checked;
  } else if (input.type === 'number') {
    value = input.value ? parseFloat(input.value) : '';
  } else {
    value = input.value;
  }

  // Use generic nested setter to handle any depth (supports nested repeaters)
  setNestedValue(fieldPath, value);

  // Sync color picker with text input
  if (fieldPath.endsWith('-text')) {
    const colorKey = fieldPath.replace('-text', '');
    const colorInput = document.querySelector(`[data-field="${colorKey}"]`);
    if (colorInput) colorInput.value = value;
  }

  // Debounce save (quick debounce since we're using postMessage for instant updates)
  clearTimeout(window.saveTimeout);
  window.saveTimeout = setTimeout(() => savePreviewData(), 200);
}

// Save preview data to server
async function savePreviewData() {
  if (!currentBlock) return;

  try {
    // Update preview iframe immediately (no reload/blink)
    const iframe = document.getElementById('preview-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'UPDATE_PROPS',
        props: previewData
      }, '*');
    }

    // Save to server in background
    const response = await fetch(`/api/preview/${currentBlock.name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previewData)
    });

    if (response.ok) {
      document.getElementById('preview-status').textContent = 'Saved';
      setTimeout(() => {
        document.getElementById('preview-status').textContent = 'Ready';
      }, 1000);
    }
  } catch (error) {
    console.error('Failed to save preview data:', error);
    document.getElementById('preview-status').textContent = 'Error';
  }
}

// Setup Server-Sent Events for hot reload
function setupSSE() {
  eventSource = new EventSource('/events');

  eventSource.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'reload') {
      // If config changed, reload blocks list to update schema
      if (data.configChanged && currentBlock && data.block === currentBlock.name) {
        console.log('Config changed, reloading block data...');
        await loadBlocks();
        // Re-select current block to refresh properties sidebar
        await selectBlock(currentBlock.name);
      }

      // Reload preview iframe
      const iframe = document.getElementById('preview-iframe');
      if (iframe && (!data.block || data.block === currentBlock?.name)) {
        iframe.src = iframe.src; // Force reload
      }
    }

    if (data.type === 'newBlock') {
      console.log('New block detected:', data.block);
      await loadBlocks();
    }
  };

  eventSource.onerror = () => {
    console.error('SSE connection lost. Reconnecting...');
  };
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Publish functionality
let workspacesCache = null;

async function loadWorkspaces() {
  const select = document.getElementById('publish-workspace-id');
  const errorDiv = document.getElementById('workspace-error');

  try {
    // Use cached workspaces if available
    if (workspacesCache) {
      populateWorkspaceSelect(workspacesCache);
      return;
    }

    const response = await fetch('/api/workspaces');

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to load workspaces');
    }

    const workspaces = await response.json();
    workspacesCache = workspaces;

    populateWorkspaceSelect(workspaces);
    errorDiv.style.display = 'none';
  } catch (error) {
    console.error('Failed to load workspaces:', error);
    select.innerHTML = '<option value="">Failed to load workspaces</option>';
    errorDiv.textContent = error.message || 'Failed to load workspaces. Check your API token configuration.';
    errorDiv.style.display = 'block';
  }
}

function populateWorkspaceSelect(workspaces) {
  const select = document.getElementById('publish-workspace-id');

  if (workspaces.length === 0) {
    select.innerHTML = '<option value="">No workspaces found</option>';
    return;
  }

  select.innerHTML = '<option value="">Select a workspace</option>';
  workspaces.forEach(ws => {
    const option = document.createElement('option');
    option.value = ws.id;
    option.textContent = `${ws.name} (${ws.myRole})`;
    select.appendChild(option);
  });
}

window.openPublishModal = async function() {
  if (!currentBlock) return;

  const modal = document.getElementById('publish-modal');
  const blockName = document.getElementById('publish-block-name');
  const localVersion = document.getElementById('publish-local-version');
  const publishedVersionRow = document.getElementById('publish-published-version-row');

  blockName.textContent = currentBlock.displayName || currentBlock.name;
  localVersion.textContent = `v${currentBlock.version || '1.0.0'}`;

  // Hide published version initially
  publishedVersionRow.style.display = 'none';

  // Reset form
  document.getElementById('publish-target-marketplace').checked = true;
  document.getElementById('publish-workspace-id').value = '';
  document.getElementById('publish-version-bump').value = '';

  // Load workspaces (will be shown when workspace target is selected)
  await loadWorkspaces();

  // Show/hide workspace input
  toggleWorkspaceInput();

  modal.classList.add('active');
};

window.closePublishModal = function() {
  const modal = document.getElementById('publish-modal');
  modal.classList.remove('active');

  // Reset to form view
  document.getElementById('publish-form').style.display = 'block';
  document.getElementById('publish-progress').style.display = 'none';
};

// Simple semver increment helper
function incrementVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3) return version;

  const [major, minor, patch] = parts;

  switch (type) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
    default:
      return version;
  }
}

async function fetchPublishedVersion(workspaceId) {
  if (!currentBlock || !workspaceId) return;

  const publishedVersionRow = document.getElementById('publish-published-version-row');
  const publishedVersionSpan = document.getElementById('publish-published-version');
  const versionBumpSelect = document.getElementById('publish-version-bump');

  try {
    const response = await fetch(`/api/blocks/${currentBlock.name}/published-version?workspaceId=${workspaceId}`);
    const data = await response.json();

    if (data.published && data.version) {
      publishedVersionSpan.textContent = `v${data.version}`;
      publishedVersionRow.style.display = 'block';

      // Update version bump options with calculated versions
      const currentVer = data.version;
      const patchVer = incrementVersion(currentVer, 'patch');
      const minorVer = incrementVersion(currentVer, 'minor');
      const majorVer = incrementVersion(currentVer, 'major');

      versionBumpSelect.innerHTML = `
        <option value="">No change</option>
        <option value="patch">Patch (${currentVer} → ${patchVer})</option>
        <option value="minor">Minor (${currentVer} → ${minorVer})</option>
        <option value="major">Major (${currentVer} → ${majorVer})</option>
      `;
    } else {
      publishedVersionSpan.textContent = 'Not published yet';
      publishedVersionRow.style.display = 'block';

      // Use local version for initial publish
      const localVer = currentBlock.version || '1.0.0';
      versionBumpSelect.innerHTML = `
        <option value="">Use current version (${localVer})</option>
        <option value="patch">Patch (${localVer} → ${incrementVersion(localVer, 'patch')})</option>
        <option value="minor">Minor (${localVer} → ${incrementVersion(localVer, 'minor')})</option>
        <option value="major">Major (${localVer} → ${incrementVersion(localVer, 'major')})</option>
      `;
    }
  } catch (error) {
    console.error('Failed to fetch published version:', error);
    publishedVersionRow.style.display = 'none';
  }
}

window.handleWorkspaceChange = function() {
  const workspaceId = document.getElementById('publish-workspace-id').value;
  if (workspaceId) {
    fetchPublishedVersion(workspaceId);
  } else {
    // Hide published version when no workspace selected
    document.getElementById('publish-published-version-row').style.display = 'none';
  }
};

window.toggleWorkspaceInput = function() {
  const target = document.querySelector('input[name="publish-target"]:checked').value;
  const workspaceGroup = document.getElementById('workspace-id-group');
  const publishedVersionRow = document.getElementById('publish-published-version-row');

  if (target === 'workspace') {
    workspaceGroup.style.display = 'block';
  } else {
    workspaceGroup.style.display = 'none';
    publishedVersionRow.style.display = 'none';
  }
};

window.startPublish = async function() {
  if (!currentBlock) return;

  const target = document.querySelector('input[name="publish-target"]:checked').value;
  const workspaceId = document.getElementById('publish-workspace-id').value;
  const versionBump = document.getElementById('publish-version-bump').value;

  // Validate workspace ID if needed
  if (target === 'workspace' && !workspaceId) {
    alert('Please select a workspace from the dropdown');
    return;
  }

  // Show loading state
  document.getElementById('publish-form').style.display = 'none';
  const progressDiv = document.getElementById('publish-progress');
  progressDiv.style.display = 'block';
  progressDiv.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="spinner" style="margin: 0 auto 16px;"></div>
      <div style="color: #666;">Publishing...</div>
    </div>
  `;

  try {
    const response = await fetch(`/api/blocks/${currentBlock.name}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, workspaceId, versionBump })
    });

    const result = await response.json();

    if (result.success) {
      // Update local block version
      currentBlock.version = result.version;
      renderBlocksList();

      progressDiv.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
          <div style="font-size: 18px; font-weight: 600; color: #22c55e; margin-bottom: 8px;">
            ${escapeHtml(result.message)}
          </div>
          ${result.version ? `<div style="color: #666;">Version: ${result.version}</div>` : ''}
          <button class="btn btn-primary" onclick="closePublishModal()" style="margin-top: 24px;">Done</button>
        </div>
      `;
    } else {
      throw new Error(result.error || 'Publish failed');
    }
  } catch (error) {
    console.error('Publish failed:', error);
    progressDiv.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 48px; margin-bottom: 16px; color: #ef4444;">✗</div>
        <div style="font-size: 18px; font-weight: 600; color: #ef4444; margin-bottom: 8px;">Publish Failed</div>
        <div style="color: #666; margin-bottom: 24px;">${escapeHtml(error.message)}</div>
        <button class="btn btn-secondary" onclick="closePublishModal()">Close</button>
      </div>
    `;
  }
};

// Panel Toggle Functionality - Collapsed Sidebar
let leftPanelCollapsed = false;
let rightPanelCollapsed = false;

window.toggleLeftPanel = function() {
  const container = document.getElementById('container');
  const toggleBtn = document.getElementById('toggle-left');

  leftPanelCollapsed = !leftPanelCollapsed;

  if (leftPanelCollapsed) {
    container.classList.add('left-collapsed');
    toggleBtn.setAttribute('title', 'Expand panel (Ctrl+B)');
  } else {
    container.classList.remove('left-collapsed');
    toggleBtn.setAttribute('title', 'Collapse panel (Ctrl+B)');
  }

  // Save preference
  localStorage.setItem('leftPanelCollapsed', leftPanelCollapsed);
};

window.toggleRightPanel = function() {
  const container = document.getElementById('container');
  const toggleBtn = document.getElementById('toggle-right');

  rightPanelCollapsed = !rightPanelCollapsed;

  if (rightPanelCollapsed) {
    container.classList.add('right-collapsed');
    toggleBtn.setAttribute('title', 'Expand panel (Ctrl+E)');
  } else {
    container.classList.remove('right-collapsed');
    toggleBtn.setAttribute('title', 'Collapse panel (Ctrl+E)');
  }

  // Save preference
  localStorage.setItem('rightPanelCollapsed', rightPanelCollapsed);
};

// Restore panel states from localStorage
function restorePanelStates() {
  const savedLeftState = localStorage.getItem('leftPanelCollapsed');
  const savedRightState = localStorage.getItem('rightPanelCollapsed');

  if (savedLeftState === 'true') {
    leftPanelCollapsed = false; // Set to false so toggle will flip it
    toggleLeftPanel();
  }

  if (savedRightState === 'true') {
    rightPanelCollapsed = false; // Set to false so toggle will flip it
    toggleRightPanel();
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Ctrl+B (or Cmd+B on Mac) - Toggle left panel
  if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
    event.preventDefault();
    toggleLeftPanel();
  }

  // Ctrl+E (or Cmd+E on Mac) - Toggle right panel
  if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
    event.preventDefault();
    toggleRightPanel();
  }
});

// Start the app
init();

// Restore panel states after init
setTimeout(restorePanelStates, 100);
