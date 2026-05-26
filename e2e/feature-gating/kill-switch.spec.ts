import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/login";

/**
 * Spec do kill switch DISABLE_PLAN_FEATURE_GATING.
 *
 * Esse spec NÃO seta a env var sozinho — ela precisa estar no servidor.
 * Roda só quando o usuário explicitamente sinaliza que o dev server foi iniciado
 * com `DISABLE_PLAN_FEATURE_GATING=true npm run dev`.
 *
 * Setup:
 *   1. Em um terminal: DISABLE_PLAN_FEATURE_GATING=true npm run dev
 *   2. Em outro: E2E_KILL_SWITCH=true E2E_BASICO_EMAIL=... E2E_BASICO_PASSWORD=... \
 *                npm run e2e -- e2e/feature-gating/kill-switch.spec.ts
 */
test.skip(
  process.env.E2E_KILL_SWITCH !== "true",
  "Pula spec: rode dev server com DISABLE_PLAN_FEATURE_GATING=true e setar E2E_KILL_SWITCH=true",
);
test.skip(
  !process.env.E2E_BASICO_EMAIL || !process.env.E2E_BASICO_PASSWORD,
  "Pula spec: credenciais E2E_BASICO_* ausentes.",
);

test.describe("Kill switch DISABLE_PLAN_FEATURE_GATING", () => {
  test("básico vê tudo quando kill switch ligado", async ({ page }) => {
    await loginAs(page, "basico");

    // Acessa páginas que normalmente seriam bloqueadas
    for (const path of [
      "/dashboard/financeiro/dre",
      "/dashboard/tratamentos",
      "/dashboard/financeiro/cartoes",
    ]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/upgrade-required/);
    }
  });

  test("API gated devolve 2xx (não 403) quando kill switch ligado", async ({ request }) => {
    const res = await request.get("/api/finance/entries");
    expect(res.status()).not.toBe(403);
  });
});
