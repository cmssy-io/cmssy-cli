import { useRef, useEffect, memo } from 'react';
import { Block } from '../types';

interface PreviewProps {
  block: Block | null;
  previewData: Record<string, unknown>;
  currentPage?: string;
  loading?: boolean;
}

export const Preview = memo(function Preview({ block, previewData, currentPage, loading }: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadedRef = useRef(false);
  const lastSentDataRef = useRef<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Send props to iframe with debounce to prevent flickering
  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !iframeLoadedRef.current) {
      return;
    }

    // Don't send if previewData is empty (initial state)
    if (!previewData || Object.keys(previewData).length === 0) {
      return;
    }

    // Don't send if data hasn't changed
    const dataString = JSON.stringify(previewData);
    if (dataString === lastSentDataRef.current) {
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce postMessage to reduce flickering
    debounceRef.current = setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        lastSentDataRef.current = dataString;
        iframeRef.current.contentWindow.postMessage(
          { type: 'UPDATE_PROPS', props: previewData },
          '*'
        );
      }
    }, 150);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [previewData]);

  // Handle iframe load - mark as loaded but don't send data
  // The iframe already has correct data from the server
  const handleIframeLoad = () => {
    iframeLoadedRef.current = true;
    // Store current data as "sent" so we don't re-send it
    if (previewData && Object.keys(previewData).length > 0) {
      lastSentDataRef.current = JSON.stringify(previewData);
    }
  };

  // Reset loaded state when URL changes
  useEffect(() => {
    iframeLoadedRef.current = false;
    lastSentDataRef.current = '';
  }, [block?.name, currentPage]);

  if (!block) {
    return (
      <div className="preview-panel">
        <div className="preview-header">
          <div className="preview-info">
            <div className="preview-title">Preview</div>
          </div>
        </div>
        <div className="preview-content">
          <div className="preview-empty">
            <div className="preview-empty-icon">👈</div>
            <p>Select a block to preview</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="preview-panel">
        <div className="preview-header">
          <div className="preview-info">
            <div className="preview-title">{block.displayName}</div>
          </div>
        </div>
        <div className="preview-content">
          <div className="preview-empty">
            <div className="spinner" />
            <p>Loading preview...</p>
          </div>
        </div>
      </div>
    );
  }

  // Guard against invalid block name
  if (!block.name || typeof block.name !== 'string') {
    console.error('[Preview] Invalid block.name:', block.name, 'block:', block);
    return null;
  }

  const isTemplate = block.type === 'template' && block.pages && block.pages.length > 0;
  const previewUrl = isTemplate
    ? `/preview/template/${block.name}/${currentPage || block.pages?.[0]?.slug || ''}`
    : `/preview/${block.name}`;

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div className="preview-info">
          <div className="preview-title">{block.displayName}</div>
        </div>
        <div className="preview-actions">
          <div className="preview-badge">Ready</div>
          <button className="btn-publish" onClick={() => window.openPublishModal?.()}>
            Publish
          </button>
        </div>
      </div>
      <div className="preview-content">
        <div className={`preview-iframe-wrapper ${isTemplate ? 'template-preview' : ''}`}>
          <iframe
            ref={iframeRef}
            className="preview-iframe"
            src={previewUrl}
            key={previewUrl}
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
});
