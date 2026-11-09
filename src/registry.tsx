import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { immutableSetByPath } from "@json-render/core/store-utils";
import { catalog } from "./catalog.js";
import { BarChart, LineChart, Metric, PieChart, Table } from "./vendor/data-components.js";
import { Image, Svg } from "./visuals.js";

// Everything shadcn ships except the two components the catalog replaces.
const { Table: _table, Image: _image, ...shadcn } = shadcnComponents;

/** Writes a value at a JSON Pointer path in the rendered UI's state. */
export type SetStateAt = (path: string, value: unknown) => void;

export interface AppActions {
  submit: (params: { form?: Record<string, unknown> | null } | undefined, setStateAt: SetStateAt) => Promise<void>;
  callTool: (
    params: { name: string; arguments?: Record<string, unknown> | null; resultPath?: string | null } | undefined,
    setStateAt: SetStateAt,
  ) => Promise<void>;
}

const setAt =
  (setState: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void): SetStateAt =>
  (path, value) =>
    setState((prev) => immutableSetByPath(prev, path, value));

/** Component implementations for the catalog; actions are wired to the MCP App bridge. */
export function createRegistry(actions: AppActions) {
  return defineRegistry(catalog, {
    components: {
      ...shadcn,
      Metric: ({ props }) => <Metric {...props} />,
      Table: ({ props }) => <Table {...props} />,
      BarChart: ({ props }) => <BarChart {...props} />,
      LineChart: ({ props }) => <LineChart {...props} />,
      PieChart: ({ props }) => <PieChart {...props} />,
      Svg: ({ props }) => <Svg {...props} />,
      Image: ({ props }) => <Image {...props} />,
    },
    actions: {
      submit: (params, setState) => actions.submit(params, setAt(setState)),
      callTool: (params, setState) => actions.callTool(params, setAt(setState)),
    },
  });
}
