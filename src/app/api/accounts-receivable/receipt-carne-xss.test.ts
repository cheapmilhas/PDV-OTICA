import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Bloco 1 segurança: garante (regressão) que as rotas de recibo e carnê NÃO
// interpolam campos controlados pelo cliente no HTML sem escapeHtml.
// É um teste de fonte: se alguém reintroduzir `${customer.name}` cru, falha.

const ROOT = process.cwd();
const RECEIPT = join(ROOT, "src/app/api/accounts-receivable/[id]/receipt/route.ts");
const CARNE = join(ROOT, "src/app/api/accounts-receivable/sale/[saleId]/carne/route.ts");

function source(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("recibo: campos do cliente escapados", () => {
  const src = source(RECEIPT);

  it("importa escapeHtml", () => {
    expect(src).toMatch(/import\s*\{\s*escapeHtml\s*\}\s*from\s*["']@\/lib\/escape-html["']/);
  });

  it("nenhuma interpolação CRUA de customer.name/description/receivedBy/companyName/cnpj/phone", () => {
    // padrões crus proibidos (sem escapeHtml em volta)
    const crusProibidos = [
      /\$\{receivable\.customer\?\.name[^}]*\}/,
      /\$\{receivable\.description\}/,
      /\$\{receivable\.receivedBy\?\.name[^}]*\}/,
      /\$\{companyName\}/,
      /\$\{company\.cnpj\}/,
      /\$\{company\.phone\}/,
    ];
    for (const re of crusProibidos) {
      // Só falha se o match existir E não estiver dentro de escapeHtml(...)
      const m = src.match(re);
      if (m) {
        const idx = m.index ?? 0;
        const around = src.slice(Math.max(0, idx - 12), idx);
        expect(around, `interpolação crua encontrada: ${m[0]}`).toContain("escapeHtml(");
      }
    }
  });

  it("contém escapeHtml aplicado ao nome do cliente", () => {
    expect(src).toMatch(/escapeHtml\(receivable\.customer\?\.name/);
  });
});

describe("carnê: campos do cliente escapados", () => {
  const src = source(CARNE);

  it("importa escapeHtml", () => {
    expect(src).toMatch(/import\s*\{\s*escapeHtml\s*\}\s*from\s*["']@\/lib\/escape-html["']/);
  });

  it("nome do cliente sempre via escapeHtml (ambas as ocorrências)", () => {
    // não pode existir `${sale.customer?.name ...}` sem escapeHtml em volta
    const rawMatches = [...src.matchAll(/\$\{sale\.customer\?\.name[^}]*\}/g)];
    for (const m of rawMatches) {
      const idx = m.index ?? 0;
      const around = src.slice(Math.max(0, idx - 12), idx);
      expect(around, `nome cru no carnê: ${m[0]}`).toContain("escapeHtml(");
    }
    // e confirma que há pelo menos uma aplicação correta
    expect(src).toMatch(/escapeHtml\(sale\.customer\?\.name/);
  });

  it("branch.name e cpf/phone do cliente escapados", () => {
    expect(src).toMatch(/escapeHtml\(sale\.branch\.name\)/);
    expect(src).toMatch(/escapeHtml\(sale\.customer\.cpf\)/);
  });
});
