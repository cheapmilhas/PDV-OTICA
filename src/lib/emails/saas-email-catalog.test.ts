import { describe, it, expect } from "vitest";
import { SAAS_EMAIL_CATALOG, isSaasEmailEnabled } from "./saas-email-catalog";
import type { SaasEmailType } from "@prisma/client";

describe("saas-email-catalog", () => {
  it("cobre os 7 tipos da Fase 1", () => {
    const keys = Object.keys(SAAS_EMAIL_CATALOG);
    expect(keys.sort()).toEqual(
      [
        "WELCOME",
        "TRIAL_ENDING",
        "TRIAL_EXPIRED",
        "INVOICE_OVERDUE",
        "PAYMENT_CONFIRMED",
        "SUBSCRIPTION_SUSPENDED",
        "SUBSCRIPTION_CANCELED",
      ].sort()
    );
  });

  it("cada tipo tem template e subject", () => {
    for (const entry of Object.values(SAAS_EMAIL_CATALOG)) {
      expect(entry.template).toMatch(/^saas-/);
      expect(entry.subject.length).toBeGreaterThan(0);
    }
  });

  it("isSaasEmailEnabled lê a flag certa da config", () => {
    const cfg = { invoiceOverdueEnabled: false, welcomeEnabled: true } as never;
    expect(isSaasEmailEnabled("INVOICE_OVERDUE" as SaasEmailType, cfg)).toBe(false);
    expect(isSaasEmailEnabled("WELCOME" as SaasEmailType, cfg)).toBe(true);
  });
});
