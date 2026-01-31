import fs from "fs-extra";
import path from "path";
import {
  FieldConfig,
  RepeaterFieldConfig,
  SelectFieldConfig,
} from "../types/block-config.js";
import { FieldTypeDefinition } from "./field-schema.js";

// Default value type mappings (used when field types are not provided)
const DEFAULT_VALUE_TYPES: Record<string, string> = {
  singleLine: "string",
  multiLine: "string",
  richText: "string",
  numeric: "number",
  date: "string",
  media: "string",
  link: "string",
  select: "string",
  multiselect: "string[]",
  boolean: "boolean",
  color: "string",
  slider: "number",
  repeater: "Record<string, unknown>[]",
  form: "string",
  emailTemplate: "string",
  emailConfiguration: "string",
};

export interface GenerateTypesOptions {
  blockPath: string;
  schema: Record<string, FieldConfig>;
  fieldTypes?: FieldTypeDefinition[];
}

export async function generateTypes(options: GenerateTypesOptions): Promise<void> {
  const { blockPath, schema, fieldTypes } = options;
  const typeDefinition = generateTypeDefinition({ schema, fieldTypes, indent: "  " });
  const outputPath = path.join(blockPath, "src", "block.d.ts");

  const fileContent = `// Auto-generated from block.config.ts
// DO NOT EDIT - This file is automatically regenerated

export interface BlockContent {
${typeDefinition}
}
`;

  await fs.writeFile(outputPath, fileContent);
}

interface GenerateTypeDefinitionOptions {
  schema: Record<string, FieldConfig>;
  fieldTypes?: FieldTypeDefinition[];
  indent?: string;
}

function generateTypeDefinition(options: GenerateTypeDefinitionOptions): string {
  const { schema, fieldTypes, indent = "  " } = options;
  const lines: string[] = [];

  Object.entries(schema).forEach(([key, field]) => {
    const optional = field.required ? "" : "?";
    const tsType = mapFieldTypeToTypeScript({ field, fieldTypes, indent });

    if (field.helpText) {
      lines.push(`${indent}/** ${field.helpText} */`);
    }
    lines.push(`${indent}${key}${optional}: ${tsType};`);
  });

  return lines.join("\n");
}

interface MapFieldTypeOptions {
  field: FieldConfig;
  fieldTypes?: FieldTypeDefinition[];
  indent?: string;
}

function mapFieldTypeToTypeScript(options: MapFieldTypeOptions): string {
  const { field, fieldTypes, indent = "  " } = options;

  // Special handling for select (generate union type from options)
  if (field.type === "select") {
    const selectField = field as SelectFieldConfig;
    if (selectField.options && selectField.options.length > 0) {
      const unionTypes = selectField.options
        .map((opt) => `"${opt.value}"`)
        .join(" | ");
      return unionTypes;
    }
    return "string";
  }

  // Special handling for repeater (generate nested type from schema)
  if (field.type === "repeater") {
    const repeaterField = field as RepeaterFieldConfig;
    if (repeaterField.schema) {
      const nestedIndent = indent + "  ";
      const nestedType = `{\n${generateTypeDefinition({
        schema: repeaterField.schema,
        fieldTypes,
        indent: nestedIndent,
      })}\n${indent}}`;
      return `Array<${nestedType}>`;
    }
    return "any[]";
  }

  // Look up valueType from backend field types
  if (fieldTypes) {
    const fieldTypeDef = fieldTypes.find((ft) => ft.type === field.type);
    if (fieldTypeDef?.valueType) {
      return fieldTypeDef.valueType;
    }
  }

  // Fall back to default mappings
  return DEFAULT_VALUE_TYPES[field.type] || "any";
}
