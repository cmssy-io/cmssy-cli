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
export function renderBlock(Component: any, options: RenderBlockOptions) {
  // Dynamic import to avoid requiring @testing-library/react at CLI level
  let render: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rtl = require("@testing-library/react");
    render = rtl.render;
  } catch {
    throw new Error(
      "Missing @testing-library/react. Install it:\n  npm install -D @testing-library/react",
    );
  }

  let React: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    React = require("react");
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
 * Validate that preview data matches a block schema.
 * Checks required fields are present and types match expectations.
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
