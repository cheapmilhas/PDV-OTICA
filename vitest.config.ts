import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["src/**/*.test.tsx", "jsdom"],
      ["src/components/**/*.test.ts", "jsdom"],
    ],
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
