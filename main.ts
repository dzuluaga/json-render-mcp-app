import { createServer as createHttpServer } from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from "@modelcontextprotocol/node";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer, type Submission } from "./server.js";

// Submissions outlive the per-request servers in HTTP mode.
const submissions: Submission[] = [];

async function startStdio(): Promise<void> {
  await createServer(submissions).connect(new StdioServerTransport());
}

function startHttp(): void {
  const port = Number(process.env.PORT ?? 3001);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  createHttpServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    // Stateless: a fresh server and transport per request.
    const server = createServer(submissions);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }).listen(port, "127.0.0.1", () => {
    console.error(`MCP server on http://localhost:${port}/mcp`);
  });
}

if (process.argv.includes("--stdio")) {
  startStdio().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  startHttp();
}
