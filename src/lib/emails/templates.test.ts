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

describe("saas-invoice-created", () => {
  const data = { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", pixCode: "PIXCOPIACOLA123", paymentUrl: "https://asaas/i/1", boletoUrl: "https://asaas/b/1" };
  it("renderiza com PIX copia-e-cola, botão e link do boleto", () => {
    const { html, text } = renderEmailTemplate("saas-invoice-created", data);
    expect(html).toContain("PIXCOPIACOLA123");
    expect(html).toContain("https://asaas/i/1");   // botão Pagar agora
    expect(html).toContain("https://asaas/b/1");   // boleto
    expect(html).toContain("R$ 149,90");
    expect(html).not.toContain("data:image");       // SEM imagem base64
    expect(html).not.toContain("encodedImage");
    expect(text).toContain("PIXCOPIACOLA123");
  });
  it("degrada sem pixCode/boletoUrl (só botão)", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", paymentUrl: "https://asaas/i/1" });
    expect(html).toContain("https://asaas/i/1");
  });
});

describe("saas-invoice-due-soon", () => {
  it("renderiza tom de lembrete", () => {
    const { html } = renderEmailTemplate("saas-invoice-due-soon", { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", pixCode: "PIX", paymentUrl: "https://asaas/i/1" });
    expect(html.toLowerCase()).toContain("vence");
  });
});

describe("saas-invoice-created — card de valor + descrição (Email-A)", () => {
  const base = { name: "João", amountLabel: "R$ 149,90", dueDateLabel: "10/07/2026", paymentUrl: "https://asaas/i/1" };

  it("(a) com description → card contém a descrição escapada", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", { ...base, description: "Mensalidade Plano Profissional" });
    expect(html).toContain("Mensalidade Plano Profissional");
    expect(html.toLowerCase()).toContain("descrição");
  });

  it("(b) sem description → NÃO renderiza a linha de Descrição", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", base);
    expect(html.toLowerCase()).not.toContain("descrição");
  });

  it("(c) valor, vencimento, PIX, botão e boleto presentes", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", {
      ...base,
      pixCode: "PIXCOPIACOLA123",
      boletoUrl: "https://asaas/b/1",
    });
    expect(html).toContain("R$ 149,90");
    expect(html).toContain("10/07/2026");
    expect(html).toContain("PIXCOPIACOLA123");
    expect(html).toContain("https://asaas/i/1"); // botão
    expect(html).toContain("https://asaas/b/1"); // boleto
  });

  it("(d) XSS na description é escapado", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", { ...base, description: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("(e) due_soon (lembrete) também aceita description", () => {
    const { html } = renderEmailTemplate("saas-invoice-due-soon", { ...base, description: "Mensalidade Julho" });
    expect(html).toContain("Mensalidade Julho");
  });
});

describe("saas-invoice-created — hardening (Fase 2)", () => {
  it("escapa dados HTML no corpo (sem XSS)", () => {
    const { html } = renderEmailTemplate("saas-invoice-created", {
      name: "João",
      amountLabel: "R$ <b>149</b>",
      dueDateLabel: "10/07/2026",
      pixCode: "<script>x</script>",
      paymentUrl: "https://asaas/i/1",
    });
    expect(html).not.toContain("<b>149</b>");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;"); // escapado por escapeHtml
  });

  it("rejeita paymentUrl com esquema javascript:", () => {
    expect(() =>
      renderEmailTemplate("saas-invoice-created", {
        name: "João",
        amountLabel: "R$ 1",
        dueDateLabel: "10/07/2026",
        paymentUrl: "javascript:alert(1)",
      })
    ).toThrow();
  });
});
