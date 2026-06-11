import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "./templates";

describe("email templates", () => {
  it("renderiza convite com HTML escapado", () => {
    const email = renderEmailTemplate("invite", {
      name: "<Admin>",
      companyName: "Otica & Cia",
      activationUrl: "https://app.example.com/activate?token=abc",
      expiresAt: "2026-06-10T12:00:00.000Z",
    });

    expect(email.html).toContain("&lt;Admin&gt;");
    expect(email.html).toContain("Otica &amp; Cia");
    expect(email.html).toContain("https://app.example.com/activate?token=abc");
    expect(email.text).toContain("Ative seu acesso");
  });

  it("rejeita template desconhecido", () => {
    expect(() => renderEmailTemplate("unknown", {})).toThrow(/Unsupported email template/);
  });
});

describe("templates SaaS (Fase 1)", () => {
  const base = "https://app.vis.app.br";

  it("saas-welcome renderiza com nome e URL de acesso", () => {
    const { html, text } = renderEmailTemplate("saas-welcome", { name: "João", loginUrl: base });
    expect(html).toContain("João");
    expect(html).toContain(base);
    expect(text).toContain("João");
  });

  it("saas-trial-ending mostra dias restantes e CTA de assinar", () => {
    const { html } = renderEmailTemplate("saas-trial-ending", { name: "João", daysLeft: 3, subscribeUrl: base + "/dashboard/upgrade" });
    expect(html).toContain("3");
    expect(html).toContain("/dashboard/upgrade");
  });

  it("saas-trial-expired renderiza CTA de assinar", () => {
    const { html } = renderEmailTemplate("saas-trial-expired", { name: "João", subscribeUrl: base + "/dashboard/upgrade" });
    expect(html).toContain("/dashboard/upgrade");
  });

  it("saas-invoice-overdue mostra dias de atraso e CTA de pagar", () => {
    const { html } = renderEmailTemplate("saas-invoice-overdue", { name: "João", daysOverdue: 7, payUrl: base + "/dashboard/configuracoes" });
    expect(html).toContain("7");
    expect(html).toContain("/dashboard/configuracoes");
  });

  it("saas-payment-confirmed mostra valor", () => {
    const { html } = renderEmailTemplate("saas-payment-confirmed", { name: "João", amountLabel: "R$ 149,90" });
    expect(html).toContain("R$ 149,90");
  });

  it("saas-subscription-suspended renderiza CTA de regularizar", () => {
    const { html } = renderEmailTemplate("saas-subscription-suspended", { name: "João", payUrl: base + "/dashboard/configuracoes" });
    expect(html).toContain("/dashboard/configuracoes");
  });

  it("saas-subscription-canceled renderiza mensagem de cancelamento", () => {
    const { html } = renderEmailTemplate("saas-subscription-canceled", { name: "João", reactivateUrl: base + "/dashboard/upgrade" });
    expect(html).toContain("/dashboard/upgrade");
  });

  it("rejeita dados inválidos (Zod)", () => {
    expect(() => renderEmailTemplate("saas-welcome", { name: "" })).toThrow();
  });

  it("escapa HTML do nome (anti-injeção)", () => {
    const { html } = renderEmailTemplate("saas-welcome", { name: "<script>x</script>", loginUrl: base });
    expect(html).not.toContain("<script>x</script>");
  });

  it("escapa o nome no heading UMA vez só (sem escape duplo)", () => {
    // "João & Cia" deve virar "João &amp; Cia" no HTML, NUNCA "João &amp;amp; Cia".
    // Regressão: o nome era pré-escapado no template E re-escapado no layout.
    const { html } = renderEmailTemplate("saas-welcome", { name: "João & Cia", loginUrl: base });
    expect(html).toContain("João &amp; Cia");
    expect(html).not.toContain("&amp;amp;");
  });
});
