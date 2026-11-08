// Minimal MCP Apps host for local testing: connects to the server over HTTP,
// renders the UI resource in a sandboxed iframe, and plays the role Claude
// would by calling render_ui and streaming its arguments in.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import planPicker from "../examples/plan-picker.json";

const log = (label: string, data?: unknown) => {
  const el = document.getElementById("log")!;
  el.textContent += `${new Date().toLocaleTimeString()} ${label}${data === undefined ? "" : " " + JSON.stringify(data)}\n`;
  console.log("[host]", label, data ?? "");
};

const client = new Client({ name: "test-host", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.href)));
const { tools } = await client.listTools();
const renderUi = tools.find((t) => t.name === "render_ui")!;
const uri = (renderUi._meta as { ui: { resourceUri: string } }).ui.resourceUri;
const resource = await client.readResource({ uri });
log("loaded UI resource", uri);

const iframe = document.getElementById("app") as HTMLIFrameElement;
iframe.srcdoc = (resource.contents[0] as { text: string }).text;
await new Promise((r) => iframe.addEventListener("load", r, { once: true }));

const bridge = new AppBridge(client, { name: "test-host", version: "0.0.0" }, { serverTools: {}, updateModelContext: { text: {} }, message: { text: {} } });
bridge.onmessage = async (params) => {
  log("ui/message → would start a Claude turn:", params);
  return {};
};
bridge.onupdatemodelcontext = async (params) => {
  log("ui/update-model-context:", params);
  return {};
};
bridge.oninitialized = () => log("view initialized");
await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));

document.getElementById("run")!.addEventListener("click", () => {
  simulateRenderUi().catch((e) => log("simulation failed:", String(e)));
});

async function simulateRenderUi() {
  log("streaming render_ui arguments…");
  // Stream the spec in element by element, like partial tool input from Claude.
  const keys = Object.keys(planPicker.elements);
  for (let i = 1; i <= keys.length; i++) {
    const elements = Object.fromEntries(keys.slice(0, i).map((k) => [k, (planPicker.elements as Record<string, unknown>)[k]]));
    await bridge.sendToolInputPartial({ arguments: { spec: { ...planPicker, elements } } });
    await new Promise((r) => setTimeout(r, 150));
  }
  await bridge.sendToolInput({ arguments: { spec: planPicker } });
  const result = await client.callTool({ name: "render_ui", arguments: { spec: planPicker } });
  log("render_ui result", result.content);
  await bridge.sendToolResult(result as Parameters<typeof bridge.sendToolResult>[0]);
}
log("ready — click the button");
