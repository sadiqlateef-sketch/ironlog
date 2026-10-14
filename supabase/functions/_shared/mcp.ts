// A small Model Context Protocol server: just enough of MCP's JSON-RPC to
// offer tools to Claude over "Streamable HTTP" (one POST per message, a plain
// JSON reply, no streaming and no session state). That's all a claude.ai
// custom connector needs, and keeps the Edge Function free of extra packages.
//
// Spec: https://modelcontextprotocol.io/specification

import { z } from "zod";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (args: z.infer<S>) => Promise<ToolResult>;
}

/** Keeps each tool's own argument type when building a list of tools. */
export function tool<S extends z.ZodType>(t: Tool<S>): Tool {
  return t as unknown as Tool;
}

/** A tool answer Claude should read as "that didn't work, here's why". */
export class ToolError extends Error {}

export const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

type JsonRpcId = string | number | null;
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

/** Readable list of what was wrong with a tool call's arguments. */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "input"}: ${i.message}`).join("; ");
}

/**
 * Handles one JSON-RPC message. Returns the response to send, or null for a
 * notification (which gets an empty 202 reply).
 */
export async function handleMessage(
  msg: unknown,
  server: { name: string; title: string; version: string; instructions: string; tools: Tool[] },
): Promise<JsonRpcResponse | null> {
  if (!msg || typeof msg !== "object" || (msg as { jsonrpc?: unknown }).jsonrpc !== "2.0") {
    return fail(null, -32600, "Invalid Request");
  }
  const { id, method, params } = msg as { id?: JsonRpcId; method?: unknown; params?: Record<string, unknown> };
  if (typeof method !== "string") {
    // A response to something we never send; nothing to do.
    return id === undefined ? null : fail(id, -32600, "Invalid Request");
  }
  if (id === undefined) return null; // notifications/initialized, notifications/cancelled, ...

  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: server.title, version: server.version },
        instructions: server.instructions,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: server.tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: inputSchema(t.input),
          ...(t.annotations ? { annotations: { title: t.title, ...t.annotations } } : {}),
        })),
      });
    case "tools/call": {
      const t = server.tools.find((x) => x.name === params?.name);
      if (!t) return fail(id, -32602, `Unknown tool: ${String(params?.name)}`);
      const args = t.input.safeParse(params?.arguments ?? {});
      if (!args.success) return ok(id, text(`Those arguments didn't fit: ${describeIssues(args.error)}`, true));
      try {
        return ok(id, await t.run(args.data));
      } catch (e) {
        if (e instanceof ToolError) return ok(id, text(e.message, true));
        console.error(e);
        return ok(id, text("Something went wrong on the Ironlog server. Try again in a moment.", true));
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}
