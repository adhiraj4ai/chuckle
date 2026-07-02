import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handlePublish } from "./tools/publish.js";
import { handleSubmit } from "./tools/submit.js";
import { handleCheck } from "./tools/check.js";
import { handleList } from "./tools/list.js";
import { recordMcpCall } from "./tools/audit-record.js";

export function createServer(vaultPath: string): Server {
  const server = new Server(
    { name: "signoff", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  const sessionId = randomUUID(); // one id per server process = one Claude Code session

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "publish_document",
        description:
          "Register an in-project markdown document for review and create a git commit recording the submission — no copy made.",
        inputSchema: {
          type: "object",
          properties: {
            feature_name: {
              type: "string",
              description: "Feature name (e.g. 'user-auth')",
            },
            document_type: {
              type: "string",
              enum: ["spec", "plan", "adr"],
              description: "Document type — spec, plan, or adr (architecture decision record)",
            },
            document_path: {
              type: "string",
              description: "Path to the document, relative to the project root, e.g. docs/specs/2026-06-27-user-auth-design.md",
            },
            category: {
              type: "string",
              description: "Optional suggested category name (e.g. 'Backend'). Created if absent; ignored if a reviewer already set one.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional suggested free-form tags; merged with any existing tags.",
            },
            tier: {
              type: "string",
              enum: ["light", "standard", "heavy"],
              description: "Suggested risk tier: light (spec only), standard (spec+plan), heavy (spec+plan, unanimous). Applied only if the feature has no tier yet.",
            },
            ticket_id: { type: "string", description: "Optional external ticket id, e.g. PROJ-123" },
            ticket_url: { type: "string", description: "Optional http(s) URL to the ticket" },
          },
          required: ["feature_name", "document_type", "document_path"],
        },
      },
      {
        name: "submit_for_review",
        description:
          "Submit an in-project spec/plan for review — registers the path in the vault manifest, records a pending approval, and commits.",
        inputSchema: {
          type: "object",
          properties: {
            feature_name: {
              type: "string",
              description: "Feature name (e.g. 'user-auth')",
            },
            document_type: {
              type: "string",
              enum: ["spec", "plan", "adr"],
              description: "Document type — spec, plan, or adr (architecture decision record)",
            },
            document_path: {
              type: "string",
              description: "Path to the document, relative to the project root, e.g. docs/specs/2026-06-27-user-auth-design.md",
            },
            category: {
              type: "string",
              description: "Optional suggested category name (e.g. 'Backend'). Created if absent; ignored if a reviewer already set one.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional suggested free-form tags; merged with any existing tags.",
            },
            tier: {
              type: "string",
              enum: ["light", "standard", "heavy"],
              description: "Suggested risk tier: light (spec only), standard (spec+plan), heavy (spec+plan, unanimous). Applied only if the feature has no tier yet.",
            },
            ticket_id: { type: "string", description: "Optional external ticket id, e.g. PROJ-123" },
            ticket_url: { type: "string", description: "Optional http(s) URL to the ticket" },
          },
          required: ["feature_name", "document_type", "document_path"],
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
        await recordMcpCall(vaultPath, sessionId, "publish_document", args);
      } else if (name === "submit_for_review") {
        result = await handleSubmit(vaultPath, args);
        await recordMcpCall(vaultPath, sessionId, "submit_for_review", args);
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
