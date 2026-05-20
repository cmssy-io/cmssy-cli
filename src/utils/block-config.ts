import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import type {
  FieldType,
  FieldTypeValueMap,
  FieldValidation,
  ShowWhenCondition,
  TypedFieldConfig,
} from "@cmssy/types";
import type { DefineThemeConfig } from "@cmssy/types";
import {
  BlockConfig,
  FieldConfig,
  RepeaterFieldConfig,
  ResourceConfig,
  SelectFieldConfig,
  TemplateConfig,
  TypedBlockConfig,
} from "../types/block-config.js";
import { getFieldTypes, isValidFieldType } from "./field-schema.js";

// =============================================================================
// CONFIG AUTHORING HELPERS
// =============================================================================

// Brand symbol - only field() can produce a FieldDef
declare const __fieldBrand: unique symbol;

/** Branded field config - must be created via field() helper */
export type FieldDef = TypedFieldConfig & { readonly [__fieldBrand]: true };

// Extra properties specific to certain field types
type FieldTypeExtras = {
  select: { options: Array<{ label: string; value: string }> };
  multiselect: { options: Array<{ label: string; value: string }> };
  numeric: { minValue?: number; maxValue?: number };
  repeater: {
    minItems?: number;
    maxItems?: number;
    schema: Record<string, FieldDef>;
  };
  media: { accept?: string; maxSize?: number };
  pageSelector: { multiple?: boolean };
};

// Full input config for field() - base props + type-specific extras
type FieldInputConfig<T extends FieldType> = {
  type: T;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: FieldTypeValueMap[T];
  helperText?: string;
  /** @deprecated Use `helperText` instead */
  helpText?: string;
  group?: string;
  showWhen?: ShowWhenCondition;
  validation?: FieldValidation;
} & (T extends keyof FieldTypeExtras ? FieldTypeExtras[T] : {});

/**
 * Type-safe field config helper. Required for all schema fields.
 * Infers the field type from `type` and narrows `defaultValue` accordingly.
 *
 * @example
 * field({ type: "singleLine", label: "Title", defaultValue: "Hello" })  // ✓
 * field({ type: "singleLine", label: "Title", defaultValue: 123 })      // ✗ TS error
 */
export function field<T extends FieldType>(
  config: FieldInputConfig<T>,
): FieldDef {
  return config as unknown as FieldDef;
}

// defineBlock requires branded FieldDef - enforces field() usage
export function defineBlock(
  config: Omit<TypedBlockConfig, "schema"> & {
    schema: Record<string, FieldDef>;
    /** External package dependencies (e.g., { "framer-motion": "^11.0.0" }) */
    dependencies?: Record<string, string>;
  },
): BlockConfig & { dependencies?: Record<string, string> } {
  return config as unknown as BlockConfig & {
    dependencies?: Record<string, string>;
  };
}

// defineTemplate requires branded FieldDef in schema (if present)
export function defineTemplate(
  config: Omit<TemplateConfig, "schema"> & {
    schema?: Record<string, FieldDef>;
  },
): TemplateConfig {
  return config as unknown as TemplateConfig;
}

// defineTheme for theme/config.ts authoring
export function defineTheme(config: DefineThemeConfig): DefineThemeConfig {
  return config;
}

/**
 * Resolve the config file for a block or template.
 * Both use a unified `config.ts` file.
 */
export function resolveConfigPath(resourcePath: string): string | null {
  const candidate = path.join(resourcePath, "config.ts");
  return fs.existsSync(candidate) ? candidate : null;
}

// Load config.ts dynamically
export async function loadBlockConfig(
  blockPath: string,
): Promise<ResourceConfig | null> {
  const configPath = resolveConfigPath(blockPath);

  if (!configPath) {
    return null;
  }

  try {
    // Find tsx binary - try multiple locations
    const cliPath = path.dirname(
      path.dirname(new URL(import.meta.url).pathname),
    );

    // Possible locations for tsx binary
    const possibleTsxPaths = [
      path.join(cliPath, "..", "node_modules", ".bin", "tsx"), // CLI's node_modules (dist -> root)
      path.join(cliPath, "..", "..", "node_modules", ".bin", "tsx"), // If symlinked
      path.join(process.cwd(), "node_modules", ".bin", "tsx"), // Project's node_modules
    ];

    let tsxBinary = possibleTsxPaths.find((p) => fs.existsSync(p));

    // If not found, use npx as fallback
    if (!tsxBinary) {
      tsxBinary = "npx -y tsx"; // Use npx with -y to auto-install if needed
    }

    const cacheDir = path.join(process.cwd(), ".cmssy", "cache");
    fs.ensureDirSync(cacheDir);

    // Create a mock cmssy-cli/config module in cache
    const mockConfigPath = path.join(cacheDir, "cmssy-cli-config.mjs");
    const mockConfig = `export const defineBlock = (config) => config;\nexport const defineTemplate = (config) => config;\nexport const defineTheme = (config) => config;\nexport const field = (config) => config;`;
    fs.writeFileSync(mockConfigPath, mockConfig);

    // Read original config and replace import path to point to mock
    const configContent = fs.readFileSync(configPath, "utf-8");
    const modifiedConfig = configContent.replace(
      /from\s+['"](?:@cmssy\/cli\/config|cmssy-cli\/config)['"]/g,
      `from '${mockConfigPath.replace(/\\/g, "/")}'`,
    );

    // Write modified config to temp file
    const tempConfigPath = path.join(
      cacheDir,
      `temp-${path.basename(configPath)}`,
    );
    fs.writeFileSync(tempConfigPath, modifiedConfig);

    // Execute with tsx - use --eval to import and output
    const evalCode = `import cfg from '${tempConfigPath.replace(
      /\\/g,
      "/",
    )}'; console.log(JSON.stringify(cfg.default || cfg));`;

    // Build command - handle both direct binary path and npx
    const command = tsxBinary.includes("npx")
      ? `${tsxBinary} --eval "${evalCode}"`
      : `"${tsxBinary}" --eval "${evalCode}"`;

    const output = execSync(command, {
      encoding: "utf-8",
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Clean up
    fs.removeSync(tempConfigPath);
    fs.removeSync(mockConfigPath);

    // Parse JSON output
    const lines = output.trim().split("\n");
    const jsonLine = lines[lines.length - 1];
    const config = JSON.parse(jsonLine);
    return config;
  } catch (error: any) {
    throw new Error(`Failed to load config at ${configPath}: ${error.message}`);
  }
}

// Validate defaultValue types match field type expectations
export function validateDefaultValues(schema: Record<string, FieldConfig>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  function check(key: string, field: FieldConfig, parentPath = ""): void {
    const fullPath = parentPath ? `${parentPath}.${key}` : key;
    if (field.defaultValue === undefined) return;
    const val = field.defaultValue;

    switch (field.type) {
      case "singleLine":
      case "multiLine":
      case "richText":
      case "date":
      case "media":
      case "link":
      case "select":
      case "color":
      case "form":
        if (typeof val !== "string") {
          errors.push(
            `"${fullPath}": type "${field.type}" expects string defaultValue, got ${typeof val}`,
          );
        }
        break;
      case "numeric":
        if (typeof val !== "number") {
          errors.push(
            `"${fullPath}": type "numeric" expects number defaultValue, got ${typeof val}`,
          );
        }
        break;
      case "boolean":
        if (typeof val !== "boolean") {
          errors.push(
            `"${fullPath}": type "boolean" expects boolean defaultValue, got ${typeof val}`,
          );
        }
        break;
      case "multiselect":
        if (
          !Array.isArray(val) ||
          !val.every((v: unknown) => typeof v === "string")
        ) {
          errors.push(
            `"${fullPath}": type "multiselect" expects string[] defaultValue`,
          );
        }
        break;
      case "repeater":
        if (
          !Array.isArray(val) ||
          !val.every(
            (item: unknown) =>
              item !== null && typeof item === "object" && !Array.isArray(item),
          )
        ) {
          errors.push(
            `"${fullPath}": type "repeater" expects Record<string, unknown>[] defaultValue`,
          );
        }
        break;
      case "pageSelector":
        if (!Array.isArray(val)) {
          errors.push(
            `"${fullPath}": type "pageSelector" expects PageRef[] defaultValue, got ${typeof val}`,
          );
        }
        break;
    }

    // Recurse into repeater schema
    if (field.type === "repeater") {
      const repeater = field as RepeaterFieldConfig;
      if (repeater.schema) {
        Object.entries(repeater.schema).forEach(([k, f]) =>
          check(k, f as FieldConfig, fullPath),
        );
      }
    }
  }

  Object.entries(schema).forEach(([key, field]) => check(key, field));
  return { valid: errors.length === 0, errors };
}

// Validate schema against backend field types
export async function validateSchema(
  schema: Record<string, FieldConfig>,
  blockPath: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const fieldTypes = await getFieldTypes();

  function validateField(
    key: string,
    field: FieldConfig,
    parentPath = "",
  ): void {
    const fullPath = parentPath ? `${parentPath}.${key}` : key;

    // Check if field type is valid
    if (!isValidFieldType(field.type, fieldTypes)) {
      errors.push(
        `Invalid field type "${
          field.type
        }" for field "${fullPath}". Valid types: ${fieldTypes
          .map((ft) => ft.type)
          .join(", ")}`,
      );
    }

    // Validate repeater nested schema
    if (field.type === "repeater") {
      const repeaterField = field as RepeaterFieldConfig;
      if (!repeaterField.schema || typeof repeaterField.schema !== "object") {
        errors.push(
          `Repeater field "${fullPath}" must have a "schema" property`,
        );
      } else {
        // Recursively validate nested schema
        Object.entries(repeaterField.schema).forEach(
          ([nestedKey, nestedField]) => {
            validateField(nestedKey, nestedField as FieldConfig, fullPath);
          },
        );
      }

      // Validate minItems/maxItems
      if (repeaterField.minItems !== undefined && repeaterField.minItems < 0) {
        errors.push(
          `Repeater field "${fullPath}" has invalid minItems (must be >= 0)`,
        );
      }
      if (repeaterField.maxItems !== undefined && repeaterField.maxItems < 1) {
        errors.push(
          `Repeater field "${fullPath}" has invalid maxItems (must be >= 1)`,
        );
      }
      if (
        repeaterField.minItems &&
        repeaterField.maxItems &&
        repeaterField.minItems > repeaterField.maxItems
      ) {
        errors.push(`Repeater field "${fullPath}" has minItems > maxItems`);
      }
    }

    // Validate select/multiselect options
    if (field.type === "select" || field.type === "multiselect") {
      const selectField = field as SelectFieldConfig;
      if (
        !selectField.options ||
        !Array.isArray(selectField.options) ||
        selectField.options.length === 0
      ) {
        errors.push(
          `${field.type} field "${fullPath}" must have at least one option`,
        );
      }
    }

    // Warn about required fields with default values
    if (field.required && field.defaultValue !== undefined) {
      console.warn(
        chalk.yellow(
          `Warning: Field "${fullPath}" is required but has a defaultValue. The defaultValue will be ignored.`,
        ),
      );
    }
  }

  Object.entries(schema).forEach(([key, field]) => {
    validateField(key, field);
  });

  return { valid: errors.length === 0, errors };
}

// Generate package.json cmssy section from config.ts
export function generatePackageJsonMetadata(
  config: ResourceConfig,
  packageType: "block" | "template",
): any {
  // Convert schema to legacy schemaFields format (if schema exists)
  const schemaFields = config.schema
    ? convertSchemaToLegacyFormat(config.schema)
    : [];

  // Extract default content from schema
  const defaultContent = config.schema
    ? extractDefaultContent(config.schema)
    : {};

  return {
    packageType,
    displayName: config.name,
    description: config.description,
    longDescription: config.longDescription,
    category:
      config.category || (packageType === "template" ? "pages" : "other"),
    tags: config.tags || [],
    schemaFields,
    defaultContent,
  };
}

function convertSchemaToLegacyFormat(
  schema: Record<string, FieldConfig>,
): any[] {
  const fields: any[] = [];

  function convertField(key: string, field: FieldConfig): any {
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

    if (field.type === "select") {
      const selectField = field as SelectFieldConfig;
      baseField.options = selectField.options;
    }

    if (field.type === "repeater") {
      const repeaterField = field as RepeaterFieldConfig;
      const nestedFields = convertSchemaToLegacyFormat(repeaterField.schema);
      baseField.minItems = repeaterField.minItems;
      baseField.maxItems = repeaterField.maxItems;
      baseField.itemSchema = {
        type: "object",
        fields: nestedFields,
      };
    }

    return baseField;
  }

  Object.entries(schema).forEach(([key, field]) => {
    fields.push(convertField(key, field));
  });

  return fields;
}

export function extractDefaultContent(
  schema: Record<string, FieldConfig>,
): any {
  const content: any = {};

  Object.entries(schema).forEach(([key, field]) => {
    if (field.defaultValue !== undefined) {
      content[key] = field.defaultValue;
    } else if (field.type === "repeater") {
      // Repeaters default to empty array
      content[key] = [];
    }
  });

  return content;
}
