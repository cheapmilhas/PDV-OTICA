import { test, expect } from "@playwright/test";

test("smoke: playwright wired up", async () => {
  // Pure unit-level smoke that doesn't need a running server.
  // Real E2E specs in e2e/feature-gating/ require `npm run dev` separately.
  expect(1 + 1).toBe(2);
});
