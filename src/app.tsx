import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";
import { ActionProvider, JSONUIProvider, Renderer, useStateStore, type Spec } from "@json-render/react";
import { Component, StrictMode, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createRegistry, type AppActions } from "./registry.js";

type Registry = ReturnType<typeof createRegistry>["registry"];
import "./styles.css";

type Status = { kind: "info" | "error"; text: string } | null;

/** Keeps embedded images out of Claude's context: they're thousands of characters of base64. */
function elideDataUrls(_key: string, value: unknown) {
  if (typeof value === "string" && value.startsWith("data:") && value.length > 200) {
    return `[${value.slice(5, value.indexOf(";"))}, ${value.length.toLocaleString()} chars]`;
  }
  return value;
}

/**
 * Make a possibly partial spec (streamed tool input) safe to render:
 * leaf elements get `children: []` and references to elements that haven't
 * arrived yet are dropped.
 */
function prepareSpec(raw: unknown): Spec | null {
  const spec = raw as Partial<Spec> | undefined;
  if (!spec?.root || !spec.elements?.[spec.root]) return null;
  const elements: Spec["elements"] = {};
  for (const [key, el] of Object.entries(spec.elements)) {
    if (!el?.type) continue;
    elements[key] = {
      ...el,
      props: el.props ?? {},
      children: (el.children ?? []).filter((c) => typeof c === "string" && spec.elements?.[c]?.type),
    };
  }
  return { ...spec, root: spec.root, elements } as Spec;
}

class RenderBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p className="status error">Could not render: {this.state.error.message}</p> : this.props.children;
  }
}

function JsonRenderView() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [renderId, setRenderId] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const finalized = useRef(true);

  const { app, error } = useApp({
    appInfo: { name: "json-render-mcp-app", version: "0.1.0" },
    capabilities: {},
    onAppCreated: (app: App) => {
      // Partial input arrives while Claude is still writing the tool call.
      app.ontoolinputpartial = ({ arguments: args }) => {
        if (finalized.current) {
          finalized.current = false;
          setRenderId((n) => n + 1);
          setStatus(null);
        }
        const next = prepareSpec(args?.spec);
        if (next) setSpec(next);
        setStreaming(true);
      };
      app.ontoolinput = ({ arguments: args }) => {
        if (finalized.current) setRenderId((n) => n + 1);
        finalized.current = true;
        setSpec(prepareSpec(args?.spec));
        setStreaming(false);
      };
      app.ontoolresult = (result) => {
        if (result.isError) {
          const text = result.content?.find((c) => c.type === "text")?.text ?? "render_ui failed";
          setStatus({ kind: "error", text });
          return;
        }
        const validated = prepareSpec((result.structuredContent as { spec?: unknown } | undefined)?.spec);
        if (validated) setSpec(validated);
      };
    },
  });

  useHostStyles(app, app?.getHostContext());

  const actions = useMemo<AppActions>(
    () => ({
      // Direct server call: no new chat turn. Claude hears about it via model context.
      // Results land in UI state so the spec can react (confirmation card, hidden form).
      submit: async (params, setStateAt) => {
        if (!app) return;
        const form = params?.form ?? {};
        setStateAt("/submissionError", null);
        setStateAt("/submitting", true);
        let result;
        try {
          result = await app.callServerTool({ name: "submit_form", arguments: { form } });
        } finally {
          setStateAt("/submitting", false);
        }
        if (result.isError) {
          const text = result.content?.find((c) => c.type === "text")?.text ?? "Saving failed.";
          setStateAt("/submissionError", text);
          setStatus({ kind: "error", text });
          return;
        }
        const { id, receivedAt } = (result.structuredContent ?? {}) as { id?: number; receivedAt?: string };
        setStateAt("/submission", { id, receivedAt });
        setStatus({ kind: "info", text: `Saved (submission #${id}).` });
        await app.updateModelContext({
          content: [{ type: "text", text: `The user submitted submission #${id} from the UI: ${JSON.stringify(form)}` }],
        });
      },
      // Call any tool on this server. Nothing goes into the chat box; the result
      // lands in UI state (or replaces the UI if the tool returns a spec).
      callTool: async (params, setStateAt) => {
        if (!app || !params?.name) return;
        const { name } = params;
        const args = params.arguments ?? {};
        setStateAt(`/calls/${name}`, { status: "pending" });
        let result;
        try {
          result = await app.callServerTool({ name, arguments: args });
        } catch (e) {
          setStateAt(`/calls/${name}`, { status: "error", error: String(e) });
          setStatus({ kind: "error", text: `${name} failed.` });
          return;
        }
        const text = result.content?.find((c) => c.type === "text")?.text;
        if (result.isError) {
          setStateAt(`/calls/${name}`, { status: "error", error: text ?? "Tool error" });
          setStatus({ kind: "error", text: text ?? `${name} failed.` });
          return;
        }
        setStateAt(`/calls/${name}`, { status: "done" });
        const structured = result.structuredContent as Record<string, unknown> | undefined;
        const nextSpec = prepareSpec(structured?.spec);
        if (nextSpec) {
          setRenderId((n) => n + 1);
          setSpec(nextSpec);
        } else {
          setStateAt(params.resultPath ?? "/result", structured ?? { text });
        }
        setStatus(null);
        await app.updateModelContext({
          content: [
            {
              type: "text",
              text: `From the UI, the user called ${name}(${JSON.stringify(args)}) and got: ${JSON.stringify(structured ?? text, elideDataUrls)}`,
            },
          ],
        });
      },
    }),
    [app],
  );

  const { registry } = useMemo(() => createRegistry(actions), [actions]);

  if (error) return <p className="status error">Not connected to a host: {error.message}</p>;
  if (!spec) return <p className="status">{streaming ? "Claude is drawing…" : "Waiting for render_ui…"}</p>;

  return (
    <main>
      <RenderBoundary key={renderId}>
        <JSONUIProvider registry={registry} initialState={spec.state ?? {}}>
          <SpecView spec={spec} registry={registry} actions={actions} loading={streaming} />
        </JSONUIProvider>
      </RenderBoundary>
      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </main>
  );
}

/** Renders the spec with action handlers that can write to the spec's state. */
function SpecView({ spec, registry, actions, loading }: { spec: Spec; registry: Registry; actions: AppActions; loading: boolean }) {
  const { set } = useStateStore();
  return (
    <ActionProvider
      handlers={{
        submit: (p) => actions.submit(p as Parameters<AppActions["submit"]>[0], set),
        callTool: (p) => actions.callTool(p as Parameters<AppActions["callTool"]>[0], set),
      }}
    >
      <Renderer spec={spec} registry={registry} loading={loading} />
    </ActionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JsonRenderView />
  </StrictMode>,
);
