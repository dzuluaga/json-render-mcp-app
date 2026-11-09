// Vendored from vercel-labs/json-render examples/chat @ 18194121c8 (Apache-2.0, see src/vendor/LICENSE).
// Changes: imports point at the vendored ui files, tooltips label the series with
// the chart title, and the repeated "array or
// { data: array }" unwrapping is shared in toRows().
import { useState } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Pie,
  PieChart as RechartsPieChart,
  XAxis,
} from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./chart.js";
import { Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table.js";

type Row = Record<string, unknown>;
type Aggregate = "sum" | "count" | "avg" | null | undefined;

/** Accept rows directly or a tool result shaped { data: rows } (e.g. fetch_json). */
function toRows(raw: unknown): Row[] {
  if (Array.isArray(raw)) return raw as Row[];
  const nested = (raw as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(nested) ? (nested as Row[]) : [];
}

const Empty = ({ message }: { message?: string | null }) => (
  <div className="text-center py-4 text-muted-foreground">{message ?? "No data available"}</div>
);

export function Metric({
  label,
  value,
  detail,
  trend,
}: {
  label: string;
  value: string;
  detail?: string | null;
  trend?: "up" | "down" | "neutral" | null;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {trend && <TrendIcon className={`h-4 w-4 ${trendColor}`} />}
      </div>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function Table({
  data,
  columns,
  emptyMessage,
}: {
  data: unknown;
  columns: { key: string; label: string }[];
  emptyMessage?: string | null;
}) {
  const items = toRows(data);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  if (items.length === 0) return <Empty message={emptyMessage ?? "No data"} />;

  const sorted = sortKey
    ? [...items].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        const as = String(av ?? "");
        const bs = String(bv ?? "");
        return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
      })
    : items;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <UITable>
      <TableHeader>
        <TableRow>
          {columns.map((col) => {
            const SortIcon = sortKey === col.key ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return (
              <TableHead key={col.key}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <SortIcon className="h-3 w-3 text-muted-foreground" />
                </button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((item, i) => (
          <TableRow key={i}>
            {columns.map((col) => (
              <TableCell key={col.key}>{String(item[col.key] ?? "")}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </UITable>
  );
}

interface CartesianProps {
  title?: string | null;
  data: unknown;
  xKey: string;
  yKey: string;
  aggregate?: Aggregate;
  color?: string | null;
  height?: number | null;
}

export function BarChart({ title, data, xKey, yKey, aggregate, color, height }: CartesianProps) {
  const { items, valueKey } = processChartData(toRows(data), xKey, yKey, aggregate);
  const chartConfig = { [valueKey]: { label: title ?? valueKey, color: color ?? "var(--chart-1)" } } satisfies ChartConfig;
  if (items.length === 0) return <Empty />;

  return (
    <div className="w-full">
      {title && <p className="text-sm font-medium mb-2">{title}</p>}
      <ChartContainer config={chartConfig} className="min-h-[200px] w-full" style={{ height: height ?? 300 }}>
        <RechartsBarChart accessibilityLayer data={items}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} tickMargin={10} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey={valueKey} fill={`var(--color-${valueKey})`} radius={4} />
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

export function LineChart({ title, data, xKey, yKey, aggregate, color, height }: CartesianProps) {
  const { items, valueKey } = processChartData(toRows(data), xKey, yKey, aggregate);
  const chartConfig = { [valueKey]: { label: title ?? valueKey, color: color ?? "var(--chart-1)" } } satisfies ChartConfig;
  if (items.length === 0) return <Empty />;

  return (
    <div className="w-full">
      {title && <p className="text-sm font-medium mb-2">{title}</p>}
      <ChartContainer
        config={chartConfig}
        className="min-h-[200px] w-full [&_svg]:overflow-visible"
        style={{ height: height ?? 300 }}
      >
        <RechartsLineChart accessibilityLayer data={items}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            interval={items.length > 12 ? Math.ceil(items.length / 8) - 1 : undefined}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey={valueKey} stroke={`var(--color-${valueKey})`} strokeWidth={2} dot={false} />
        </RechartsLineChart>
      </ChartContainer>
    </div>
  );
}

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function PieChart({
  title,
  data,
  nameKey,
  valueKey,
  height,
}: {
  title?: string | null;
  data: unknown;
  nameKey: string;
  valueKey: string;
  height?: number | null;
}) {
  const items = toRows(data);
  if (items.length === 0) return <Empty />;

  const chartConfig: ChartConfig = {};
  items.forEach((item, i) => {
    const name = String(item[nameKey] ?? `Segment ${i + 1}`);
    chartConfig[name] = { label: name, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  return (
    <div className="w-full">
      {title && <p className="text-sm font-medium mb-2">{title}</p>}
      <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full" style={{ height: height ?? 300 }}>
        <RechartsPieChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Pie
            data={items.map((item, i) => ({
              name: String(item[nameKey] ?? `Segment ${i + 1}`),
              value: typeof item[valueKey] === "number" ? item[valueKey] : parseFloat(String(item[valueKey])) || 0,
              fill: PIE_COLORS[i % PIE_COLORS.length],
            }))}
            dataKey="value"
            nameKey="name"
            innerRadius="40%"
            outerRadius="70%"
            paddingAngle={2}
          />
          <Legend />
        </RechartsPieChart>
      </ChartContainer>
    </div>
  );
}

function processChartData(
  items: Row[],
  xKey: string,
  yKey: string,
  aggregate: Aggregate,
): { items: Row[]; valueKey: string } {
  if (items.length === 0) return { items: [], valueKey: yKey };
  if (!aggregate) {
    return { items: items.map((item) => ({ ...item, label: String(item[xKey] ?? "") })), valueKey: yKey };
  }

  const groups = new Map<string, Row[]>();
  for (const item of items) {
    const groupKey = String(item[xKey] ?? "unknown");
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  const valueKey = aggregate === "count" ? "count" : yKey;
  const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)) || 0);
  const aggregated: Row[] = [];
  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    const sum = group.reduce((s, item) => s + num(item[yKey]), 0);
    const value = aggregate === "count" ? group.length : aggregate === "sum" ? sum : sum / group.length;
    aggregated.push({ label: key, [valueKey]: value });
  }
  return { items: aggregated, valueKey };
}
