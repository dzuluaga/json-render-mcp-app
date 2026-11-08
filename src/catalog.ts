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
    ask: {
      params: z.object({
        message: z.string(),
        data: z.record(z.string(), z.unknown()).nullable(),
      }),
      description:
        'Hands the turn back to Claude by posting `message` (plus optional `data`) into the chat as the user. Use for choices Claude should react to, e.g. "User picked the Pro plan".',
    },
  },
});
