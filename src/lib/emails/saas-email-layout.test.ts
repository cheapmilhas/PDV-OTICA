import { describe, it, expect } from "vitest";
import { renderSaasEmailLayout } from "./saas-email-layout";

describe("renderSaasEmailLayout", () => {
  it("monta HTML com título, corpo, botão e marca Vis", () => {
    const html = renderSaasEmailLayout({
      previewTitle: "Bem-vindo",
      heading: "Olá, João",
      bodyHtml: "<p>Conta criada.</p>",
      cta: { label: "Acessar", url: "https://app.vis.app.br" },
    });
    expect(html).toContain("Olá, João");
    expect(html).toContain("Acessar");
    expect(html).toContain("https://app.vis.app.br");
    expect(html).toContain("#2E6BFF"); // marca Vis
    expect(html).toContain("<table"); // modo email
    expect(html).not.toContain("display:flex"); // sem flexbox
  });

  it("exibe a logo Vis na faixa do cabeçalho", () => {
    const html = renderSaasEmailLayout({
      previewTitle: "Bem-vindo",
      heading: "Olá, João",
      bodyHtml: "<p>Conta criada.</p>",
    });
    expect(html).toContain('alt="Vis"');
    expect(html).toContain("vis-logo-email.png");
    expect(html).toContain("#2E6BFF"); // marca preservada
    expect(html).toContain("Olá, João"); // heading segue presente
    expect(html).toContain("Sistema de gestão para óticas"); // rodapé segue presente
  });

  it("funciona sem CTA (botão opcional)", () => {
    const html = renderSaasEmailLayout({
      previewTitle: "Aviso",
      heading: "Aviso",
      bodyHtml: "<p>Corpo.</p>",
    });
    expect(html).toContain("Aviso");
    expect(html).not.toContain("<a href");
  });
});
