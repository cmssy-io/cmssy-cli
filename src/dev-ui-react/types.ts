export interface Block {
  type: 'block' | 'template';
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  tags?: string[];
  version: string;
  hasConfig?: boolean;
  schema?: Record<string, FieldConfig>;
  pages?: TemplatePage[];
  layoutPositions?: LayoutPosition[];
}

export interface FieldConfig {
  type: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  schema?: Record<string, FieldConfig>;
  minItems?: number;
  maxItems?: number;
}

export interface TemplatePage {
  name: string;
  slug: string;
  blocksCount: number;
}

export interface LayoutPosition {
  position: 'header' | 'footer' | 'sidebar_left' | 'sidebar_right' | 'before_content' | 'after_content';
  type: string;
  content?: Record<string, unknown>;
}

export interface Filters {
  search: string;
  type: 'all' | 'block' | 'template';
  category: string;
  tags: string[];
}
