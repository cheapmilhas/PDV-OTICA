import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { resolveReportBranchFilter } from "@/lib/resolve-report-branch";
import { startOfLocalMonth } from "@/lib/date-utils";
import { handleApiError } from "@/lib/error-handler";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";

const log = logger.child({ route: "reports/top-products" });

export async function GET(request: Request) {
  try {
    // SEC-003: relatório exige permissão.
    await requirePermission(Permission.REPORTS_SALES);
    const session = await auth();
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    // M3: respeita seletor de filial. M2: mês no fuso local.
    const branchFilter = await resolveReportBranchFilter(searchParams);
    const startOfMonth = startOfLocalMonth(new Date());

    // Buscar produtos mais vendidos
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          companyId: session.user.companyId,
          createdAt: { gte: startOfMonth },
          status: "COMPLETED",
          ...branchFilter,
        }
      },
      _sum: {
        qty: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          lineTotal: 'desc',
        }
      },
      take: limit,
    });

    // Buscar informações dos produtos
    const productIds = topProducts
      .map(item => item.productId)
      .filter((id): id is string => id !== null);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });

    const data = topProducts.map((item, index) => {
      const product = products.find(p => p.id === item.productId);
      return {
        rank: index + 1,
        name: product?.name || 'Produto não encontrado',
        sku: product?.sku || '',
        unidadesVendidas: Number(item._sum.qty || 0),
        valorTotal: Number(item._sum.lineTotal || 0),
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    log.error("Erro ao buscar top produtos", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
