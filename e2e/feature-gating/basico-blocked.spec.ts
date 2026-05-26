import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/login";

/**
 * Pré-requisitos para rodar:
 *  - Dev server rodando em E2E_BASE_URL (default http://localhost:3000)
 *  - Env: E2E_BASICO_EMAIL, E2E_BASICO_PASSWORD com credenciais válidas
 *  - Cliente de teste com Subscription.planId apontando para Plan slug='basico'
 *  - Seed `db:seed:plan-basico-features` aplicado nesse banco
 *  - DISABLE_PLAN_FEATURE_GATING NÃO setado (ou setado como "false")
 *
 * Rodar: `E2E_BASICO_EMAIL=... E2E_BASICO_PASSWORD=... npm run e2e -- e2e/feature-gating/basico-blocked.spec.ts`
 */
test.skip(
  !process.env.E2E_BASICO_EMAIL || !process.env.E2E_BASICO_PASSWORD,
  "Pula spec: credenciais E2E_BASICO_* ausentes.",
);

test.describe("Cliente no plano Básico — bloqueios", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "basico");
  });

  for (const [feature, path] of [
    ["DRE Dinâmico", "/dashboard/financeiro/dre"],
    ["Fluxo de Caixa", "/dashboard/financeiro/fluxo-caixa"],
    ["Lançamentos", "/dashboard/financeiro/lancamentos"],
    ["Devoluções", "/dashboard/financeiro/devolucoes"],
    ["Tratamentos", "/dashboard/tratamentos"],
    ["Transferências", "/dashboard/estoque/transferencias"],
    ["Conciliação", "/dashboard/financeiro/conciliacao"],
    ["BI Analítico", "/dashboard/financeiro/bi"],
    ["Cartões", "/dashboard/financeiro/cartoes"],
    ["Despesas Fixas", "/dashboard/financeiro/despesas-recorrentes"],
  ] as const) {
    test(`redireciona ${feature} (${path}) → /dashboard?upgrade-required`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard\?upgrade-required=/);
      // Banner deve renderizar com label da feature
      await expect(page.getByRole("alert")).toBeVisible();
    });
  }

  test("sidebar não lista os 13 itens gated", async ({ page }) => {
    await page.goto("/dashboard");
    // Items que NÃO devem aparecer
    await expect(page.getByText("DRE Dinâmica", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Tratamentos", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Devoluções", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Conciliação", { exact: true })).toHaveCount(0);
    await expect(page.getByText("BI Analítico", { exact: true })).toHaveCount(0);
  });

  test("API gated retorna 403 com code PLAN_FEATURE_REQUIRED", async ({ request }) => {
    const res = await request.get("/api/finance/entries");
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: { code: string; feature: string } };
    expect(body.error.code).toBe("PLAN_FEATURE_REQUIRED");
    expect(body.error.feature).toBe("finance_entries");
  });
});
