export const DEFAULT_API_URL = "https://api.cmssy.io/graphql";

const SITE_CONFIG_QUERY = `query PublicSiteConfig($workspaceSlug: String!) {
  publicSiteConfig(workspaceSlug: $workspaceSlug) {
    workspaceId
    siteName
    defaultLanguage
    enabledLanguages
  }
}`;

/** siteName comes back language-keyed ({ en: "..." }); resolve a display string. */
function pickName(
  value: string | Record<string, string> | null | undefined,
  defaultLanguage: string | undefined,
): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return value[defaultLanguage ?? "en"] ?? Object.values(value)[0] ?? null;
  }
  return null;
}

export type WorkspaceLookup =
  | { status: "found"; siteName: string | null }
  | { status: "not-found" }
  | { status: "error"; message: string };

/** Resolve a workspace by slug against the public, unauthenticated delivery API. */
export async function resolveWorkspace(
  slug: string,
  apiUrl: string = DEFAULT_API_URL,
): Promise<WorkspaceLookup> {
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: SITE_CONFIG_QUERY,
        variables: { workspaceSlug: slug },
      }),
    });
    if (!res.ok) {
      return {
        status: "error",
        message: `delivery API returned ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      data?: {
        publicSiteConfig: {
          siteName?: string | Record<string, string> | null;
          defaultLanguage?: string;
        } | null;
      };
    };
    const config = json.data?.publicSiteConfig;
    if (!config) return { status: "not-found" };
    return {
      status: "found",
      siteName: pickName(config.siteName, config.defaultLanguage),
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
