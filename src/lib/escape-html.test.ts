import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escape-html";

// Bloco 1 segurança: recibo/carnê passaram a escapar campos do cliente.
// Aqui provamos o comportamento da função de escape compartilhada (prova dupla:
// furo fechado para payload de XSS + uso normal renderiza certo).

describe("escapeHtml — anti-XSS no recibo/carnê", () => {
  it("furo fechado: <script> vira texto, não executa", () => {
    const out = escapeHtml("<script>alert(1)</script>");
    expect(out).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>");
  });

  it("furo fechado: payload de atributo (onerror/img) é neutralizado", () => {
    const out = escapeHtml('<img src=x onerror="alert(document.cookie)">');
    expect(out).not.toContain("<img");
    expect(out).not.toContain('"'); // aspas viram &quot; → não fecham atributo
    expect(out).toContain("&lt;img");
    expect(out).toContain("&quot;");
  });

  it("furo fechado: aspas simples também escapadas (quebra de atributo)", () => {
    expect(escapeHtml("' onmouseover='alert(1)")).toContain("&#39;");
  });

  it("uso normal: nome comum com & e apóstrofo renderiza legível (entidades válidas, não lixo)", () => {
    // José D'Ávila & Filhos — escape produz entidades HTML corretas que o
    // navegador re-renderiza como o texto original (não aparece lixo na tela).
    const out = escapeHtml("José D'Ávila & Filhos");
    expect(out).toBe("José D&#39;Ávila &amp; Filhos");
    // acentos preservados (escapeHtml não toca em caracteres não-HTML)
    expect(out).toContain("José");
    expect(out).toContain("Ávila");
  });

  it("uso normal: nome simples passa intacto", () => {
    expect(escapeHtml("Maria Silva")).toBe("Maria Silva");
  });

  it("null/undefined viram string vazia (não quebra o template)", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
