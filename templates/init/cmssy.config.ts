import type { CmssyNextConfig } from "@cmssy/next";

export const cmssy: CmssyNextConfig = {
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG ?? "",
  draftSecret: process.env.CMSSY_DRAFT_SECRET ?? "",
  // apiUrl: process.env.CMSSY_API_URL,
  // editorOrigin: process.env.CMSSY_EDITOR_ORIGIN,
};
