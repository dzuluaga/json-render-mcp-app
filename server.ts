import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { z } from "zod";
import { allowedHosts, fetchJson, FetchJsonError } from "./src/fetch-json.js";
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
      description: `Use this tool whenever the user asks to see, show, draw, visualize, chart or lay out something: dashboards, charts, tables, forms, comparisons, drawings, diagrams, step-by-step flows. Prefer it over writing an HTML/React artifact or code block. It renders inline, live, with buttons wired to this server's tools.

Shows the user an interactive UI, described as a json-render spec: a flat map of elements keyed by id, each with a component type, props, optional children (element keys) and optional "on" event bindings.

${describeCatalog()}

Bind inputs to state with { "$bindState": "/path" } and read state with { "$state": "/path" }; seed it with spec.state. Build strings with { "$template": "Hi \${/form/name}" }. To list items, give a Stack repeat: { "statePath": "/items" } and read each item in its children with { "$item": "field" }. Buttons never type into the chat. Use "submit" for data the server should keep, "callTool" to run a tool on this server (list_submissions returns { submissions, count }; make_qr_code { text, color?: "#rrggbb", size? } returns { src } for an Image; fetch_json { url, path?, columns?, limit? } returns { data } from an allowed JSON API, and with columns the data is rows ready for a Table or a Chart of { label, value }), and setState / pushState for navigation inside the UI (show screens with visible: { "$state": "/step", "eq": "..." }). Calling render_ui again replaces the UI.`,
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

  registerAppTool(
    server,
    "make_qr_code",
    {
      title: "Make QR code",
      description:
        "Generates a QR code PNG for some text or a URL. Returns { src } with a data: URL (show it with an Image component) plus the image itself.",
      inputSchema: z.object({
        text: z.string().min(1).max(1000),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Foreground colour as #rrggbb (default black)"),
        size: z.number().int().min(128).max(512).optional().describe("Width in pixels (default 256)"),
      }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ text, color, size }): Promise<CallToolResult> => {
      const src = await QRCode.toDataURL(text, {
        width: size ?? 256,
        margin: 2,
        color: { dark: color ?? "#000000", light: "#ffffff" },
      });
      return {
        content: [
          { type: "image", data: src.slice(src.indexOf(",") + 1), mimeType: "image/png" },
          { type: "text", text: `QR code for: ${text}` },
        ],
        structuredContent: { src, text },
      };
    },
  );

  const hosts = allowedHosts();
  registerAppTool(
    server,
    "fetch_json",
    {
      title: "Fetch JSON",
      description: `GETs a JSON API on the server, since the UI itself can't reach the network. Allowed hosts: ${hosts.join(", ")}. Returns { url, status, data }. Trim big responses: path is a JSON Pointer into the response (e.g. "/daily"); columns turns the selected value into rows ({ outKey: source }, where source is a field of each item in an array of objects, or the key of one array in an object of parallel arrays). For a Chart use columns { "label": ..., "value": ... }. Buttons call it with callTool and read the result from resultPath, e.g. rows: { "$state": "/forecast/data" }. Build URLs from state with { "$template": "https://...?q=\${/form/q}" }.`,
      inputSchema: z.object({
        url: z.string().describe(`https URL on one of: ${hosts.join(", ")}`),
        path: z.string().optional().describe('JSON Pointer to the part of the response to return, e.g. "/daily"'),
        columns: z
          .record(z.string(), z.string())
          .optional()
          .describe('Rows to build, e.g. { "label": "time", "value": "temperature_2m_max" }'),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum rows when data is an array (default 500)"),
      }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const result = await fetchJson(args, hosts);
        const json = JSON.stringify(result.data);
        return {
          content: [{ type: "text", text: json.length > 20_000 ? `${json.slice(0, 20_000)}… (truncated)` : json }],
          structuredContent: { ...result },
        };
      } catch (e) {
        if (!(e instanceof FetchJsonError)) throw e;
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
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
      structuredContent: { submissions, count: submissions.length },
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

Answer by calling the render_ui tool, not with prose and not with an artifact or code block: lay out the result as cards, text, badges and inputs, and give me buttons for the obvious next steps: setState/pushState to move between screens, "submit" for anything worth saving, "callTool" to run a tool on this server. Buttons must never type into the chat. Keep any chat text to one short line.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "no-textbox",
    {
      title: "No-textbox mode",
      description: "A button-only conversation: Claude draws a whole branching flow you click through, nothing typed.",
      argsSchema: z.object({ topic: z.string().optional().describe("Optional starting topic") }),
    },
    ({ topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Let's talk without a text box${topic ? ` about ${topic}` : ""}. Draw the whole conversation as ONE call to the render_ui tool (not an artifact) that I navigate with buttons:
- Build a decision tree 2–3 levels deep. Each screen is a Card with a question and 2–4 choice Buttons, shown with visible: { "$state": "/step", "eq": "<screen id>" }. Seed spec.state with { "step": "start", "trail": [{ "label": "Start" }] }.
- A choice button runs two actions: [{ "action": "setState", "params": { "statePath": "/step", "value": "<next screen id>" } }, { "action": "pushState", "params": { "statePath": "/trail", "value": { "label": "<choice>" } } }].
- Show the trail above the screens as Badges in a horizontal Stack with repeat: { "statePath": "/trail" } and label { "$item": "label" }.
- Give every screen after the first a "Start over" button that sets /step to "start" and /trail back to [{ "label": "Start" }].
- If a choice looks like a mistake, still let me take it, but put a muted Text on the next screen saying what it gives up.
- Leaf screens show a concrete result and a "Save" button (action "submit", form: { "trail": { "$state": "/trail" }, "result": "<the result>" }) plus a confirmation card shown when /submission is set.
- Never use buttons that type into the chat. Keep chat text to one short line.`,
          },
        },
      ],
    }),
  );

  return server;
}
