import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";
import { dataComponentDefinitions } from "./vendor/data-catalog.js";

// shadcn's Table takes rows as string[][] and its Image loads any URL; the
// vendored data components and our data:-only Image replace them.
const { Table: _table, Image: _image, ...shadcn } = shadcnComponentDefinitions;

// Notes the stock descriptions leave out, learned by rendering them.
const notes: Record<string, string> = {
  Tabs: 'Tab bar only: all children always render. Bind value to state and show one child per tab, e.g. value: { "$bindState": "/tab" } and on each panel visible: { "$state": "/tab", "eq": "chart" }. Seed /tab in spec.state.',
  ButtonGroup: "Segmented single choice with no label of its own; put a Text (variant caption) above it.",
};

// Tailwind only ships classes it saw at build time, so a className the model
// invents would do nothing. Keep the prop out of the schema.
const shadcnComponents = Object.fromEntries(
  Object.entries(shadcn).map(([name, def]) => {
    const props = def.props as z.ZodObject;
    return [
      name,
      {
        ...def,
        props: "className" in props.shape ? props.omit({ className: true }) : props,
        description: notes[name] ? `${def.description} ${notes[name]}` : def.description,
      },
    ];
  }),
) as { [K in keyof typeof shadcn]: (typeof shadcn)[K] };

/**
 * The components and actions Claude may use in a `render_ui` spec.
 * Shared by the server (input schema + validation) and the UI (registry).
 *
 * - Layout, content, inputs and overlays: @json-render/shadcn (Radix + Tailwind).
 * - Metric, Table and Bar/Line/Pie charts: vendored from json-render's examples/chat (Recharts).
 * - Svg and Image: ours, sanitized / data:-URL only.
 */
export const catalog = defineCatalog(schema, {
  components: {
    ...shadcnComponents,
    ...dataComponentDefinitions,
    Svg: {
      props: z.object({
        svg: z.string(),
        title: z.string().nullable(),
        maxWidth: z.number().nullable(),
      }),
      description:
        "An inline drawing: a complete <svg>…</svg> with a viewBox. Use it for illustrations, icons, diagrams and maps. No scripts, event handlers, <foreignObject> or external links/images (they're stripped). Use currentColor to follow the host theme. Static: it can't redraw from state, so use the charts for data.",
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string(),
        maxWidth: z.number().nullable(),
      }),
      description:
        'A raster image from a data: URL (data:image/png|jpeg|gif|webp;base64,...), usually a tool result, e.g. src: { "$state": "/qr/src" }. External URLs are not allowed.',
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
