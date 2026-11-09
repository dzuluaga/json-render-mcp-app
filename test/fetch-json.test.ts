import { describe, expect, it, vi } from "vitest";
import { allowedHosts, DEFAULT_ALLOWED_HOSTS, fetchJson } from "../src/fetch-json.js";

const HOSTS = ["api.open-meteo.com", "api.github.com"];

function respond(body: unknown, init: ResponseInit = {}) {
  return vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), init)) as unknown as typeof fetch;
}

const forecast = {
  latitude: 37.77,
  daily: {
    time: ["2026-11-08", "2026-11-09", "2026-11-10"],
    temperature_2m_max: [18.2, 19.5, 17.1],
  },
};

describe("fetchJson", () => {
  it("returns the parsed JSON from an allowed host", async () => {
    const fetchImpl = respond(forecast);
    const result = await fetchJson({ url: "https://api.open-meteo.com/v1/forecast?latitude=1" }, HOSTS, fetchImpl);
    expect(result).toMatchObject({ status: 200, data: forecast });
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error" }));
  });

  it("zips parallel arrays into chart rows with path + columns", async () => {
    const result = await fetchJson(
      {
        url: "https://api.open-meteo.com/v1/forecast",
        path: "/daily",
        columns: { label: "time", value: "temperature_2m_max" },
      },
      HOSTS,
      respond(forecast),
    );
    expect(result.data).toEqual([
      { label: "2026-11-08", value: 18.2 },
      { label: "2026-11-09", value: 19.5 },
      { label: "2026-11-10", value: 17.1 },
    ]);
  });

  it("maps an array of objects to rows and applies limit", async () => {
    const contributors = [
      { login: "ada", contributions: 40, author: { type: "User" } },
      { login: "alan", contributions: 12, author: { type: "Bot" } },
      { login: "grace", contributions: 7, author: { type: "User" } },
    ];
    const result = await fetchJson(
      { url: "https://api.github.com/repos/a/b/contributors", columns: { label: "login", value: "contributions", kind: "author.type" }, limit: 2 },
      HOSTS,
      respond(contributors),
    );
    expect(result.data).toEqual([
      { label: "ada", value: 40, kind: "User" },
      { label: "alan", value: 12, kind: "Bot" },
    ]);
  });

  it.each([
    ["a host off the allowlist", "https://evil.example.com/data.json", /not allowed/],
    ["plain http", "http://api.open-meteo.com/v1/forecast", /Only https/],
    ["a malformed URL", "not a url", /Not a valid URL/],
  ])("rejects %s without fetching", async (_, url, message) => {
    const fetchImpl = respond(forecast);
    await expect(fetchJson({ url }, HOSTS, fetchImpl)).rejects.toThrow(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports HTTP errors, non-JSON bodies and missing paths", async () => {
    const url = "https://api.github.com/repos/a/b";
    await expect(fetchJson({ url }, HOSTS, respond({ message: "Not Found" }, { status: 404 }))).rejects.toThrow(/HTTP 404/);
    await expect(fetchJson({ url }, HOSTS, respond("<html>nope</html>"))).rejects.toThrow(/not JSON/);
    await expect(fetchJson({ url, path: "/nope" }, HOSTS, respond(forecast))).rejects.toThrow(/Path \/nope not found/);
  });

  it("reads the allowlist from FETCH_ALLOWED_HOSTS", () => {
    expect(allowedHosts({})).toEqual(DEFAULT_ALLOWED_HOSTS);
    expect(allowedHosts({ FETCH_ALLOWED_HOSTS: " Example.com, api.test " })).toEqual(["example.com", "api.test"]);
  });
});
