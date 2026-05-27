import { defineConfig } from "vitest/config";
import path from "node:path";

// Per-file env override via doc comment:
//   /** @vitest-environment jsdom */
// no topo de testes React (.test.tsx ou DOM-related .test.ts).
// Default: node (server-side code, services, libs).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", "scripts/_archive", "scripts/qa-integration"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/lib/**", "src/services/**"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.d.ts",
        "src/lib/prisma.ts",
      ],
      thresholds: {
        // Começa baixo; sobe à medida que adiciona testes
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
