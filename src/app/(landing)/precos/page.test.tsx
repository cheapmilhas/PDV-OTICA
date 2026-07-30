import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Trava o filtro de produto no JSON-LD da /precos.
 *
 * Esta página vende ÓTICA. Sem `platformProduct: VIS_APP`, os planos do Vis Medical
 * entram no structured data e o Google passa a associar à /precos um preço de clínica
 * (R$ 89,90) menor que o Básico ótico (R$ 149,90).
 *
 * Complementa plan-pricing-server.test.ts: são dois filtros independentes, em arquivos
 * diferentes, que podem regredir separadamente.
 */

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plan: { findMany: (...a: unknown[]) => findMany(...a) },
  },
}));

// Seções da página não interessam a este teste — só o JSON-LD.
vi.mock("@/components/home/pricing-section", () => ({ PricingSection: () => null }));
vi.mock("@/components/home/faq-section", () => ({ FaqSection: () => null }));
vi.mock("@/components/home/final-cta", () => ({ FinalCta: () => null }));

describe("/precos — JSON-LD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([{ name: "Básico", priceMonthly: 14990 }]);
  });

  it("filtra por platformProduct VIS_APP (não deixa plano Medical vazar)", async () => {
    const { default: PrecosPage } = await import("./page");
    await PrecosPage({ searchParams: Promise.resolve({}) });

    expect(findMany).toHaveBeenCalledTimes(1);
    const where = findMany.mock.calls[0][0].where;
    expect(where.platformProduct).toBe("VIS_APP");
  });

  it("mantém os filtros de plano vendável (ativo, ACTIVE, preço > 0)", async () => {
    const { default: PrecosPage } = await import("./page");
    await PrecosPage({ searchParams: Promise.resolve({}) });

    const where = findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.status).toBe("ACTIVE");
    expect(where.priceMonthly).toEqual({ gt: 0 });
  });

  it("não derruba a página quando o banco falha (blindagem)", async () => {
    findMany.mockRejectedValue(new Error("db indisponível"));

    const { default: PrecosPage } = await import("./page");
    await expect(PrecosPage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
  });

  // O JSON-LD descreve a IDENTIDADE da página (preços de ÓTICA, é o que o
  // canonical diz). Abrir na aba de clínicas por link direto não pode mudar o
  // structured data — senão o Google veria o preço do produto errado.
  it("mantém o JSON-LD ÓTICO mesmo abrindo na aba de clínicas", async () => {
    const { default: PrecosPage } = await import("./page");
    await PrecosPage({ searchParams: Promise.resolve({ produto: "clinica" }) });

    const where = findMany.mock.calls[0][0].where;
    expect(where.platformProduct).toBe("VIS_APP");
  });
});
