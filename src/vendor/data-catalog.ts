// Vendored from vercel-labs/json-render examples/chat @ 18194121c8 (Apache-2.0, see src/vendor/LICENSE).
// Changes: descriptions spell out behaviour (hover tooltips, sorting, aggregation)
// and point at fetch_json / callTool results, so Claude knows what it can rely on.
import { z } from "zod";

const rows = z.array(z.record(z.string(), z.unknown()));

export const dataComponentDefinitions = {
  Metric: {
    props: z.object({
      label: z.string(),
      value: z.string(),
      detail: z.string().nullable(),
      trend: z.enum(["up", "down", "neutral"]).nullable(),
    }),
    description: "Single KPI: a label, a big value, optional detail line and an up/down/neutral trend arrow.",
    example: { label: "Temperature", value: "72°F", detail: "Feels like 68°F", trend: "up" },
  },

  Table: {
    props: z.object({
      data: rows,
      columns: z.array(z.object({ key: z.string(), label: z.string() })),
      emptyMessage: z.string().nullable(),
    }),
    description:
      'Data table over an array of objects; each column shows one key. Users can click a header to sort (numbers numerically). Bind rows from state, e.g. data: { "$state": "/result/data" } after a callTool/fetch_json.',
    example: {
      data: { $state: "/repos/data" },
      columns: [
        { key: "name", label: "Repo" },
        { key: "stars", label: "Stars" },
      ],
    },
  },

  BarChart: {
    props: z.object({
      title: z.string().nullable(),
      data: rows,
      xKey: z.string(),
      yKey: z.string(),
      aggregate: z.enum(["sum", "count", "avg"]).nullable(),
      color: z.string().nullable(),
      height: z.number().nullable(),
    }),
    description:
      "Bar chart over an array of objects: xKey is the category field, yKey the numeric field. Hovering a bar shows a tooltip with its exact value, so you don't need a table just to show numbers. aggregate groups rows by xKey (sum, count or avg). Bind data from state.",
    example: { title: "Stars by repo", data: { $state: "/repos/data" }, xKey: "name", yKey: "stars" },
  },

  LineChart: {
    props: z.object({
      title: z.string().nullable(),
      data: rows,
      xKey: z.string(),
      yKey: z.string(),
      aggregate: z.enum(["sum", "count", "avg"]).nullable(),
      color: z.string().nullable(),
      height: z.number().nullable(),
    }),
    description:
      "Line chart over an array of objects: xKey is the x-axis field (e.g. a date), yKey the numeric field. Hovering shows a tooltip with the point's value. aggregate groups rows by xKey. Bind data from state.",
    example: {
      title: "Daily high (°C)",
      data: { $state: "/forecast/data" },
      xKey: "time",
      yKey: "temperature_2m_max",
    },
  },

  PieChart: {
    props: z.object({
      title: z.string().nullable(),
      data: rows,
      nameKey: z.string(),
      valueKey: z.string(),
      height: z.number().nullable(),
    }),
    description:
      "Donut chart for parts of a whole: nameKey is the slice label field, valueKey the numeric field. Shows a legend, and hovering a slice shows its value. Bind data from state.",
    example: { title: "Plans", data: { $state: "/plans" }, nameKey: "plan", valueKey: "count" },
  },
};
