import { describe, it, expect } from "vitest";
import { SAAS_EMAIL_CATALOG, isSaasEmailEnabled } from "./saas-email-catalog";
import type { SaasEmailType } from "@prisma/client";

describe("saas-email-catalog", () => {
  it("cobre os 9 tipos (Fase 1 + Fase 2)", () => {
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
        "INVOICE_CREATED",
        "INVOICE_DUE_SOON",
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

  it("catálogo cobre INVOICE_CREATED e INVOICE_DUE_SOON", () => {
    expect(SAAS_EMAIL_CATALOG.INVOICE_CREATED.template).toBe("saas-invoice-created");
    expect(SAAS_EMAIL_CATALOG.INVOICE_CREATED.configFlag).toBe("invoiceCreatedEnabled");
    expect(SAAS_EMAIL_CATALOG.INVOICE_DUE_SOON.template).toBe("saas-invoice-due-soon");
    expect(SAAS_EMAIL_CATALOG.INVOICE_DUE_SOON.configFlag).toBe("invoiceDueSoonEnabled");
  });

  it("isSaasEmailEnabled respeita a flag dos tipos novos", () => {
    expect(isSaasEmailEnabled("INVOICE_CREATED" as SaasEmailType, { invoiceCreatedEnabled: false })).toBe(false);
    expect(isSaasEmailEnabled("INVOICE_DUE_SOON" as SaasEmailType, { invoiceDueSoonEnabled: true })).toBe(true);
  });
});
