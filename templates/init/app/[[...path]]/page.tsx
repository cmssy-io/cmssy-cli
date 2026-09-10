import { buildCmssyMetadata, createCmssyPage } from "@cmssy/next";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { CmssyEditor } from "@/cmssy/editor";

// SEO comes from the page's cmssy fields (title/description) + workspace
// branding (OG image), resolved server-side.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  return buildCmssyMetadata(cmssy, path);
}

// One catch-all route renders every cmssy page. Passing `editor` lets the cmssy
// editor frame and edit this site; published requests render published content.
export default createCmssyPage(cmssy, blocks, { editor: CmssyEditor });
