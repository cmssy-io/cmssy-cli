/**
 * Test helpers for Cmssy blocks.
 * Usage: import { renderBlock } from "@cmssy/cli/test";
 */

interface RenderBlockOptions {
  content: Record<string, unknown>;
  context?: Record<string, unknown>;
}

const DEFAULT_CONTEXT = {
  locale: { current: "en", default: "en", enabled: ["en"] },
  isPreview: true,
};

/**
 * Render a block component with content and optional context.
 * Wraps @testing-library/react render with block-specific props.
 */
export async function renderBlock(Component: any, options: RenderBlockOptions) {
  let render: any;
  try {
    const rtl = await import("@testing-library/react");
    render = rtl.render;
  } catch {
    throw new Error(
      "Missing @testing-library/react. Install it:\n  npm install -D @testing-library/react",
    );
  }

  let React: any;
  try {
    React = await import("react");
  } catch {
    throw new Error("Missing react. Install it:\n  npm install react");
  }

  const context = { ...DEFAULT_CONTEXT, ...options.context };
  const element = React.createElement(Component, {
    content: options.content,
    context,
  });

  return render(element);
}

/**
 * Validate that preview data has required fields present.
 * Does not check value types - only presence of required fields.
 */
export function validatePreviewData(
  schema: Record<string, any>,
  data: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [key, field] of Object.entries(schema)) {
    if (
      field.required &&
      (data[key] === undefined || data[key] === null || data[key] === "")
    ) {
      errors.push(`Required field "${key}" is missing or empty`);
    }
  }

  return { valid: errors.length === 0, errors };
}
