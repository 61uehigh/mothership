#!/usr/bin/env node
// The "mothership" MCP server every agent gets: lets agents create sub-agents,
// message each other, and ask the human. Each tool call is forwarded to the
// running app's /api/control, authenticated as the agent that launched it.
//
// Started by the runtime's TurnScheduler with MOTHERSHIP_URL and
// MOTHERSHIP_AGENT_TOKEN set, plus MOTHERSHIP_PROVIDERS and MOTHERSHIP_EFFORTS:
// comma-separated AGENT_KINDS and EFFORTS, which this plain script cannot import.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const { MOTHERSHIP_URL, MOTHERSHIP_AGENT_TOKEN } = process.env;
if (!MOTHERSHIP_URL || !MOTHERSHIP_AGENT_TOKEN) {
  process.stderr.write("control-mcp: MOTHERSHIP_URL and MOTHERSHIP_AGENT_TOKEN are required\n");
  process.exit(1);
}

// Without a list (a runtime that predates it), accept any string: /api/control validates anyway.
function oneOf(list) {
  const values = (list ?? "").split(",").filter((value) => value !== "");
  return values.length > 0 ? z.enum(values) : z.string();
}

async function control(action, args = {}) {
  let response;
  try {
    response = await fetch(`${MOTHERSHIP_URL}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${MOTHERSHIP_AGENT_TOKEN}` },
      body: JSON.stringify({ action, ...args }),
    });
  } catch (error) {
    return { content: [{ type: "text", text: `Could not connect to mothership: ${error.message}` }], isError: true };
  }
  const text = await response.text();
  return { content: [{ type: "text", text }], isError: !response.ok };
}

const server = new McpServer({ name: "mothership", version: "0.1.0" });

server.registerTool(
  "list_roles",
  { description: "List agent roles you can give a sub-agent (name, description, default provider/model/tools)." },
  () => control("list_roles"),
);

server.registerTool(
  "spawn_agent",
  {
    description:
      "Create a sub-agent and give it a self-contained task. Its result is reported back to you as a new message " +
      "when it finishes a turn, so end your turn instead of waiting. Returns the new agent's id.",
    inputSchema: {
      name: z.string().describe("Short kebab-case name, e.g. 'fix-login-test'"),
      role: z.string().optional().describe("Role name from list_roles; sets provider, model and tools"),
      provider: oneOf(process.env.MOTHERSHIP_PROVIDERS).optional().describe("Overrides the role's provider"),
      model: z.string().optional(),
      effort: oneOf(process.env.MOTHERSHIP_EFFORTS).optional(),
      task: z.string().describe("Everything the sub-agent needs: goal, context, constraints, what to report back"),
    },
  },
  (args) => control("spawn_agent", args),
);

server.registerTool(
  "message_agent",
  {
    description:
      "Send a message to another agent (e.g. a follow-up for a sub-agent). Its reply is reported back to you " +
      "automatically when it finishes the turn.",
    inputSchema: { agentId: z.string(), text: z.string() },
  },
  (args) => control("message_agent", args),
);

server.registerTool(
  "list_agents",
  { description: "List all agents with status, parent, status note and latest output. Includes your own id." },
  () => control("list_agents"),
);

server.registerTool(
  "get_agent",
  { description: "Get one agent's status, status note, links and latest output.", inputSchema: { agentId: z.string() } },
  (args) => control("get_agent", args),
);

server.registerTool(
  "ask_human",
  {
    description:
      "Ask the human a question only they can answer (a decision, missing info, or approval for an outward-facing " +
      "action). End your turn after asking; the answer arrives as a new message.",
    inputSchema: {
      question: z.string(),
      options: z.array(z.string()).optional().describe("Up to 6 suggested answers shown as buttons"),
    },
  },
  (args) => control("ask_human", args),
);

server.registerTool(
  "set_status",
  { description: "Set your one-line progress note shown on your card.", inputSchema: { status: z.string() } },
  (args) => control("set_status", args),
);

server.registerTool(
  "add_link",
  {
    description: "Attach a link you are working on (issue, PR, doc) to your card.",
    inputSchema: { label: z.string().describe("Short label, e.g. 'DEV-123' or 'PR #42'"), url: z.string() },
  },
  (args) => control("add_link", args),
);

await server.connect(new StdioServerTransport());
