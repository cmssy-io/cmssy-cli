import { GraphQLClient } from "graphql-request";
import { blockFieldGraphQLSelection } from "@cmssy/types";
import { loadConfig } from "./config.js";

export function createClient(): GraphQLClient {
  const config = loadConfig();

  if (!config.apiToken) {
    throw new Error("CMSSY_API_TOKEN not configured. Run: cmssy configure");
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

export const ADD_BLOCK_SOURCE_CODE_MUTATION = `
  mutation AddBlockSourceCode($input: AddBlockSourceCodeInput!) {
    addBlockSourceCode(input: $input) {
      id
      blockType
      name
      sourceUrl
      sourceCssUrl
      dependenciesUrl
    }
  }
`;

export const GET_WORKSPACE_BLOCKS_QUERY = `
  query GetWorkspaceBlocks {
    workspaceBlocks {
      id
      blockType
      name
      sourceUrl
    }
  }
`;
