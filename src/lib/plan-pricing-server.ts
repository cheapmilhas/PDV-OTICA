import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

/** Menor priceMonthly (em reais) entre planos ACTIVE com preço > 0. Cacheado, tag public-plans. */
export const getLowestActivePriceReais = unstable_cache(
  async (): Promise<number> => {
    const p = await prisma.plan.findFirst({
      where: { isActive: true, status: "ACTIVE", priceMonthly: { gt: 0 } },
      orderBy: { priceMonthly: "asc" },
      select: { priceMonthly: true },
    });
    return p ? p.priceMonthly / 100 : 149.9;
  },
  ["lowest-active-price"],
  { tags: ["public-plans"], revalidate: 60 }
);
