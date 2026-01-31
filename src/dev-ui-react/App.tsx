import { useState, useEffect, useCallback, useRef } from 'react';
import { BlocksList } from './components/BlocksList';
import { Preview } from './components/Preview';
import { Editor } from './components/Editor';
import { useBlocks, useBlockConfig } from './hooks/useBlocks';
import { Block } from './types';
import './styles.css';

export function App() {
  const { blocks, loading: blocksLoading } = useBlocks();
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [currentPage, setCurrentPage] = useState<string | undefined>();
  const [isDirty, setIsDirty] = useState(false);
  // Keep reference to complete config data for merging during save
  const configDataRef = useRef<Record<string, unknown>>({});

  const { config, loading: configLoading } = useBlockConfig(
    selectedBlock?.name || null,
    selectedBlock?.type || null
  );

  // Update selected block with loaded config
  useEffect(() => {
    if (selectedBlock && config) {
      const updatedBlock: Block = {
        ...selectedBlock,
        schema: config.schema as Block['schema'],
        pages: config.pages,
        layoutSlots: config.layoutSlots,
      };
      setSelectedBlock(updatedBlock);

      // Store complete config data in ref for merging during save
      const configData = config.previewData || {};
      configDataRef.current = configData;

      // Set previewData from config (complete data)
      setPreviewData(configData);

      // Set first page for templates
      if (config.pages && config.pages.length > 0) {
        setCurrentPage(config.pages[0].slug);
      }
    }
  }, [config, selectedBlock?.name]);

  // Handle block selection
  const handleSelectBlock = useCallback((block: Block) => {
    setSelectedBlock(block);
    setPreviewData({});
    setCurrentPage(undefined);
    setIsDirty(false);
    configDataRef.current = {};

    // Update URL based on type
    const url = new URL(window.location.href);
    url.searchParams.delete('block');
    url.searchParams.delete('template');
    if (block.type === 'template') {
      url.searchParams.set('template', block.name);
    } else {
      url.searchParams.set('block', block.name);
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  // Handle preview data change - just update state, effect handles saving
  const handlePreviewDataChange = useCallback(
    (newData: Record<string, unknown>) => {
      setPreviewData(newData);
      setIsDirty(true);
    },
    []
  );

  // Debounced save effect - saves when data changes and is dirty
  useEffect(() => {
    // Don't save if loading, not dirty, no block selected, or config not loaded yet
    // configDataRef must have data to prevent losing fields
    if (configLoading || !isDirty || !selectedBlock || Object.keys(configDataRef.current).length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        // Merge user edits with complete config data to never lose fields
        const dataToSave = { ...configDataRef.current, ...previewData };

        await fetch(`/api/preview/${selectedBlock.name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSave),
          signal: controller.signal,
        });
        setIsDirty(false);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to save preview data:', error);
        }
      }
    }, 500);

    // Cleanup: cancel timeout and abort fetch on unmount or dependency change
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [previewData, selectedBlock, configLoading, isDirty]);

  // Handle template page navigation
  const handleNavigateToPage = useCallback((pageSlug: string) => {
    setCurrentPage(pageSlug);
  }, []);

  // Load block/template from URL on mount (runs once when blocks are loaded)
  const urlLoadedRef = useRef(false);
  useEffect(() => {
    if (blocks.length === 0 || urlLoadedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const blockName = params.get('block');
    const templateName = params.get('template');

    if (templateName) {
      const template = blocks.find((b) => b.name === templateName && b.type === 'template');
      if (template) {
        urlLoadedRef.current = true;
        handleSelectBlock(template);
      }
    } else if (blockName) {
      const block = blocks.find((b) => b.name === blockName);
      if (block) {
        urlLoadedRef.current = true;
        handleSelectBlock(block);
      }
    }
  }, [blocks, handleSelectBlock]);

  return (
    <div className="container">
      <BlocksList
        blocks={blocks}
        selectedBlock={selectedBlock}
        onSelectBlock={handleSelectBlock}
        loading={blocksLoading}
      />
      <Preview
        block={selectedBlock}
        previewData={previewData}
        currentPage={currentPage}
        loading={configLoading}
      />
      <Editor
        block={selectedBlock}
        loading={configLoading}
        previewData={previewData}
        onPreviewDataChange={handlePreviewDataChange}
        onNavigateToPage={handleNavigateToPage}
      />
    </div>
  );
}
