/**
 * Helper functions for the publish command.
 * Extracted for testability.
 */

/**
 * Convert block.config.ts schema to schemaFields array for GraphQL mutation.
 */
export function convertSchemaToFields(schema: Record<string, any>): any[] {
  const fields: any[] = [];

  Object.entries(schema).forEach(([key, field]: [string, any]) => {
    const baseField: any = {
      key,
      type: field.type,
      label: field.label,
      required: field.required || false,
    };

    // Add defaultValue if present
    if (field.defaultValue !== undefined) {
      baseField.defaultValue = field.defaultValue;
    }

    // Add placeholder if present
    if (field.placeholder) {
      baseField.placeholder = field.placeholder;
    }

    // Add helpText if present
    if (field.helpText) {
      baseField.helperText = field.helpText;
    }

    // Add group if present
    if (field.group) {
      baseField.group = field.group;
    }

    // Add showWhen conditional visibility
    if (field.showWhen) {
      baseField.showWhen = field.showWhen;
    }

    // Add validation rules
    if (field.validation) {
      baseField.validation = field.validation;
    }

    if (field.type === "select" && field.options) {
      baseField.options = field.options;
    }

    if (field.type === "repeater" && field.schema) {
      baseField.minItems = field.minItems;
      baseField.maxItems = field.maxItems;
      // Backend expects itemSchema to be a flat array of field definitions
      baseField.itemSchema = convertSchemaToFields(field.schema);
    }

    fields.push(baseField);
  });

  return fields;
}

/**
 * Extract default content values from schema.
 */
export function extractDefaultContent(schema: Record<string, any>): any {
  const content: any = {};

  Object.entries(schema).forEach(([key, field]: [string, any]) => {
    if (field.defaultValue !== undefined) {
      content[key] = field.defaultValue;
    } else if (field.type === "repeater") {
      content[key] = [];
    }
  });

  return content;
}

/**
 * Extract block type from full package name.
 * @example "@cmssy/blocks.hero" -> "hero"
 * @example "@org/templates.landing" -> "landing"
 */
export function extractBlockType(packageName: string): string {
  return packageName
    .replace(/@[^/]+\//, "") // Remove @scope/
    .replace(/^blocks\./, "") // Remove blocks. prefix
    .replace(/^templates\./, ""); // Remove templates. prefix
}

/**
 * Add __component to mount/update pattern for SSR compatibility.
 * This makes blocks work in both dev environment (mount/update) and SSR (__component).
 */
export function addComponentForSSR(code: string): string {
  // Check if code exports mount/update pattern
  const hasPattern =
    /exports\.default\s*=\s*\{[^}]*mount\s*\([^)]*\)/s.test(code) ||
    /module\.exports\s*=\s*\{[^}]*mount\s*\([^)]*\)/s.test(code);

  if (!hasPattern) {
    // No mount/update pattern - return as-is
    return code;
  }

  // Find the component that's being used in mount()
  // Pattern: export default { mount() { ... render(<Component ... /> or createElement(Component ...) } }
  const componentMatch = code.match(
    /(?:render|createElement)\s*\(\s*(?:<\s*)?(\w+)/
  );
  const componentName = componentMatch?.[1];

  if (!componentName) {
    console.warn(
      "[CLI] Warning: Found mount/update pattern but could not extract component name for __component"
    );
    return code;
  }

  // Add __component to the exports object
  // Replace: module.exports = { mount, update, unmount };
  // With:    module.exports = { mount, update, unmount, __component: ComponentName };
  const updatedCode = code.replace(
    /((?:exports\.default|module\.exports)\s*=\s*\{[^}]*)(}\s*;)/s,
    `$1,\n  // Auto-added by CLI for SSR compatibility\n  __component: ${componentName}\n$2`
  );

  if (updatedCode === code) {
    console.warn("[CLI] Warning: Could not add __component to exports");
  }

  return updatedCode;
}

/**
 * Detect if a package is a template based on type.
 */
export function isTemplate(packageType: "block" | "template"): boolean {
  return packageType === "template";
}

/**
 * Parse pages.json data and convert to mutation input format.
 */
export function parsePagesJson(pagesData: any): {
  pages: any[];
  layoutSlots: any[];
} {
  // Convert pages
  const pages = (pagesData.pages || []).map((page: any) => ({
    name: page.name,
    slug: page.slug,
    blocks: (page.blocks || []).map((block: any) => ({
      type: block.type,
      content: block.content || {},
    })),
  }));

  // Convert layoutSlots to array format
  const layoutSlots: any[] = [];
  if (pagesData.layoutSlots) {
    for (const [slot, data] of Object.entries(
      pagesData.layoutSlots as Record<string, any>
    )) {
      layoutSlots.push({
        slot,
        type: data.type,
        content: data.content || {},
      });
    }
  }

  return { pages, layoutSlots };
}
