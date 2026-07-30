import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

/** Fallback usado quando não há plano ativo OU o banco está indisponível. */
const FALLBACK_PRICE_REAIS = 149.9;

/**
 * Menor priceMonthly (em reais) entre planos ÓTICOS ACTIVE com preço > 0.
 * Cacheado, tag public-plans.
 *
 * Este helper é chamado no RootLayout (toda página) para o JSON-LD. Por isso é
 * BLINDADO: qualquer falha de banco (coluna ausente durante deploy, indisponibilidade,
 * etc.) cai no fallback em vez de derrubar a renderização da página inteira.
 *
 * `platformProduct: VIS_APP` é OBRIGATÓRIO: o site de marketing vende ótica. Sem o
 * filtro, o plano mais barato do banco é do Vis Medical (R$ 89,90 contra R$ 149,90 do
 * Básico ótico) e TODA página passaria ao Google o preço de um plano de clínica como
 * preço de entrada do produto ótico. Os preços do Medical têm superfície própria
 * (/medical, via /api/public/plans?product=medical).
 */
export const getLowestActivePriceReais = unstable_cache(
  async (): Promise<number> => {
    try {
      const p = await prisma.plan.findFirst({
        where: {
          isActive: true,
          status: "ACTIVE",
          priceMonthly: { gt: 0 },
          platformProduct: "VIS_APP",
        },
        orderBy: { priceMonthly: "asc" },
        select: { priceMonthly: true },
      });
      return p ? p.priceMonthly / 100 : FALLBACK_PRICE_REAIS;
    } catch {
      return FALLBACK_PRICE_REAIS;
    }
  },
  ["lowest-active-price"],
  { tags: ["public-plans"], revalidate: 60 }
);
