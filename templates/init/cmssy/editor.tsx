"use client";

import { CmssyLazyEditor } from "@cmssy/react/client";
import type { CmssyEditorProps } from "@cmssy/next";

// The editor lazy-loads your block registry on the client, so server-only
// code (block loaders) is never bundled for the browser.
export function CmssyEditor(props: CmssyEditorProps) {
  return <CmssyLazyEditor {...props} load={() => import("./blocks")} />;
}
