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

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Built-in validation patterns for common use cases.
 */
export type ValidationPattern = "email" | "url" | "phone" | "slug";

/**
 * Extended validation configuration for fields.
 *
 * @example
 * validation: {
 *   minLength: 3,
 *   maxLength: 100,
 *   pattern: "email",
 *   message: "Please enter a valid email address"
 * }
 */
export interface FieldValidation {
  /** Minimum length for string fields */
  minLength?: number;
  /** Maximum length for string fields */
  maxLength?: number;
  /** Minimum value for numeric fields */
  min?: number;
  /** Maximum value for numeric fields */
  max?: number;
  /** Validation pattern - built-in name or custom regex string */
  pattern?: ValidationPattern | string;
  /** Custom error message shown when validation fails */
  message?: string;
}

// =============================================================================
// CONDITIONAL FIELDS
// =============================================================================

/**
 * Condition for showing/hiding a field based on another field's value.
 *
 * @example
 * // Show only when showCta is true
 * showWhen: { field: "showCta", equals: true }
 *
 * @example
 * // Show only when layout is "custom"
 * showWhen: { field: "layout", equals: "custom" }
 *
 * @example
 * // Show when description is not empty
 * showWhen: { field: "description", notEmpty: true }
 */
export interface ShowWhenCondition {
  /** Field key to check (relative to current scope, or use "parent.field" for parent context) */
  field: string;
  /** Show when field equals this value */
  equals?: unknown;
  /** Show when field does not equal this value */
  notEquals?: unknown;
  /** Show when field value is not empty (truthy, non-empty string/array) */
  notEmpty?: boolean;
  /** Show when field value is empty (falsy, empty string/array) */
  isEmpty?: boolean;
}

// =============================================================================
// FIELD CONFIGURATIONS
// =============================================================================

export interface BaseFieldConfig {
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  helpText?: string;

  /**
   * Assign this field to a group.
   * Fields with the same group value will be organized together in a collapsible section.
   *
   * @example
   * group: "Logo"  // Field appears in the "Logo" group
   */
  group?: string;

  /**
   * Conditionally show this field based on another field's value.
   * When condition is not met, the field is hidden in the editor.
   *
   * @example
   * showWhen: { field: "showCta", equals: true }
   */
  showWhen?: ShowWhenCondition;

  /**
   * Extended validation rules for this field.
   *
   * @example
   * validation: { minLength: 3, maxLength: 100 }
   */
  validation?: FieldValidation;
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

// =============================================================================
// BLOCK REQUIREMENTS
// =============================================================================

/**
 * Available workspace modules that blocks can require.
 * If a module is required but not enabled in the workspace, the block won't be usable.
 */
export type WorkspaceModule =
  | "pim" // Product Information Management
  | "crm" // Customer Relationship Management
  | "forms" // Form Builder
  | "analytics" // Analytics & Tracking
  | "newsletter" // Newsletter/Email Marketing
  | "ecommerce"; // E-commerce features

/**
 * Available feature flags that blocks can require.
 * Features are workspace-level settings that can be enabled/disabled.
 */
export type FeatureFlag =
  | "ai-generation" // AI content generation
  | "ai-translation" // AI translation
  | "advanced-seo" // Advanced SEO features
  | "a-b-testing" // A/B testing
  | "personalization"; // Content personalization

/**
 * Platform features and requirements that a block needs.
 * These are validated at import time and passed via the `context` prop at runtime.
 *
 * @example
 * requires: {
 *   auth: true,                    // Access to auth state
 *   modules: ['pim', 'ecommerce'], // Requires PIM and ecommerce modules
 *   permissions: ['media:write'],  // Requires media write permission
 *   features: ['ai-generation'],   // Requires AI generation feature
 * }
 */
export interface BlockRequires {
  /** Request auth context (isAuthenticated, customer, logout) */
  auth?: boolean;
  /** Request current language */
  language?: boolean;
  /** Request workspace info */
  workspace?: boolean;

  /**
   * Required workspace modules.
   * Block won't be usable if any required module is not enabled.
   *
   * @example
   * modules: ['pim', 'ecommerce']
   */
  modules?: WorkspaceModule[];

  /**
   * Required user permissions to use this block.
   * Format: "resource:action" (e.g., "media:write", "pages:publish")
   *
   * @example
   * permissions: ['media:write', 'pages:publish']
   */
  permissions?: string[];

  /**
   * Required feature flags.
   * Block won't be usable if any required feature is not enabled.
   *
   * @example
   * features: ['ai-generation']
   */
  features?: FeatureFlag[];
}

// =============================================================================
// LAYOUT SLOTS
// =============================================================================

/**
 * Layout slot type for blocks that should be rendered as site-wide layout elements.
 * - "header": Rendered at the top of every page
 * - "footer": Rendered at the bottom of every page
 */
export type LayoutSlotType = "header" | "footer";

// =============================================================================
// BLOCK CONFIG
// =============================================================================

export interface BlockConfig {
  name: string;
  description?: string;
  longDescription?: string;
  category: string;
  tags?: string[];

  /**
   * Schema defining the block's editable fields.
   * Use the `group` property on individual fields to organize them into collapsible sections.
   */
  schema: Record<string, FieldConfig>;

  /** Whether block requires client-side rendering (default: false = SSR) */
  interactive?: boolean;

  /**
   * If set, this block is a layout block that will be rendered on every page.
   * When imported to a workspace, it will automatically create/update the corresponding LayoutSlot.
   *
   * @example
   * layoutSlot: "header"  // This block will be used as the site header
   * layoutSlot: "footer"  // This block will be used as the site footer
   */
  layoutSlot?: LayoutSlotType;

  /**
   * Platform features this block needs.
   * Requested features are passed via the `context` prop.
   *
   * @example
   * requires: {
   *   auth: true,      // Access to auth state (customer, logout)
   *   language: true,  // Access to current language
   * }
   */
  requires?: BlockRequires;

  pricing?: {
    licenseType: "free" | "paid";
    priceCents?: number;
  };
}

export interface TemplateConfig extends Omit<BlockConfig, "category"> {
  category?: string;
}

export type ResourceConfig = BlockConfig | TemplateConfig;
