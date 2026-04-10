// Package exports for config.ts authoring
export {
  defineBlock,
  defineTemplate,
  defineTheme,
  field,
  type FieldDef,
} from "./dist/utils/block-config.js";

// Re-export all types from @cmssy/types
export type {
  // Block types
  BlockConfig,
  TypedBlockConfig,
  FieldConfig,
  TypedFieldConfig,
  FieldValue,
  FieldTypeValueMap,
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
  BlockLocaleContext,
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
  // Theme authoring
  DefineThemeConfig,
  ThemeFontConfig,
  ThemeColorsConfig,
  ThemeTypographyConfig,
  FontSource,
  BorderRadiusPreset,
} from "@cmssy/types";

// Export const enums, functions, and runtime values
export {
  FieldType,
  FIELD_TYPE_DEFAULTS,
  LayoutPosition,
  WorkspaceModule,
  FeatureFlag,
  isTemplateConfig,
} from "@cmssy/types";
