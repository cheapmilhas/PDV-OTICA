import { describe, it, expect, vi, beforeEach } from "vitest";

const getSaasEmailSenderView = vi.fn();
vi.mock("@/services/saas-email-config.service", () => ({
  getSaasEmailSenderView: () => getSaasEmailSenderView(),
}));

import { getIntegrationsStatus } from "./integrations-status.service";

function row(key: string, rows: Awaited<ReturnType<typeof getIntegrationsStatus>>) {
  return rows.find((r) => r.key === key)!;
}

beforeEach(() => {
  getSaasEmailSenderView.mockReset();
  for (const k of ["RESEND_API_KEY", "ASAAS_API_KEY", "EVOLUTION_API_KEY", "EVOLUTION_API_URL", "SENTRY_DSN", "FOCUS_NFE_TOKEN"]) {
    delete process.env[k];
  }
});

describe("getIntegrationsStatus", () => {
  it("Resend configurado pelo banco → source=banco (mesmo sem env)", async () => {
    getSaasEmailSenderView.mockResolvedValue({ hasResendKey: true, emailFrom: null, emailReplyTo: null });
    const r = row("resend", await getIntegrationsStatus());
    expect(r.configured).toBe(true);
    expect(r.source).toBe("banco");
  });

  it("Resend configurado só por env → source=env", async () => {
    getSaasEmailSenderView.mockResolvedValue({ hasResendKey: false, emailFrom: null, emailReplyTo: null });
    process.env.RESEND_API_KEY = "re_x";
    const r = row("resend", await getIntegrationsStatus());
    expect(r.configured).toBe(true);
    expect(r.source).toBe("env");
  });

  it("Resend sem nada → não configurado", async () => {
    getSaasEmailSenderView.mockResolvedValue({ hasResendKey: false, emailFrom: null, emailReplyTo: null });
    const r = row("resend", await getIntegrationsStatus());
    expect(r.configured).toBe(false);
    expect(r.source).toBe("nenhum");
  });

  it("Evolution exige AMBAS as envs (key E url)", async () => {
    getSaasEmailSenderView.mockResolvedValue({ hasResendKey: false, emailFrom: null, emailReplyTo: null });
    process.env.EVOLUTION_API_KEY = "k";
    // sem EVOLUTION_API_URL → não configurado
    let r = row("evolution", await getIntegrationsStatus());
    expect(r.configured).toBe(false);
    process.env.EVOLUTION_API_URL = "https://evo";
    r = row("evolution", await getIntegrationsStatus());
    expect(r.configured).toBe(true);
  });

  it("nunca expõe valor de segredo (só booleano/label/source/hint)", async () => {
    getSaasEmailSenderView.mockResolvedValue({ hasResendKey: false, emailFrom: null, emailReplyTo: null });
    process.env.ASAAS_API_KEY = "aact_SUPER_SECRETA";
    const rows = await getIntegrationsStatus();
    expect(JSON.stringify(rows)).not.toContain("aact_SUPER_SECRETA");
  });

  it("é resiliente a falha do getSaasEmailSenderView (fallback só env)", async () => {
    getSaasEmailSenderView.mockRejectedValue(new Error("db down"));
    process.env.RESEND_API_KEY = "re_x";
    const r = row("resend", await getIntegrationsStatus());
    expect(r.configured).toBe(true); // via env
    expect(r.source).toBe("env");
  });
});
