import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GET /api/admin/export/faturas devolve a carteira inteira em CSV (cliente,
 * CNPJ, valor, status). É o equivalente em massa da tela de faturas, então
 * responde à MESMA política de papel — `FINANCE_ROLES`.
 *
 * Rota de API não herda o gate da página: barrar a tela sem barrar o export
 * só trocaria o clique pelo curl.
 */

const getAdminSession = vi.fn();
const getAccessibleCompanyIds = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  getAccessibleCompanyIds: (...a: unknown[]) => getAccessibleCompanyIds(...a),
}));

const invoiceFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) } },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

// Sem rate limit nos testes (retorna null = "não limitado").
vi.mock("@/lib/rate-limit", () => ({ adminRateLimit: () => null }));

vi.mock("@/lib/admin-product-context", () => ({
  getProductContext: async () => "OPTICAL",
  productWhereFilter: () => ({}),
  notDeletedFilter: () => ({}),
}));

import { GET } from "./route";

const req = () => new Request("https://x.test/api/admin/export/faturas");

beforeEach(() => {
  getAdminSession.mockReset();
  getAccessibleCompanyIds.mockReset();
  invoiceFindMany.mockReset();
  invoiceFindMany.mockResolvedValue([]);
  getAccessibleCompanyIds.mockResolvedValue(null);
});

describe("GET /api/admin/export/faturas — gate de papel", () => {
  it("401 sem sessão de admin", async () => {
    getAdminSession.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it("403 para SUPPORT — e NENHUMA fatura é lida do banco", async () => {
    // scopeAllCompanies: true de propósito. O escopo tem @default(true) no
    // schema e portanto não barra ninguém sozinho; se o SUPPORT for barrado
    // aqui, foi o PAPEL que barrou — não o escopo. Sem isso o teste passaria
    // por vacuidade.
    getAdminSession.mockResolvedValue({
      id: "a1", role: "SUPPORT", scopeAllCompanies: true,
    });
    const res = await GET(req());
    expect(res.status).toBe(403);
    // O vazamento seria a QUERY, não o corpo da resposta: se a rota lesse as
    // faturas e só depois recusasse, o dado já teria saído do banco.
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it.each(["SUPER_ADMIN", "ADMIN", "BILLING"])("200 para %s", async (role) => {
    getAdminSession.mockResolvedValue({ id: "a1", role, scopeAllCompanies: true });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(invoiceFindMany).toHaveBeenCalled();
  });

  it("BILLING é aceito aqui — coerente com a tela de faturas", async () => {
    // Regressão explícita: antes de 2026-07-31 esta rota tinha um array
    // literal ["SUPER_ADMIN","ADMIN"] que divergia da política de leitura.
    getAdminSession.mockResolvedValue({ id: "a1", role: "BILLING", scopeAllCompanies: true });
    expect((await GET(req())).status).toBe(200);
  });
});
