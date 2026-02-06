import { GraphQLClient } from "graphql-request";
import { loadConfig } from "./config.js";

export function createClient(): GraphQLClient {
  const config = loadConfig();

  if (!config.apiToken) {
    throw new Error(
      "CMSSY_API_TOKEN not configured. Run: cmssy configure"
    );
  }

  return new GraphQLClient(config.apiUrl, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiToken}`,
    },
  });
}

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
        key
        type
        label
        defaultValue
        placeholder
        required
        helperText
        options
        minValue
        maxValue
        group
        showWhen {
          field
          equals
          notEquals
          notEmpty
          isEmpty
        }
        validation {
          minLength
          maxLength
          min
          max
          pattern
          message
        }
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
      layoutPositionsCreated
      layoutPositionsUpdated
      message
    }
  }
`;

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
