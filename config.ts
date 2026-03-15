// Package exports for config.ts authoring
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
  PageRef,
  PageSelectorFieldConfig,
  BlockRequires,
  ShowWhenCondition,
  FieldValidation,
  ValidationPattern,
  LayoutOverride,
  // Platform context (runtime)
  PlatformContext,
  BlockProps,
  BlockAuthContext,
  BlockI18nContext,
  BlockMember,
  BlockMemberProfile,
  // Template types
  TemplateConfig,
  TemplatePageBlueprint,
  TemplateBlockContent,
  TemplateBlockInstance,
  TemplateLayoutPosition,
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
