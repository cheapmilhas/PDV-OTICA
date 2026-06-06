import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

/** Fallback usado quando não há plano ativo OU o banco está indisponível. */
const FALLBACK_PRICE_REAIS = 149.9;

/**
 * Menor priceMonthly (em reais) entre planos ACTIVE com preço > 0. Cacheado, tag public-plans.
 *
 * Este helper é chamado no RootLayout (toda página) para o JSON-LD. Por isso é
 * BLINDADO: qualquer falha de banco (coluna ausente durante deploy, indisponibilidade,
 * etc.) cai no fallback em vez de derrubar a renderização da página inteira.
 */
export const getLowestActivePriceReais = unstable_cache(
  async (): Promise<number> => {
    try {
      const p = await prisma.plan.findFirst({
        where: { isActive: true, status: "ACTIVE", priceMonthly: { gt: 0 } },
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
