import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Testes de código-fonte (não runtime): as telas do super admin são Server
 * Components que fazem a query direto no Prisma, sem camada injetável. O que
 * precisa ser travado aqui é estrutural — "o filtro está aplicado nesta query"
 * — e regride por omissão (alguém adiciona uma query e esquece o filtro).
 */

const root = join(process.cwd(), "src/app/admin/(painel)/clientes");
const listPage = readFileSync(join(root, "page.tsx"), "utf8");
const detailPage = readFileSync(join(root, "[id]/page.tsx"), "utf8");
const apiRoute = readFileSync(
  join(process.cwd(), "src/app/api/admin/clientes/route.ts"),
  "utf8",
);

describe("lista de clientes — filtro por produto", () => {
  it("a página lê o produto do cookie e aplica o filtro", () => {
    expect(listPage).toContain("getProductContext()");
    expect(listPage).toContain("productWhereFilter(product)");
  });

  it("esconde soft-deleted SEM sumir com blockedReason=null (senão lista vazia)", () => {
    // Regressão crítica: { not: "DELETED" } sozinho remove as empresas com
    // blockedReason=null (NULL != 'DELETED' é NULL em SQL) → lista vazia em
    // produção. O OR com { blockedReason: null } preserva-as.
    for (const src of [listPage, apiRoute]) {
      expect(src).toContain('blockedReason: null');
      expect(src).toContain('blockedReason: { not: "DELETED" }');
    }
  });

  it("findMany e count compartilham o MESMO where (senão o subtítulo mente)", () => {
    // Um único objeto `where` declarado e reusado nas duas queries.
    expect(listPage).toMatch(/const where = \{/);
    expect(listPage).toMatch(/prisma\.company\.findMany\(\{\s*where,/);
    expect(listPage).toMatch(/prisma\.company\.count\(\{ where \}\)/);
  });

  it("groupBy de status filtra produto VIA RELAÇÃO (Subscription não tem o campo)", () => {
    // Regressão específica: productWhereFilter(product) puro em Subscription
    // seria um filtro em coluna inexistente.
    expect(listPage).toContain('productWhereFilter(product, { via: "company" })');
  });

  it("a API de listagem aplica o mesmo filtro de produto", () => {
    expect(apiRoute).toContain("getProductContext()");
    expect(apiRoute).toContain("productWhereFilter(product)");
  });
});

describe("detalhe do cliente — escopo do admin", () => {
  it("valida escopo da empresa antes de carregar (URL é adivinhável)", () => {
    expect(detailPage).toContain("requireSupportScope(admin.id, id)");
  });

  it("responde notFound() fora de escopo, sem confirmar existência do id", () => {
    expect(detailPage).toMatch(/if \(!scoped\) notFound\(\);/);
  });

  it("a checagem de escopo vem ANTES da query da empresa", () => {
    // Ancora na CHAMADA, não no identificador: `indexOf("requireSupportScope")`
    // casaria com o import da linha 1 e passaria mesmo com a checagem depois
    // da query.
    const scopeAt = detailPage.indexOf("await requireSupportScope(admin.id, id)");
    const queryAt = detailPage.indexOf("prisma.company.findUnique");
    expect(scopeAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(scopeAt);
  });
});
