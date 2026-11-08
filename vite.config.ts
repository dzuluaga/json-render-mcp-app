import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The UI ships as one self-contained HTML file served as the MCP App resource.
// `npm run dev` serves dev/host.html, a local test host, proxying /mcp to the server.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  server: {
    open: "/dev/host.html",
    proxy: { "/mcp": "http://localhost:3001" },
  },
  build: {
    rollupOptions: { input: "mcp-app.html" },
    outDir: "dist",
    emptyOutDir: false,
  },
});
