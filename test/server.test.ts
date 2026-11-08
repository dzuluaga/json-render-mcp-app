import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createServer, RESOURCE_URI } from "../server.js";

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

const planPicker = {
  root: "card",
  state: { form: { plan: "" } },
  elements: {
    card: { type: "Card", props: { title: "Pick a plan" }, children: ["plan", "go"] },
    plan: {
      type: "Select",
      props: {
        label: "Plan",
        value: { $bindState: "/form/plan" },
        options: [
          { value: "free", label: "Free" },
          { value: "pro", label: "Pro" },
        ],
      },
    },
    go: {
      type: "Button",
      props: { label: "Continue" },
      on: {
        press: {
          action: "callTool",
          params: { name: "list_submissions", arguments: {}, resultPath: "/saved" },
        },
      },
    },
  },
};

describe("json-render MCP app server", () => {
  it("exposes render_ui to the model with a typed spec schema and the UI resource", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["render_ui", "submit_form", "list_submissions"]));

    const renderUi = tools.find((t) => t.name === "render_ui")!;
    expect(renderUi.description).toMatch(/^Use this tool whenever the user asks to see, show, draw/);
    expect(renderUi._meta).toMatchObject({ ui: { resourceUri: RESOURCE_URI } });
    const schema = JSON.stringify(renderUi.inputSchema);
    expect(schema).toContain('"Button"');
    expect(schema).toContain('"on"');

    const submitForm = tools.find((t) => t.name === "submit_form")!;
    expect(submitForm._meta).toMatchObject({ ui: { visibility: ["app"] } });

    const resource = await client.readResource({ uri: RESOURCE_URI });
    expect(resource.contents[0]).toMatchObject({ mimeType: "text/html;profile=mcp-app" });
  });

  it("returns a normalized spec for a valid render_ui call", async () => {
    const client = await connect();
    const result = await client.callTool({ name: "render_ui", arguments: { spec: planPicker } });
    expect(result.isError).toBeFalsy();
    const spec = (result.structuredContent as { spec: typeof planPicker }).spec;
    expect(spec.elements.plan).toMatchObject({ children: [] });
    expect(spec.elements.go.on.press.action).toBe("callTool");
  });

  it("rejects unknown components, unknown actions and dangling children", async () => {
    const client = await connect();
    const bad = [
      { root: "a", elements: { a: { type: "Marquee", props: {} } } },
      { root: "a", elements: { a: { type: "Button", props: { label: "x" }, on: { press: { action: "launch" } } } } },
      // `ask` typed into the chat box; it's gone so buttons can't do that anymore.
      { root: "a", elements: { a: { type: "Button", props: { label: "x" }, on: { press: { action: "ask", params: { message: "hi" } } } } } },
      { root: "a", elements: { a: { type: "Card", props: {}, children: ["ghost"] } } },
      { root: "missing", elements: { a: { type: "Text", props: { text: "hi" } } } },
      { root: "a", elements: { a: { type: "Chart", props: { kind: "radar", data: [] } } } },
      { root: "a", elements: { a: { type: "Svg", props: { svg: "<svg><script>alert(1)</script></svg>" } } } },
      { root: "a", elements: { a: { type: "Svg", props: { svg: '<svg><image href="https://evil.example/x.png"/></svg>' } } } },
    ];
    for (const spec of bad) {
      const result = await client.callTool({ name: "render_ui", arguments: { spec } });
      expect(result.isError, JSON.stringify(spec)).toBe(true);
    }
  });

  it.each(readdirSync("examples"))("accepts examples/%s", async (file) => {
    const client = await connect();
    const spec = JSON.parse(readFileSync(`examples/${file}`, "utf8"));
    const result = await client.callTool({ name: "render_ui", arguments: { spec } });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
  });

  it("offers ui and no-textbox prompts that fill in their arguments", async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["ui", "no-textbox"]));

    const ui = await client.getPrompt({ name: "ui", arguments: { request: "compare three laptops" } });
    const uiText = (ui.messages[0].content as { text: string }).text;
    expect(uiText).toContain("compare three laptops");
    expect(uiText).toContain("render_ui");
    expect(uiText).toContain("not with an artifact");

    const adventure = await client.getPrompt({ name: "no-textbox", arguments: { topic: "a weekend in Lisbon" } });
    const adventureText = (adventure.messages[0].content as { text: string }).text;
    expect(adventureText).toContain("about a weekend in Lisbon");
    expect(uiText + adventureText).not.toMatch(/"ask"/);
  });

  it("stores submissions from the UI and lists them for the model", async () => {
    const client = await connect();
    await client.callTool({ name: "submit_form", arguments: { form: { plan: "pro" } } });
    const result = await client.callTool({ name: "list_submissions", arguments: {} });
    const { submissions } = result.structuredContent as { submissions: { id: number; form: unknown }[] };
    expect(submissions).toEqual([expect.objectContaining({ id: 1, form: { plan: "pro" } })]);
    expect(result.structuredContent).toMatchObject({ count: 1 });
  });
});
