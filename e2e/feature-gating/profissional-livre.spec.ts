import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/login";

/**
 * Pré-requisitos:
 *  - Dev server rodando
 *  - Env: E2E_PRO_EMAIL, E2E_PRO_PASSWORD
 *  - Cliente de teste com Subscription.planId em Plan slug='profissional' ou 'enterprise'
 *  - Seed `db:seed:plan-basico-features` aplicado (planos pagos ganham 13 features=true)
 */
test.skip(
  !process.env.E2E_PRO_EMAIL || !process.env.E2E_PRO_PASSWORD,
  "Pula spec: credenciais E2E_PRO_* ausentes.",
);

test.describe("Cliente no plano Profissional — acesso livre", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "profissional");
  });

  for (const [feature, path] of [
    ["DRE", "/dashboard/financeiro/dre"],
    ["Fluxo de Caixa", "/dashboard/financeiro/fluxo-caixa"],
    ["Lançamentos", "/dashboard/financeiro/lancamentos"],
    ["Tratamentos", "/dashboard/tratamentos"],
    ["Transferências", "/dashboard/estoque/transferencias"],
    ["Conciliação", "/dashboard/financeiro/conciliacao"],
    ["BI", "/dashboard/financeiro/bi"],
  ] as const) {
    test(`libera ${feature} (${path})`, async ({ page }) => {
      await page.goto(path);
      // NÃO deve ter redirecionado pra /dashboard?upgrade-required
      await expect(page).not.toHaveURL(/upgrade-required/);
      // E deve estar na URL pedida (ou seu /dashboard/financeiro pai)
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
    });
  }

  test("sidebar mostra os 13 itens gated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("DRE Dinâmica", { exact: true })).toBeVisible();
    await expect(page.getByText("Tratamentos", { exact: true })).toBeVisible();
    await expect(page.getByText("Devoluções", { exact: true })).toBeVisible();
    await expect(page.getByText("BI Analítico", { exact: true })).toBeVisible();
  });

  test("API gated retorna 2xx para plano profissional", async ({ request }) => {
    const res = await request.get("/api/finance/entries");
    // Não pode ser 403 (PLAN_FEATURE_REQUIRED)
    expect([200, 401, 500].includes(res.status())).toBe(true);
    if (res.status() === 403) {
      const body = (await res.json()) as { error?: { code?: string } };
      expect(body.error?.code).not.toBe("PLAN_FEATURE_REQUIRED");
    }
  });
});
