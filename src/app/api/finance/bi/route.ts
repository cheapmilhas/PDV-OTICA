import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { validateBranchOwnership } from "@/lib/validate-branch";

type Dimension = "brand" | "category" | "seller" | "paymentMethod" | "productType";

interface ProductAgg {
  productId: string;
  revenue: number;
  cost: number;
  qty: number;
  count: number;
}

/**
 * H13: agrega itens de venda por produto com o CUSTO CORRETO.
 *
 * O groupBy do Prisma só faz _sum.costPrice (soma dos custos unitários de cada
 * linha) e _sum.qty separadamente. Multiplicar SUM(costPrice)*SUM(qty) inflava
 * o custo por ~N (nº de linhas do produto) → margem negativa falsa. O custo
 * real é Σ(costPrice_linha × qty_linha), que só dá pra calcular no banco com
 * uma expressão — groupBy não suporta. Usamos $queryRaw com filtro parametrizado.
 */
async function aggregateItemsByProduct(params: {
  companyId: string;
  startDate: string;
  endDate: string;
  branchId: string | null;
}): Promise<ProductAgg[]> {
  const { companyId, startDate, endDate, branchId } = params;
  const branchFilter = branchId
    ? Prisma.sql`AND s."branchId" = ${branchId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{ productId: string; revenue: number; cost: number; qty: number; count: bigint }>
  >`
    SELECT
      si."productId"                         AS "productId",
      COALESCE(SUM(si."lineTotal"), 0)       AS "revenue",
      COALESCE(SUM(si."costPrice" * si."qty"), 0) AS "cost",
      COALESCE(SUM(si."qty"), 0)             AS "qty",
      COUNT(*)                               AS "count"
    FROM "SaleItem" si
    JOIN "Sale" s ON s."id" = si."saleId"
    WHERE s."companyId" = ${companyId}
      AND s."status" = 'COMPLETED'
      AND s."completedAt" >= ${new Date(startDate)}
      AND s."completedAt" <= ${new Date(endDate)}
      AND si."productId" IS NOT NULL
      ${branchFilter}
    GROUP BY si."productId"
  `;

  return rows.map((r) => ({
    productId: r.productId,
    revenue: Number(r.revenue),
    cost: Number(r.cost),
    qty: Number(r.qty),
    count: Number(r.count),
  }));
}

export const GET = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = (req as NextRequest).nextUrl.searchParams;

    const dimension = (searchParams.get("dimension") || "brand") as Dimension;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const branchId = searchParams.get("branchId");

    // SEC-004: valida posse da filial filtrada (403 explícito em vez de vazio).
    if (branchId && branchId !== "ALL") {
      await validateBranchOwnership(branchId, companyId);
    }

    if (!startDate || !endDate) {
      return handleApiError(new Error("startDate e endDate são obrigatórios"));
    }

    const saleWhere: any = {
      companyId,
      status: "COMPLETED",
      completedAt: { gte: new Date(startDate), lte: new Date(endDate) },
      ...(branchId ? { branchId } : {}),
    };

    let data: any[] = [];

    if (dimension === "brand") {
      const results = await aggregateItemsByProduct({ companyId, startDate, endDate, branchId });

      const productIds = results.map((r) => r.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, brandId: true, brand: { select: { name: true } } },
      });

      const byBrand = new Map<string, { name: string; revenue: number; cost: number; qty: number; count: number }>();

      for (const r of results) {
        const product = products.find((p) => p.id === r.productId);
        const brandName = product?.brand?.name || "Sem marca";
        const current = byBrand.get(brandName) || { name: brandName, revenue: 0, cost: 0, qty: 0, count: 0 };
        current.revenue += r.revenue;
        current.cost += r.cost; // H13: custo já é Σ(costPrice*qty) por produto
        current.qty += r.qty;
        current.count += r.count;
        byBrand.set(brandName, current);
      }

      data = [...byBrand.values()]
        .map((d) => ({ ...d, margin: d.revenue - d.cost }))
        .sort((a, b) => b.revenue - a.revenue);
    } else if (dimension === "category") {
      const results = await aggregateItemsByProduct({ companyId, startDate, endDate, branchId });

      const productIds = results.map((r) => r.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, categoryId: true, category: { select: { name: true } } },
      });

      const byCategory = new Map<string, { name: string; revenue: number; cost: number; qty: number; count: number }>();

      for (const r of results) {
        const product = products.find((p) => p.id === r.productId);
        const categoryName = product?.category?.name || "Sem categoria";
        const current = byCategory.get(categoryName) || { name: categoryName, revenue: 0, cost: 0, qty: 0, count: 0 };
        current.revenue += r.revenue;
        current.cost += r.cost; // H13: custo já é Σ(costPrice*qty) por produto
        current.qty += r.qty;
        current.count += r.count;
        byCategory.set(categoryName, current);
      }

      data = [...byCategory.values()]
        .map((d) => ({ ...d, margin: d.revenue - d.cost }))
        .sort((a, b) => b.revenue - a.revenue);
    } else if (dimension === "seller") {
      const results = await prisma.sale.groupBy({
        by: ["sellerUserId"],
        where: saleWhere,
        _sum: { total: true, discountTotal: true },
        _count: true,
      });

      const sellerIds = results.map((r) => r.sellerUserId);
      const sellers = await prisma.user.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, name: true },
      });

      data = results
        .map((r) => ({
          name: sellers.find((s) => s.id === r.sellerUserId)?.name || "Desconhecido",
          userId: r.sellerUserId,
          revenue: Number(r._sum.total || 0),
          discounts: Number(r._sum.discountTotal || 0),
          salesCount: r._count,
          avgTicket: r._count > 0 ? Number(r._sum.total || 0) / r._count : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
    } else if (dimension === "paymentMethod") {
      const results = await prisma.salePayment.groupBy({
        by: ["method"],
        where: {
          sale: saleWhere,
          status: "RECEIVED",
        },
        _sum: { amount: true, feeAmount: true },
        _count: true,
      });

      data = results
        .map((r) => ({
          method: r.method,
          totalAmount: Number(r._sum.amount || 0),
          totalFees: Number(r._sum.feeAmount || 0),
          count: r._count,
          netAmount: Number(r._sum.amount || 0) - Number(r._sum.feeAmount || 0),
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (dimension === "productType") {
      const results = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: saleWhere, productId: { not: null } },
        _sum: { lineTotal: true, qty: true },
        _count: true,
      });

      const productIds = results.map((r) => r.productId!).filter(Boolean);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, type: true },
      });

      const byType = new Map<string, { name: string; revenue: number; qty: number; count: number }>();

      for (const r of results) {
        const product = products.find((p) => p.id === r.productId);
        const typeName = product?.type || "OTHER";
        const current = byType.get(typeName) || { name: typeName, revenue: 0, qty: 0, count: 0 };
        current.revenue += Number(r._sum.lineTotal || 0);
        current.qty += r._sum.qty || 0;
        current.count += r._count;
        byType.set(typeName, current);
      }

      data = [...byType.values()].sort((a, b) => b.revenue - a.revenue);
    }

    return successResponse({ dimension, data });
  } catch (error) {
    return handleApiError(error);
  }
});
