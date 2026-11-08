import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";
import { JSONUIProvider, Renderer, type Spec } from "@json-render/react";
import { Component, StrictMode, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createRegistry, type AppActions } from "./registry.js";
import "./styles.css";

type Status = { kind: "info" | "error"; text: string } | null;

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
      submit: async (params) => {
        if (!app) return;
        const form = params?.form ?? {};
        const result = await app.callServerTool({ name: "submit_form", arguments: { form } });
        if (result.isError) {
          setStatus({ kind: "error", text: "Saving failed." });
          return;
        }
        const id = (result.structuredContent as { id?: number } | undefined)?.id;
        setStatus({ kind: "info", text: `Saved (submission #${id}).` });
        await app.updateModelContext({
          content: [{ type: "text", text: `The user submitted submission #${id} from the UI: ${JSON.stringify(form)}` }],
        });
      },
      // Hand the turn back to Claude.
      ask: async (params) => {
        if (!app || !params?.message) return;
        const data = params.data ? `\n\n${JSON.stringify(params.data, null, 2)}` : "";
        const result = await app.sendMessage({
          role: "user",
          content: [{ type: "text", text: `${params.message}${data}` }],
        });
        setStatus(result.isError ? { kind: "error", text: "The host declined the message." } : { kind: "info", text: "Sent to Claude." });
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
        <JSONUIProvider
          registry={registry}
          initialState={spec.state ?? {}}
          handlers={{
            submit: (p) => actions.submit(p as Parameters<AppActions["submit"]>[0]),
            ask: (p) => actions.ask(p as Parameters<AppActions["ask"]>[0]),
          }}
        >
          <Renderer spec={spec} registry={registry} loading={streaming} />
        </JSONUIProvider>
      </RenderBoundary>
      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JsonRenderView />
  </StrictMode>,
);
