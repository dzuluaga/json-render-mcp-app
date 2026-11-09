// Server-side JSON fetching for the fetch_json tool. The UI iframe can't reach
// the network (the host's CSP blocks it), so buttons call this tool instead and
// the server does the request, limited to an allowlist of hosts.

export const DEFAULT_ALLOWED_HOSTS = ["api.open-meteo.com", "geocoding-api.open-meteo.com", "api.github.com"];

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;
const MAX_ROWS = 500;

export function allowedHosts(env = process.env): string[] {
  const configured = env.FETCH_ALLOWED_HOSTS?.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_HOSTS;
}

export class FetchJsonError extends Error {}

export interface FetchJsonOptions {
  url: string;
  /** JSON Pointer into the response, e.g. "/daily". */
  path?: string;
  /**
   * Turn the selected value into rows: { outKey: source }. For an array of
   * objects, source is a field (dot path) of each item; for an object of
   * parallel arrays, source is the key (or JSON Pointer) of one array.
   */
  columns?: Record<string, string>;
  limit?: number;
}

export async function fetchJson(
  { url, path, columns, limit }: FetchJsonOptions,
  hosts: string[] = allowedHosts(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string; status: number; data: unknown }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchJsonError(`Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") throw new FetchJsonError("Only https URLs are allowed.");
  if (!hosts.includes(parsed.hostname.toLowerCase())) {
    throw new FetchJsonError(`Host ${parsed.hostname} is not allowed. Allowed hosts: ${hosts.join(", ")}.`);
  }

  let response: Response;
  try {
    response = await fetchImpl(parsed, {
      headers: { accept: "application/json", "user-agent": "json-render-mcp-app" },
      redirect: "error", // a redirect could leave the allowlist
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new FetchJsonError(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = await response.text();
  if (body.length > MAX_BYTES) throw new FetchJsonError(`Response is larger than ${MAX_BYTES} bytes.`);
  if (!response.ok) throw new FetchJsonError(`HTTP ${response.status}: ${body.slice(0, 200)}`);

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new FetchJsonError("Response is not JSON.");
  }
  if (path) data = pointer(data, path);
  if (columns) data = toRows(data, columns);
  if (Array.isArray(data)) data = data.slice(0, Math.min(limit ?? MAX_ROWS, MAX_ROWS));
  return { url: parsed.toString(), status: response.status, data };
}

function pointer(value: unknown, path: string): unknown {
  if (path === "" || path === "/") return value;
  const keys = path.replace(/^\//, "").split("/").map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = value;
  for (const key of keys) {
    if (current === null || typeof current !== "object" || !(key in current)) {
      throw new FetchJsonError(`Path ${path} not found in the response.`);
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function field(item: unknown, source: string): unknown {
  if (source.startsWith("/")) return pointer(item, source);
  return source.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), item);
}

function toRows(value: unknown, columns: Record<string, string>): Record<string, unknown>[] {
  const entries = Object.entries(columns);
  if (Array.isArray(value)) {
    return value.map((item) => Object.fromEntries(entries.map(([out, src]) => [out, field(item, src) ?? null])));
  }
  if (value && typeof value === "object") {
    const arrays = entries.map(([out, src]) => {
      const column = src.startsWith("/") ? pointer(value, src) : (value as Record<string, unknown>)[src];
      if (!Array.isArray(column)) throw new FetchJsonError(`columns.${out}: "${src}" is not an array.`);
      return [out, column] as const;
    });
    const length = Math.min(...arrays.map(([, column]) => column.length));
    return Array.from({ length }, (_, i) => Object.fromEntries(arrays.map(([out, column]) => [out, column[i] ?? null])));
  }
  throw new FetchJsonError("columns needs an array of objects or an object of parallel arrays.");
}
