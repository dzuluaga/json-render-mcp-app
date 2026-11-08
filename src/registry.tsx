import { defineRegistry, useBoundProp } from "@json-render/react";
import { catalog } from "./catalog.js";

export interface AppActions {
  submit: (params: { form?: Record<string, unknown> | null } | undefined) => Promise<void>;
  ask: (params: { message: string; data?: Record<string, unknown> | null } | undefined) => Promise<void>;
}

/** Component implementations for the catalog; actions are wired to the MCP App bridge. */
export function createRegistry(actions: AppActions) {
  return defineRegistry(catalog, {
    components: {
      Stack: ({ props, children }) => (
        <div className={`stack ${props.direction ?? "vertical"} gap-${props.gap ?? "md"}`}>{children}</div>
      ),
      Card: ({ props, children }) => (
        <section className="card">
          {props.title && <h3 className="card-title">{props.title}</h3>}
          {props.subtitle && <p className="card-subtitle">{props.subtitle}</p>}
          <div className="card-body">{children}</div>
        </section>
      ),
      Heading: ({ props }) => {
        const Tag = `h${props.level ?? "2"}` as "h1" | "h2" | "h3";
        return <Tag className="heading">{props.text}</Tag>;
      },
      Text: ({ props }) => <p className={`text tone-${props.tone ?? "default"}`}>{props.text}</p>,
      Badge: ({ props }) => <span className={`badge tone-${props.tone ?? "neutral"}`}>{props.label}</span>,
      TextField: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string>(props.value ?? undefined, bindings?.value);
        return (
          <label className="field">
            <span>{props.label}</span>
            <input
              value={value ?? ""}
              placeholder={props.placeholder ?? ""}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        );
      },
      Select: ({ props, bindings }) => {
        const [value, setValue] = useBoundProp<string>(props.value ?? undefined, bindings?.value);
        return (
          <label className="field">
            <span>{props.label}</span>
            <select value={value ?? ""} onChange={(e) => setValue(e.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {props.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      },
      Button: ({ props, emit, loading }) => (
        <button className={`button ${props.variant ?? "primary"}`} disabled={loading} onClick={() => emit("press")}>
          {props.label}
        </button>
      ),
    },
    actions: {
      submit: (params) => actions.submit(params),
      ask: (params) => actions.ask(params),
    },
  });
}
