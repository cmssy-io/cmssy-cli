// Package exports for block.config.ts authoring
export { defineBlock, defineTemplate } from "./dist/utils/block-config.js";
export type {
  BlockConfig,
  TemplateConfig,
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
} from "./dist/types/block-config.js";
