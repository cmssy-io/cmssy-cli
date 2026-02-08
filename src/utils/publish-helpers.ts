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
  layoutPositions: any[];
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

  // Convert layoutPositions to array format
  const layoutPositions: any[] = [];
  if (pagesData.layoutPositions) {
    for (const [position, data] of Object.entries(
      pagesData.layoutPositions as Record<string, any>
    )) {
      layoutPositions.push({
        position,
        type: data.type,
        content: data.content || {},
      });
    }
  }

  return { pages, layoutPositions };
}
