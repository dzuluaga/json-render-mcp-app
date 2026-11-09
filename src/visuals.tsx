import DOMPurify from "dompurify";
import { DATA_IMAGE_URL } from "./spec-schema.js";

type Cell = string | number | boolean | null;

export function Table({
  columns,
  rows,
  caption,
}: {
  columns: { key: string; label: string }[];
  rows: Record<string, Cell>[];
  caption?: string | null;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={typeof rows?.[0]?.[c.key] === "number" ? "num" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(Array.isArray(rows) ? rows : []).map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const v = row?.[c.key];
                return (
                  <td key={c.key} className={typeof v === "number" ? "num" : undefined}>
                    {v === null || v === undefined ? "" : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SERIES = 6;
const color = (i: number) => `var(--chart-${(i % SERIES) + 1})`;
const fmt = (v: number, unit?: string | null) => {
  const n = Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (!unit) return n;
  return unit === "$" || unit === "€" || unit === "£" ? `${unit}${n}` : `${n}${unit}`;
};

export function Chart({
  kind,
  title,
  data,
  unit,
}: {
  kind: "bar" | "line" | "pie";
  title?: string | null;
  data: { label: string; value: number }[];
  unit?: string | null;
}) {
  const points = (Array.isArray(data) ? data : []).filter((d) => d && Number.isFinite(d.value));
  return (
    <figure className="chart">
      {title && <figcaption>{title}</figcaption>}
      {points.length === 0 ? (
        <p className="text tone-muted">No data</p>
      ) : kind === "pie" ? (
        <Pie points={points} unit={unit} />
      ) : kind === "line" ? (
        <Line points={points} unit={unit} />
      ) : (
        <Bars points={points} unit={unit} />
      )}
    </figure>
  );
}

type Points = { label: string; value: number }[];

function Bars({ points, unit }: { points: Points; unit?: string | null }) {
  const max = Math.max(...points.map((p) => Math.abs(p.value)), 0) || 1;
  return (
    <div className="bars">
      {points.map((p, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label">{p.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(Math.max(p.value, 0) / max) * 100}%`, background: color(0) }} />
          </span>
          <span className="bar-value">{fmt(p.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}

function Line({ points, unit }: { points: Points; unit?: string | null }) {
  const W = 320;
  const H = 140;
  const pad = { l: 18, r: 18, t: 12, b: 22 };
  const values = points.map((p) => p.value);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 0) || 1;
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(points.length / 6);
  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img">
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="axis" />
      <path d={path} fill="none" stroke={color(0)} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={3} fill={color(0)}>
            <title>{`${p.label}: ${fmt(p.value, unit)}`}</title>
          </circle>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 6} textAnchor="middle" className="tick">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Pie({ points, unit }: { points: Points; unit?: string | null }) {
  const slices = points.filter((p) => p.value > 0);
  const total = slices.reduce((sum, p) => sum + p.value, 0) || 1;
  let angle = -Math.PI / 2;
  const arcs = slices.map((p, i) => {
    const start = angle;
    angle += (p.value / total) * Math.PI * 2;
    const large = angle - start > Math.PI ? 1 : 0;
    const [x1, y1, x2, y2] = [Math.cos(start), Math.sin(start), Math.cos(angle), Math.sin(angle)].map((n) => 50 + 45 * n);
    const d =
      slices.length === 1
        ? "M50,5 A45,45 0 1 1 49.99,5 Z"
        : `M50,50 L${x1.toFixed(2)},${y1.toFixed(2)} A45,45 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    return <path key={i} d={d} fill={color(i)} />;
  });
  return (
    <div className="pie">
      <svg viewBox="0 0 100 100" role="img">
        {arcs}
      </svg>
      <ul className="legend">
        {slices.map((p, i) => (
          <li key={i}>
            <span className="swatch" style={{ background: color(i) }} />
            {p.label}
            <span className="legend-value">
              {fmt(p.value, unit)} · {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Only same-document references (#id) survive; everything else that could load or run something is dropped.
DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  const value = data.attrValue.trim();
  if ((data.attrName === "href" || data.attrName === "xlink:href" || data.attrName === "src") && !value.startsWith("#")) {
    data.keepAttr = false;
  }
  if (/url\(\s*["']?\s*(?!#)/i.test(value)) data.keepAttr = false;
});

export function Svg({ svg, title, maxWidth }: { svg: string; title?: string | null; maxWidth?: number | null }) {
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "image", "script", "style"],
  });
  return (
    <figure className="svg" style={maxWidth ? { maxWidth } : undefined}>
      <div role="img" aria-label={title ?? undefined} dangerouslySetInnerHTML={{ __html: clean }} />
      {title && <figcaption>{title}</figcaption>}
    </figure>
  );
}

/** Shows embedded images only; anything that isn't a data:image URL renders as a placeholder. */
export function Image({ src, alt, maxWidth }: { src: string; alt: string; maxWidth?: number | null }) {
  if (typeof src !== "string" || !DATA_IMAGE_URL.test(src)) {
    return <p className="text tone-muted">[image unavailable]</p>;
  }
  return <img className="image" src={src} alt={alt} style={maxWidth ? { maxWidth } : undefined} />;
}
