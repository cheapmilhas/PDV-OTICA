import type { Page } from "@playwright/test";

/**
 * Helper de login em uma conta de teste. Requer credenciais via env vars:
 *  - E2E_BASICO_EMAIL / E2E_BASICO_PASSWORD
 *  - E2E_PRO_EMAIL    / E2E_PRO_PASSWORD
 *
 * Conta basico: subscription apontando para Plan slug='basico'.
 * Conta pro:    subscription apontando para Plan slug='profissional' (ou 'enterprise').
 */
export async function loginAs(page: Page, plan: "basico" | "profissional"): Promise<void> {
  const email =
    plan === "basico"
      ? process.env.E2E_BASICO_EMAIL
      : process.env.E2E_PRO_EMAIL;
  const password =
    plan === "basico"
      ? process.env.E2E_BASICO_PASSWORD
      : process.env.E2E_PRO_PASSWORD;

  if (!email || !password) {
    throw new Error(
      `[e2e] Credenciais ausentes para plano ${plan}. ` +
        `Defina E2E_${plan === "basico" ? "BASICO" : "PRO"}_EMAIL e _PASSWORD.`,
    );
  }

  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}
