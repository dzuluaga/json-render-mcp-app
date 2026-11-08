import { validateSpec, formatSpecIssues, type Spec } from "@json-render/core";
import { z } from "zod";
import { catalog } from "./catalog.js";

// `catalog.jsonSchema()` leaves props opaque and has no `on` field, and
// `catalog.validate()` strips event bindings. A tool input schema needs both,
// so this module builds a stricter spec schema from the same catalog.

const BUILT_IN_ACTIONS = ["setState", "pushState", "removeState", "validateForm"] as const;

/** A json-render prop expression such as { "$state": "/path" } or { "$bindState": "/path" }. */
const Expression = z
  .record(z.string().regex(/^\$/), z.unknown())
  .describe('Dynamic value, e.g. { "$state": "/form/name" } or { "$bindState": "/form/name" }');

function withExpressions(props: z.ZodObject) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(props.shape as Record<string, z.ZodType>)) {
    const dynamic = z.union([field, Expression]);
    // Nullable props are optional for the model; it shouldn't have to spell out nulls.
    shape[key] = field instanceof z.ZodNullable ? dynamic.optional() : dynamic;
  }
  return z.strictObject(shape);
}

const ActionBinding = z.object({
  action: z.enum([...(catalog.actionNames as [string, ...string[]]), ...BUILT_IN_ACTIONS]),
  params: z.record(z.string(), z.unknown()).optional(),
});

const elementVariants = Object.entries(catalog.data.components).map(([type, def]) =>
  z.strictObject({
    type: z.literal(type),
    props: withExpressions(def.props as z.ZodObject),
    children: z.array(z.string()).optional().describe("Keys of child elements"),
    visible: z.unknown().optional().describe('Visibility condition, e.g. { "$state": "/form/agree" }'),
    on: z.record(z.string(), z.union([ActionBinding, z.array(ActionBinding)])).optional(),
    repeat: z
      .object({
        statePath: z.union([z.string(), z.object({ $item: z.string() })]),
        key: z.string().optional(),
      })
      .optional()
      .describe('Render children once per item of the state array at statePath; children read fields with { "$item": "field" }'),
  }),
);

export const UIElement = z.discriminatedUnion(
  "type",
  elementVariants as unknown as [(typeof elementVariants)[number], ...(typeof elementVariants)[number][]],
);

export const UISpec = z
  .object({
    root: z.string().describe("Key of the root element"),
    elements: z.record(z.string(), UIElement).describe("Flat map of element key → element"),
    state: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Initial state that $state / $bindState paths read from"),
  })
  .superRefine((spec, ctx) => {
    if (!(spec.root in spec.elements)) {
      ctx.addIssue({ code: "custom", path: ["root"], message: `root "${spec.root}" is not in elements` });
    }
    const { valid, issues } = validateSpec(normalizeSpec(spec) as Spec);
    if (!valid) {
      for (const message of formatSpecIssues(issues).split("\n").filter(Boolean)) {
        ctx.addIssue({ code: "custom", message });
      }
    }
  });

export type UISpec = z.infer<typeof UISpec>;

/** Fill in the `children: []` the renderer and validator expect on leaf elements. */
export function normalizeSpec<T extends { elements: Record<string, { children?: string[] }> }>(spec: T): T {
  const elements = Object.fromEntries(
    Object.entries(spec.elements).map(([key, el]) => [key, { ...el, children: el.children ?? [] }]),
  );
  return { ...spec, elements };
}

/** One line per component and action, for the render_ui tool description. */
export function describeCatalog(): string {
  const components = Object.entries(catalog.data.components)
    .map(([name, def]) => `- ${name}: ${def.description}`)
    .join("\n");
  const actions = Object.entries(catalog.data.actions ?? {})
    .map(([name, def]) => `- ${name}: ${def.description}`)
    .join("\n");
  return `Components:\n${components}\n\nActions (for "on" bindings):\n${actions}\n- setState / pushState / removeState: built-in client-side state updates, params { "statePath": "/path", "value": ... }`;
}
