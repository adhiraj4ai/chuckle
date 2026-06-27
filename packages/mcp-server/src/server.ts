import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handlePublish } from "./tools/publish.js";
import { handleCheck } from "./tools/check.js";
import { handleList } from "./tools/list.js";

export function createServer(vaultPath: string): Server {
  const server = new Server(
    { name: "chuckle", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "publish_document",
        description:
          "Copy a markdown document into the Chuckle vault and create a git commit recording the submission for review.",
        inputSchema: {
          type: "object",
          properties: {
            source_path: {
              type: "string",
              description: "Absolute path to the .md file in the project repo",
            },
            feature_name: {
              type: "string",
              description:
                "Vault feature folder name (e.g. 'user-auth'). Inferred from filename if omitted.",
            },
            document_type: {
              type: "string",
              enum: ["spec", "plan"],
              description: "Document type — spec or plan",
            },
          },
          required: ["source_path", "document_type"],
        },
      },
      {
        name: "check_approval",
        description:
          "Return the current approval status of a document in the vault.",
        inputSchema: {
          type: "object",
          properties: {
            feature_name: {
              type: "string",
              description: "Vault feature folder name (e.g. 'user-auth')",
            },
            document_type: {
              type: "string",
              enum: ["spec", "plan"],
            },
          },
          required: ["feature_name", "document_type"],
        },
      },
      {
        name: "list_pending",
        description:
          "List all documents in the vault that are awaiting approval (status = pending).",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      if (name === "publish_document") {
        result = await handlePublish(vaultPath, args);
      } else if (name === "check_approval") {
        result = await handleCheck(vaultPath, args);
      } else if (name === "list_pending") {
        result = await handleList(vaultPath);
      } else {
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}
