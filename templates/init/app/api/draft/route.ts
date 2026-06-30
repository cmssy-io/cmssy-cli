import { createDraftRoute } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

// The cmssy editor hits this route (with the draftSecret) to enter preview mode.
export const GET = createDraftRoute(cmssy);
