/**
 * Type definitions for block.config.ts system.
 * Re-exports from @cmssy/types - the single source of truth.
 */

export {
  // Field types
  FieldType,
  type FieldConfig,
  type BaseFieldConfig,
  type SelectFieldConfig,
  type MultiselectFieldConfig,
  type RepeaterFieldConfig,
  type MediaFieldConfig,
  type SliderFieldConfig,
  type PageSelectorFieldConfig,
  type FieldValidation,
  type ValidationPattern,
  type ShowWhenCondition,

  // Layout
  LayoutPosition,
  type LayoutOverride,

  // Modules & features
  WorkspaceModule,
  FeatureFlag,
  type BlockRequires,

  // Block config
  type BlockConfig,
  BlockSource,
  PackageType,

  // Template config
  type TemplateConfig,
  type TemplateBlockInstance,
  type TemplatePageBlueprint,
  type TemplateLayoutPosition,
  type TemplateTheme,
  type ResourceConfig,
  isTemplateConfig,
} from "@cmssy/types";
