import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { describeCatalog, normalizeSpec, UISpec } from "./src/spec-schema.js";

// Resolve the bundled UI from both source (server.ts via tsx) and compiled (dist/server.js).
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

function loadBundle(): string {
  try {
    return readFileSync(path.join(DIST_DIR, "mcp-app.html"), "utf8");
  } catch {
    return "<!doctype html><p>UI bundle missing. Run <code>npm run build</code>.</p>";
  }
}

// Hosts cache the UI resource by URI, so stamp it with a hash of the bundle:
// a rebuilt UI gets a new URI and is fetched fresh.
const BUNDLE = loadBundle();
const BUNDLE_VERSION = createHash("sha256").update(BUNDLE).digest("hex").slice(0, 8);
export const RESOURCE_URI = `ui://json-render/view-${BUNDLE_VERSION}.html`;

export interface Submission {
  id: number;
  receivedAt: string;
  form: Record<string, unknown>;
}

export function createServer(submissions: Submission[] = []): McpServer {
  const server = new McpServer({ name: "json-render-mcp-app", version: "0.1.0" });

  registerAppResource(
    server,
    "json-render view",
    RESOURCE_URI,
    { description: "Renders json-render specs produced by render_ui" },
    async () => ({
      contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: BUNDLE }],
    }),
  );

  registerAppTool(
    server,
    "render_ui",
    {
      title: "Render UI",
      description: `Show the user an interactive UI, described as a json-render spec: a flat map of elements keyed by id, each with a component type, props, optional children (element keys) and optional "on" event bindings.

${describeCatalog()}

Bind inputs to state with { "$bindState": "/path" } and read state with { "$state": "/path" }; seed it with spec.state. Build strings with { "$template": "Hi \${/form/name}" }. To list items, give a Stack repeat: { "statePath": "/items" } and read each item in its children with { "$item": "field" }. Use "submit" for data the server should keep and "ask" when you want to react to the user's choice. Calling render_ui again replaces the UI.`,
      inputSchema: z.object({ spec: UISpec }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ spec }): Promise<CallToolResult> => {
      const normalized = normalizeSpec(spec);
      const count = Object.keys(normalized.elements).length;
      return {
        content: [{ type: "text", text: `Rendered a UI with ${count} elements (root "${normalized.root}").` }],
        structuredContent: { spec: normalized },
      };
    },
  );

  registerAppTool(
    server,
    "submit_form",
    {
      title: "Submit form",
      description: "Stores a form submitted from the rendered UI. Called by the UI, not the model.",
      inputSchema: z.object({ form: z.record(z.string(), z.unknown()) }),
      _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
    },
    async ({ form }): Promise<CallToolResult> => {
      const submission = { id: submissions.length + 1, receivedAt: new Date().toISOString(), form };
      submissions.push(submission);
      return {
        content: [{ type: "text", text: `Saved submission #${submission.id}.` }],
        structuredContent: { ...submission },
      };
    },
  );

  server.registerTool(
    "list_submissions",
    {
      title: "List submissions",
      description: "Returns every form the user has submitted through render_ui's submit action.",
      inputSchema: z.object({}),
    },
    async (): Promise<CallToolResult> => ({
      content: [{ type: "text", text: JSON.stringify(submissions, null, 2) }],
      structuredContent: { submissions },
    }),
  );

  server.registerPrompt(
    "ui",
    {
      title: "Answer with UI",
      description: "Turn any request into an interactive UI drawn with render_ui.",
      argsSchema: z.object({ request: z.string().describe("What you want, e.g. 'compare three laptops under $1500'") }),
    },
    ({ request }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${request}

Answer with render_ui instead of prose: lay out the result as cards, text, badges and inputs, and give me buttons for the obvious next steps ("ask" for anything you should react to, "submit" for anything worth saving). Keep any chat text to one short line.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "no-textbox",
    {
      title: "No-textbox mode",
      description: "A conversation driven only by buttons: every choice redraws the next screen.",
      argsSchema: z.object({ topic: z.string().optional().describe("Optional starting topic") }),
    },
    ({ topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Let's talk without a text box${topic ? ` about ${topic}` : ""}. Rules:
- Every turn, call render_ui and nothing else worth reading in chat.
- Show one question as a Card with 2–4 choice Buttons plus a "Surprise me" button. Every button uses the "ask" action with params { "message": "I chose: <choice>", "data": { "trail": [...labels so far] } }.
- Keep a breadcrumb: seed spec.state.trail with [{ "label": ... }] for each choice so far and render it as Badges in a Stack with repeat: { "statePath": "/trail" }.
- If a choice seems like a mistake, honor it anyway, add a muted Text saying what it gives up, and offer a button to go back.
- When a path reaches a natural end, show the result in a Card with a "Save" button (action "submit", form = the whole trail and result).
Start now with the first screen.`,
          },
        },
      ],
    }),
  );

  return server;
}
