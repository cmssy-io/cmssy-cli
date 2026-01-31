// Package exports for block.config.ts authoring
export { defineBlock, defineTemplate } from "./dist/utils/block-config.js";
export type {
  // Block types
  BlockConfig,
  FieldConfig,
  FieldType,
  BaseFieldConfig,
  SelectFieldConfig,
  RepeaterFieldConfig,
  BlockRequires,
  LayoutSlotType,
  ShowWhenCondition,
  FieldValidation,
  ValidationPattern,
  WorkspaceModule,
  FeatureFlag,
  // Template types
  TemplateConfig,
  TemplatePageBlueprint,
  TemplateBlockInstance,
  TemplateLayoutSlot,
  TemplateTheme,
} from "./dist/types/block-config.js";
