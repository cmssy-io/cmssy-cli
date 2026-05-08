import { GraphQLClient } from "graphql-request";
import { blockFieldGraphQLSelection } from "@cmssy/types";
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

const SCHEMA_FIELDS_FRAGMENT = blockFieldGraphQLSelection();

// GraphQL Mutations
export const IMPORT_BLOCK_MUTATION = `
  mutation ImportBlock($input: ImportBlockInput!) {
    importBlock(input: $input) {
      id
      blockType
      name
      description
      icon
      category
      layoutPosition
      schemaFields {
        ${SCHEMA_FIELDS_FRAGMENT}
      }
      defaultContent
      requires {
        auth
        language
        workspace
        modules
        permissions
        features
      }
      serverActionUrl
      serverActions
      version
      createdAt
    }
  }
`;

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

export const UPDATE_THEME_MUTATION = `
  mutation UpdateTheme($input: ThemeConfigInput!) {
    updateTheme(input: $input) {
      id
      theme {
        fonts {
          heading { family source weights customFontUrl }
          body { family source weights customFontUrl }
        }
        colors {
          primary primaryForeground secondary secondaryForeground
          accent accentForeground background foreground
          muted mutedForeground card cardForeground
          border input ring destructive
        }
        typography { h1 h2 h3 h4 h5 h6 body small }
        spacing
        borderRadius
        customCSS
      }
    }
  }
`;

export const GET_SITE_CONFIG_THEME_QUERY = `
  query GetSiteConfigTheme {
    siteConfig {
      theme {
        fonts {
          heading { family source weights customFontUrl }
          body { family source weights customFontUrl }
        }
        colors {
          primary primaryForeground secondary secondaryForeground
          accent accentForeground background foreground
          muted mutedForeground card cardForeground
          border input ring destructive
        }
        typography { h1 h2 h3 h4 h5 h6 body small }
        spacing
        borderRadius
        customCSS
      }
    }
  }
`;

export const GET_WORKSPACE_BLOCKS_QUERY = `
  query GetWorkspaceBlocks {
    workspaceBlocks {
      id
      blockType
      name
      version
      schemaFields {
        ${SCHEMA_FIELDS_FRAGMENT}
      }
    }
  }
`;

const PUBLISH_JOB_FIELDS = `
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
  createdAt
  updatedAt
  completedAt
`;

export const PUBLISH_BLOCK_MUTATION = `
  mutation PublishBlock($input: PublishBlockInput!) {
    publishBlock(input: $input) {
      ${PUBLISH_JOB_FIELDS}
    }
  }
`;

export const PUBLISH_JOB_STATUS_QUERY = `
  query PublishJobStatus($jobId: ID!) {
    publishJobStatus(jobId: $jobId) {
      ${PUBLISH_JOB_FIELDS}
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
