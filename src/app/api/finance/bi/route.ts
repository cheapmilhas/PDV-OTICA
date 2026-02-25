import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

type Dimension = "brand" | "category" | "seller" | "paymentMethod" | "productType";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;

    const dimension = (searchParams.get("dimension") || "brand") as Dimension;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const branchId = searchParams.get("branchId");

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
      const results = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: saleWhere, productId: { not: null } },
        _sum: { lineTotal: true, costPrice: true, qty: true },
        _count: true,
      });

      const productIds = results.map((r) => r.productId!).filter(Boolean);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, brandId: true, brand: { select: { name: true } } },
      });

      const byBrand = new Map<string, { name: string; revenue: number; cost: number; qty: number; count: number }>();

      for (const r of results) {
        const product = products.find((p) => p.id === r.productId);
        const brandName = product?.brand?.name || "Sem marca";
        const current = byBrand.get(brandName) || { name: brandName, revenue: 0, cost: 0, qty: 0, count: 0 };
        current.revenue += Number(r._sum.lineTotal || 0);
        current.cost += Number(r._sum.costPrice || 0) * (r._sum.qty || 0);
        current.qty += r._sum.qty || 0;
        current.count += r._count;
        byBrand.set(brandName, current);
      }

      data = [...byBrand.values()]
        .map((d) => ({ ...d, margin: d.revenue - d.cost }))
        .sort((a, b) => b.revenue - a.revenue);
    } else if (dimension === "category") {
      const results = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: saleWhere, productId: { not: null } },
        _sum: { lineTotal: true, costPrice: true, qty: true },
        _count: true,
      });

      const productIds = results.map((r) => r.productId!).filter(Boolean);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, categoryId: true, category: { select: { name: true } } },
      });

      const byCategory = new Map<string, { name: string; revenue: number; cost: number; qty: number; count: number }>();

      for (const r of results) {
        const product = products.find((p) => p.id === r.productId);
        const categoryName = product?.category?.name || "Sem categoria";
        const current = byCategory.get(categoryName) || { name: categoryName, revenue: 0, cost: 0, qty: 0, count: 0 };
        current.revenue += Number(r._sum.lineTotal || 0);
        current.cost += Number(r._sum.costPrice || 0) * (r._sum.qty || 0);
        current.qty += r._sum.qty || 0;
        current.count += r._count;
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
}
