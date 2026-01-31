import { useState, useEffect, useCallback } from 'react';
import { Block } from '../types';

export function useBlocks() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/blocks');
      if (!response.ok) throw new Error('Failed to load blocks');
      const data = await response.json();
      setBlocks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  return { blocks, loading, error, refresh: loadBlocks, setBlocks };
}

export function useBlockConfig(blockName: string | null, _blockType: string | null) {
  const [config, setConfig] = useState<{
    schema?: Record<string, unknown>;
    previewData?: Record<string, unknown>;
    pages?: Array<{ name: string; slug: string; blocksCount: number }>;
    layoutSlots?: Array<{ slot: string; type: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blockName) {
      setConfig(null);
      return;
    }

    const loadConfig = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load block config (includes pages/layoutSlots for templates)
        const configResponse = await fetch(`/api/blocks/${blockName}/config`);
        if (!configResponse.ok) throw new Error('Failed to load config');
        const configData = await configResponse.json();

        // Debug: log raw API response (remove after debugging)
        console.log(`[useBlockConfig] Raw config for "${blockName}":`, configData);
        console.log('[useBlockConfig] previewData from API:', configData.previewData);
        console.log('[useBlockConfig] previewData keys:', Object.keys(configData.previewData || {}));
        console.log('[useBlockConfig] previewData.values:', configData.previewData?.values);

        setConfig({
          schema: configData.schema,
          previewData: configData.previewData,
          pages: configData.pages,
          layoutSlots: configData.layoutSlots,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [blockName]);

  return { config, loading, error };
}
