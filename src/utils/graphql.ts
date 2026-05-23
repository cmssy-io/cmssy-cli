import { GraphQLClient } from "graphql-request";
import { loadConfig } from "./config.js";

export function createClient(): GraphQLClient {
  const config = loadConfig();

  if (!config.apiToken) {
    throw new Error("CMSSY_API_TOKEN not configured. Run: cmssy link");
  }

  return new GraphQLClient(config.apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
    },
  });
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

const PUBLISH_JOB_POLL_FIELDS = `
  id
  workspaceId
  status
  blocks {
    type
    version
    status
    bundleMs
    error { code stage message }
  }
  timings {
    queuedAt
    buildStartedAt
    buildCompletedAt
    spawnMs
    pnpmInstallMs
    networkLockdownMs
    snapshotMs
  }
  error { code stage message }
`;

const PUBLISH_JOB_FULL_FIELDS = `
  id
  workspaceId
  status
  libManifestHash
  snapshotId
  blocks {
    type
    version
    sourceUrl
    status
    bundleUrls { server client styles }
    bundleSizes { server client styles }
    bundleMs
    ssrTestMs
    error { code stage message }
  }
  timings {
    queuedAt
    buildStartedAt
    buildCompletedAt
    spawnMs
    pnpmInstallMs
    networkLockdownMs
    snapshotMs
  }
  error { code stage message }
`;

export const PUBLISH_BLOCK_MUTATION = `
  mutation PublishBlock($input: PublishBlockInput!) {
    publishBlock(input: $input) {
      ${PUBLISH_JOB_FULL_FIELDS}
    }
  }
`;

export const PUBLISH_JOB_STATUS_QUERY = `
  query PublishJobStatus($jobId: ID!) {
    publishJobStatus(jobId: $jobId) {
      ${PUBLISH_JOB_POLL_FIELDS}
    }
  }
`;

export const PUBLISH_JOB_FULL_QUERY = `
  query PublishJobFull($jobId: ID!) {
    publishJobStatus(jobId: $jobId) {
      ${PUBLISH_JOB_FULL_FIELDS}
    }
  }
`;

export const UPDATE_WORKSPACE_LIBS_MUTATION = `
  mutation UpdateWorkspaceLibs($input: UpdateWorkspaceLibsInput!) {
    updateWorkspaceLibs(input: $input) {
      dependencies
    }
  }
`;
