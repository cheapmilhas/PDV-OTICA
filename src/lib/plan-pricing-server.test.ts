import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O JSON-LD do site é ÓTICO. Estes testes travam o filtro por produto.
 *
 * Bug que originou o teste (2026-07-29): `getLowestActivePriceReais` é chamado no
 * RootLayout — ou seja, em TODA página — e buscava o menor plano ativo SEM filtrar
 * `platformProduct`. Como o plano mais barato do banco de produção é do Vis Medical
 * (Profissional, R$ 89,90) e o mais barato da ótica é o Básico (R$ 149,90), o site
 * inteiro anunciava ao Google o preço de um plano de CLÍNICA como preço de entrada
 * do produto ótico.
 */

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findFirst: (...a: unknown[]) => findFirst(...a) },
  },
}));

// unstable_cache do Next envolve a função; no teste queremos executá-la direto.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

describe("getLowestActivePriceReais", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filtra por platformProduct VIS_APP (não deixa plano Medical vazar no preço do site)", async () => {
    findFirst.mockResolvedValue({ priceMonthly: 14990 });

    const { getLowestActivePriceReais } = await import("./plan-pricing-server");
    await getLowestActivePriceReais();

    expect(findFirst).toHaveBeenCalledTimes(1);
    const where = findFirst.mock.calls[0][0].where;
    expect(where.platformProduct).toBe("VIS_APP");
  });

  it("mantém os filtros de plano vendável (ativo, ACTIVE, preço > 0)", async () => {
    findFirst.mockResolvedValue({ priceMonthly: 14990 });

    const { getLowestActivePriceReais } = await import("./plan-pricing-server");
    await getLowestActivePriceReais();

    const where = findFirst.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.status).toBe("ACTIVE");
    expect(where.priceMonthly).toEqual({ gt: 0 });
  });

  // Valor PROPOSITALMENTE diferente de FALLBACK_PRICE_REAIS (149.9): com 14990 aqui,
  // uma implementação quebrada que sempre devolvesse o fallback passaria no teste.
  it("converte centavos em reais (valor distinto do fallback)", async () => {
    findFirst.mockResolvedValue({ priceMonthly: 19990 });

    const { getLowestActivePriceReais } = await import("./plan-pricing-server");
    expect(await getLowestActivePriceReais()).toBe(199.9);
  });

  it("cai no fallback quando não há plano ótico vendável", async () => {
    findFirst.mockResolvedValue(null);

    const { getLowestActivePriceReais } = await import("./plan-pricing-server");
    expect(await getLowestActivePriceReais()).toBe(149.9);
  });

  it("cai no fallback quando o banco falha (blindagem: não derruba a página)", async () => {
    findFirst.mockRejectedValue(new Error("db indisponível"));

    const { getLowestActivePriceReais } = await import("./plan-pricing-server");
    expect(await getLowestActivePriceReais()).toBe(149.9);
  });
});
