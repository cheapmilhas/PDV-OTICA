import { defineConfig } from "vitest/config";

// Per-file env override via doc comment:
//   /** @vitest-environment jsdom */
// no topo de testes React (.test.tsx ou DOM-related .test.ts).
// Default: node (server-side code, services, libs).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
