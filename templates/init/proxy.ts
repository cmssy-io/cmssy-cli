import { NextResponse, type NextRequest } from "next/server";
import {
  applyCmssyCsp,
  CMSSY_EDIT_HEADER,
  isCmssyEditRequest,
} from "@cmssy/next";
import { cmssy } from "@/cmssy.config";

// Next.js "proxy" (formerly middleware). It does two things:
//  1. Detects cmssy edit mode (`?cmssyEdit=1`) and exposes it to server
//     components via the CMSSY_EDIT_HEADER (stripped from inbound requests
//     first so a client can't forge it).
//  2. Applies the CSP `frame-ancestors` so the cmssy editor can frame this
//     site in edit mode. editorOrigin defaults to the cmssy admin.
export function proxy(request: NextRequest) {
  const editMode = isCmssyEditRequest(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(CMSSY_EDIT_HEADER);
  if (editMode) requestHeaders.set(CMSSY_EDIT_HEADER, "1");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (editMode) {
    applyCmssyCsp(response, { editorOrigin: cmssy.editorOrigin });
  }
  return response;
}

export const config = {
  // Skip Next internals, the API routes, and files with an extension.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
