import { prisma as defaultPrisma } from "@/lib/prisma";

export interface ReceivableItem {
  id: string;
  companyName: string;
  total: number;
  dueDate: Date | null;
}

export interface ReceivableSummary {
  items: ReceivableItem[];
  total: number;
}

export async function getReceivableThisWeek(
  now: Date,
  prismaClient = defaultPrisma,
  // Filtro Prisma extra (segmentação por produto do SuperAdmin, via
  // subscription.company). Já vem no formato { AND: [...] } de buildDashboardFilters
  // — composto por AND com as condições de status/data para não colidir com o
  // ramo `subscription` deste where. Default {} = sem segmentação (compat).
  productWhere: Record<string, unknown> = {}
): Promise<ReceivableSummary> {
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const rows = await prismaClient.invoice.findMany({
    where: {
      AND: [
        productWhere,
        {
          status: "PENDING",
          subscription: { status: "ACTIVE" },
          dueDate: { gte: now, lte: in7d },
        },
      ],
    },
    include: {
      subscription: {
        include: { company: { select: { name: true } } },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const items = rows.map((r) => ({
    id: r.id,
    companyName: r.subscription.company?.name ?? "—",
    total: r.total,
    dueDate: r.dueDate,
  }));

  return { items, total: items.reduce((s: number, i: ReceivableItem) => s + i.total, 0) };
}
