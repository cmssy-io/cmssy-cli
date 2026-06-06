import { GraphQLClient } from "graphql-request";
import { loadConfig } from "./config.js";
import { clientHeaders } from "./version.js";
import { friendlyApiError } from "./api-error.js";

export interface BuildClientOptions {
  /** Extra request headers (e.g. X-Workspace-ID). */
  extraHeaders?: Record<string, string>;
  /**
   * Wrap `request` so version-skew GraphQL errors become actionable "upgrade"
   * messages. Default true. Set false for diagnostic callers (e.g. `doctor`)
   * that need the raw error to classify it themselves.
   */
  wrapErrors?: boolean;
}

/**
 * Single place every command builds a GraphQL client. Guarantees that ALL
 * requests carry the client-identity headers (x-client-name/version) and, by
 * default, that cryptic version-skew validation errors are rewritten into an
 * actionable message. Use this instead of `new GraphQLClient(...)` directly.
 */
export function buildClient(
  apiUrl: string,
  token?: string | null,
  opts: BuildClientOptions = {},
): GraphQLClient {
  const client = new GraphQLClient(apiUrl, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Identify the client so the API can detect/observe version drift.
      ...clientHeaders(),
      ...opts.extraHeaders,
    },
  });

  if (opts.wrapErrors !== false) {
    // Keep the public `request` type intact (call sites retain generics/
    // overloads); only the internal forwarding is loosely typed.
    const originalRequest = client.request.bind(client) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    client.request = (async (...args: unknown[]) => {
      try {
        return await originalRequest(...args);
      } catch (err) {
        throw friendlyApiError(err);
      }
    }) as GraphQLClient["request"];
  }

  return client;
}

export function createClient(): GraphQLClient {
  const config = loadConfig();

  if (!config.apiToken) {
    throw new Error("CMSSY_API_TOKEN not configured. Run: cmssy link");
  }

  return buildClient(config.apiUrl, config.apiToken);
}

// GraphQL Mutations
export const IMPORT_TEMPLATE_MUTATION = `
  mutation ImportTemplate($input: ImportTemplateInput!) {
    importTemplate(input: $input) {
      success
      block {
        id
        blockType
        name
        version
      }
      pagesCreated
      pagesUpdated
      message
    }
  }
`;

// Note: ImportTemplateInput supports these additional fields:
// - pageTypes: [TemplatePageTypeInput] - creates page types (e.g. "Blog Post")
// - resetWorkspace: Boolean - deletes pages, page types, blocks (keeps media)

export interface ImportTemplateResponse {
  importTemplate?: {
    success: boolean;
    // `block` (not `template`) matches the backend schema - templates
    // are persisted as `WorkspaceBlock` records in `workspace_blocks`,
    // so `ImportTemplateResult.block` returns the underlying block row.
    // See apps/backend/src/graphql/resolvers/workspace-template.ts.
    block?: {
      id: string;
      blockType: string;
      name: string;
      version: string;
    };
    pagesCreated?: number;
    pagesUpdated?: number;
    message?: string;
  };
}

export const UPDATE_WORKSPACE_LIBS_MUTATION = `
  mutation UpdateWorkspaceLibs($input: UpdateWorkspaceLibsInput!) {
    updateWorkspaceLibs(input: $input) {
      dependencies
    }
  }
`;
