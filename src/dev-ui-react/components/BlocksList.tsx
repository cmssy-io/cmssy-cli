import { useState, useMemo } from 'react';
import { Block, Filters } from '../types';

interface BlocksListProps {
  blocks: Block[];
  selectedBlock: Block | null;
  onSelectBlock: (block: Block) => void;
  loading: boolean;
}

export function BlocksList({ blocks, selectedBlock, onSelectBlock, loading }: BlocksListProps) {
  const [filters, setFilters] = useState<Filters>({
    search: '',
    type: 'all',
    category: '',
    tags: [],
  });
  const [collapsed, setCollapsed] = useState(false);

  // Extract unique categories and tags
  const { categories, tags } = useMemo(() => {
    const cats = new Set<string>();
    const tgs = new Set<string>();

    blocks.forEach((block) => {
      if (block.category) cats.add(block.category);
      block.tags?.forEach((tag) => tgs.add(tag));
    });

    return {
      categories: Array.from(cats).sort(),
      tags: Array.from(tgs).sort(),
    };
  }, [blocks]);

  // Filter blocks
  const filteredBlocks = useMemo(() => {
    return blocks.filter((block) => {
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matches =
          block.name.toLowerCase().includes(search) ||
          block.displayName.toLowerCase().includes(search) ||
          block.description?.toLowerCase().includes(search);
        if (!matches) return false;
      }

      // Type filter
      if (filters.type !== 'all' && block.type !== filters.type) {
        return false;
      }

      // Category filter
      if (filters.category && block.category !== filters.category) {
        return false;
      }

      // Tags filter
      if (filters.tags.length > 0) {
        const hasTag = filters.tags.some((tag) => block.tags?.includes(tag));
        if (!hasTag) return false;
      }

      return true;
    });
  }, [blocks, filters]);

  // Group by category
  const groupedBlocks = useMemo(() => {
    const grouped: Record<string, Block[]> = {};

    filteredBlocks.forEach((block) => {
      const cat = block.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(block);
    });

    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });
  }, [filteredBlocks]);

  const hasActiveFilters =
    filters.search || filters.type !== 'all' || filters.category || filters.tags.length > 0;

  const clearFilters = () => {
    setFilters({ search: '', type: 'all', category: '', tags: [] });
  };

  if (collapsed) {
    return (
      <div className="blocks-panel collapsed">
        <div className="blocks-header">
          <button className="panel-toggle" onClick={() => setCollapsed(false)} title="Expand">
            <span className="toggle-icon">☰</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="blocks-panel">
      <div className="blocks-header">
        <div className="blocks-header-content">
          <h1>Blocks</h1>
          <p>
            {hasActiveFilters
              ? `${filteredBlocks.length} of ${blocks.length} items`
              : `${blocks.length} items`}
          </p>
        </div>
        <button className="panel-toggle" onClick={() => setCollapsed(true)} title="Collapse">
          <span className="toggle-icon">☰</span>
        </button>
      </div>

      <div className="blocks-filters">
        <input
          type="search"
          className="search-input"
          placeholder="Search blocks..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />

        <div className="filter-tabs">
          {(['all', 'block', 'template'] as const).map((type) => (
            <button
              key={type}
              className={`filter-tab ${filters.type === type ? 'active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, type }))}
            >
              {type === 'all' ? 'All' : type === 'block' ? 'Blocks' : 'Templates'}
            </button>
          ))}
        </div>

        <select
          className="filter-select"
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {tags.length > 0 && (
          <div className="tags-filter">
            {tags.map((tag) => (
              <button
                key={tag}
                className={`tag-chip ${filters.tags.includes(tag) ? 'active' : ''}`}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    tags: f.tags.includes(tag)
                      ? f.tags.filter((t) => t !== tag)
                      : [...f.tags, tag],
                  }))
                }
              >
                {tag}
              </button>
            ))}
            {hasActiveFilters && (
              <button className="clear-filters" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="blocks-list">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>Loading blocks...</span>
          </div>
        ) : filteredBlocks.length === 0 ? (
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <div>No items match your filters</div>
            {hasActiveFilters && (
              <button className="btn-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          groupedBlocks.map(([category, categoryBlocks]) => (
            <div key={category} className="block-category">
              <div className="category-header">
                {category}
                <span className="category-count">{categoryBlocks.length}</span>
              </div>
              {categoryBlocks.map((block) => (
                <div
                  key={block.name}
                  className={`block-item ${selectedBlock?.name === block.name ? 'active' : ''}`}
                  onClick={() => onSelectBlock(block)}
                >
                  <div className="block-item-header">
                    <div className="block-item-name">
                      {block.displayName}
                      {block.type === 'template' && (
                        <span className="type-badge template">Template</span>
                      )}
                    </div>
                    <span className="version-badge">v{block.version}</span>
                  </div>
                  <div className="block-item-footer">
                    <span className="block-item-type">{block.category || 'Block'}</span>
                    <span className="status-badge status-local">Local</span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
