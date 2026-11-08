import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * The components and actions Claude may use in a `render_ui` spec.
 * Shared by the server (input schema + validation) and the UI (registry).
 */
export const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(["vertical", "horizontal"]).nullable(),
        gap: z.enum(["sm", "md", "lg"]).nullable(),
      }),
      description: "Layout container that stacks its children vertically (default) or horizontally.",
    },
    Card: {
      props: z.object({
        title: z.string().nullable(),
        subtitle: z.string().nullable(),
      }),
      description: "Bordered container with an optional title and subtitle.",
    },
    Heading: {
      props: z.object({
        text: z.string(),
        level: z.enum(["1", "2", "3"]).nullable(),
      }),
      description: "A heading.",
    },
    Text: {
      props: z.object({
        text: z.string(),
        tone: z.enum(["default", "muted", "success", "danger"]).nullable(),
      }),
      description: "A paragraph of text.",
    },
    Badge: {
      props: z.object({
        label: z.string(),
        tone: z.enum(["neutral", "info", "success", "warning", "danger"]).nullable(),
      }),
      description: "A small status pill.",
    },
    Table: {
      props: z.object({
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
        caption: z.string().nullable(),
      }),
      description:
        'Data table. Each row is an object keyed by column key. Rows can come from state, e.g. rows: { "$state": "/saved/submissions" }.',
    },
    Chart: {
      props: z.object({
        kind: z.enum(["bar", "line", "pie"]),
        title: z.string().nullable(),
        data: z.array(z.object({ label: z.string(), value: z.number() })),
        unit: z.string().nullable(),
      }),
      description: "Bar, line or pie chart from { label, value } points. unit is appended to values (e.g. \"$\", \"%\", \"h\").",
    },
    Svg: {
      props: z.object({
        svg: z.string(),
        title: z.string().nullable(),
        maxWidth: z.number().nullable(),
      }),
      description:
        "An inline drawing: a complete <svg>…</svg> with a viewBox. Use it for illustrations, icons, diagrams and maps. No scripts, event handlers, <foreignObject> or external links/images (they're stripped). Use currentColor to follow the host theme.",
    },
    TextField: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
      }),
      description:
        'Single-line text input. Bind it to state with value: { "$bindState": "/form/name" }.',
    },
    Select: {
      props: z.object({
        label: z.string(),
        value: z.string().nullable(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
      description: 'Dropdown. Bind it to state with value: { "$bindState": "/form/plan" }.',
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary"]).nullable(),
      }),
      description:
        'Clickable button. Fires the "press" event; bind it with on: { "press": { "action": "...", "params": { ... } } }.',
    },
  },
  actions: {
    submit: {
      params: z.object({
        form: z.record(z.string(), z.unknown()).nullable(),
      }),
      description:
        'Saves data on the MCP server without starting a new chat turn. Pass the form state, e.g. params: { "form": { "$state": "/form" } }. While saving, state /submitting is true; on success /submission is { id, receivedAt }; on failure /submissionError is the message. Design for it: show a confirmation with visible: { "$state": "/submission" } and hide the form with visible: { "$state": "/submission", "not": true }. Claude is told about the submission through model context.',
    },
    callTool: {
      params: z.object({
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()).nullable(),
        resultPath: z.string().nullable(),
      }),
      description:
        'Calls an MCP tool on this server directly; nothing is typed into the chat. Arguments can read state, e.g. { "plan": { "$state": "/form/plan" } }. While running, /calls/<name>/status is "pending", then "done" or "error" (with /calls/<name>/error). The tool\'s structured result is written to resultPath (default /result) for the spec to display. If the tool returns { "spec": ... }, the UI is replaced by that spec. Claude sees each call and its result through model context on the next turn.',
    },
  },
});
