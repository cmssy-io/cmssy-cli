// Type definitions for block.config.ts system

export type FieldType =
  | "singleLine"
  | "multiLine"
  | "richText"
  | "numeric"
  | "date"
  | "media"
  | "link"
  | "select"
  | "multiselect"
  | "boolean"
  | "color"
  | "slider"
  | "repeater";

export interface BaseFieldConfig {
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  helpText?: string;
}

export interface SelectFieldConfig extends BaseFieldConfig {
  type: "select";
  options: Array<{ label: string; value: string }>;
}

export interface RepeaterFieldConfig extends BaseFieldConfig {
  type: "repeater";
  minItems?: number;
  maxItems?: number;
  schema: Record<string, FieldConfig>;
}

export type FieldConfig =
  | BaseFieldConfig
  | SelectFieldConfig
  | RepeaterFieldConfig;

export interface BlockConfig {
  name: string;
  description?: string;
  longDescription?: string;
  category: string;
  tags?: string[];
  schema: Record<string, FieldConfig>;
  interactive?: boolean; // Whether block requires client-side rendering (default: false = SSR)
  pricing?: {
    licenseType: "free" | "paid";
    priceCents?: number;
  };
}

export interface TemplateConfig extends Omit<BlockConfig, "category"> {
  category?: string;
}

export type ResourceConfig = BlockConfig | TemplateConfig;
