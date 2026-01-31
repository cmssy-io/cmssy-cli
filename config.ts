// Package exports for block.config.ts authoring
export { defineBlock, defineTemplate } from "./dist/utils/block-config.js";

// Re-export all types from @cmssy/types
export type {
  // Block types
  BlockConfig,
  FieldConfig,
  BaseFieldConfig,
  SelectFieldConfig,
  MultiselectFieldConfig,
  RepeaterFieldConfig,
  MediaFieldConfig,
  SliderFieldConfig,
  PageSelectorFieldConfig,
  BlockRequires,
  ShowWhenCondition,
  FieldValidation,
  ValidationPattern,
  LayoutOverride,
  // Template types
  TemplateConfig,
  TemplatePageBlueprint,
  TemplateBlockInstance,
  TemplateLayoutSlot,
  TemplateTheme,
  ResourceConfig,
} from "@cmssy/types";

// Export const enums and functions
export {
  FieldType,
  LayoutPosition,
  WorkspaceModule,
  FeatureFlag,
  isTemplateConfig,
} from "@cmssy/types";
