import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date();

    // 1. Top Laboratórios (por quantidade de OS)
    const serviceOrders = await prisma.serviceOrder.findMany({
      where: {
        companyId,
        branchId,
        createdAt: { gte: startDate, lte: endDate },
        laboratoryId: { not: null },
        status: { notIn: ["CANCELED"] },
      },
      select: {
        laboratoryId: true,
        laboratory: { select: { id: true, name: true } },
        status: true,
        createdAt: true,
        readyAt: true,
        sentToLabAt: true,
      },
    });

    // Agrupar por lab
    const labMap = new Map<string, {
      name: string;
      count: number;
      delivered: number;
      totalLeadDays: number;
      leadCount: number;
    }>();

    for (const so of serviceOrders) {
      if (!so.laboratoryId || !so.laboratory) continue;
      const existing = labMap.get(so.laboratoryId) || {
        name: so.laboratory.name,
        count: 0,
        delivered: 0,
        totalLeadDays: 0,
        leadCount: 0,
      };
      existing.count++;
      if (so.status === "DELIVERED" || so.status === "READY") {
        existing.delivered++;
      }
      if (so.sentToLabAt && so.readyAt) {
        const days = Math.ceil(
          (so.readyAt.getTime() - so.sentToLabAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        existing.totalLeadDays += days;
        existing.leadCount++;
      }
      labMap.set(so.laboratoryId, existing);
    }

    const topLabs = Array.from(labMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        orderCount: data.count,
        deliveredCount: data.delivered,
        avgLeadDays: data.leadCount > 0
          ? Math.round(data.totalLeadDays / data.leadCount)
          : null,
      }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);

    // 2. Receita por segmento de produto
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          companyId,
          branchId,
          status: "COMPLETED",
          completedAt: { gte: startDate, lte: endDate },
        },
      },
      select: {
        lineTotal: true,
        costPrice: true,
        qty: true,
        product: {
          select: { type: true },
        },
      },
    });

    const segmentMap = new Map<string, {
      revenue: number;
      cost: number;
      qty: number;
      count: number;
    }>();

    for (const item of saleItems) {
      const type = item.product?.type || "OTHER";
      const existing = segmentMap.get(type) || { revenue: 0, cost: 0, qty: 0, count: 0 };
      existing.revenue += Number(item.lineTotal);
      existing.cost += Number(item.costPrice) * item.qty;
      existing.qty += item.qty;
      existing.count++;
      segmentMap.set(type, existing);
    }

    const segmentLabels: Record<string, string> = {
      FRAME: "Armações",
      LENS_SERVICE: "Serviço de Lentes",
      OPHTHALMIC_LENS: "Lentes Oftálmicas",
      CONTACT_LENS: "Lentes de Contato",
      SUNGLASSES: "Óculos de Sol",
      ACCESSORY: "Acessórios",
      OPTICAL_ACCESSORY: "Acessórios Ópticos",
      LENS_SOLUTION: "Soluções p/ Lentes",
      CASE: "Estojos",
      CLEANING_KIT: "Kits de Limpeza",
      SERVICE: "Serviços",
      OTHER: "Outros",
    };

    const segments = Array.from(segmentMap.entries())
      .map(([type, data]) => ({
        type,
        label: segmentLabels[type] || type,
        revenue: data.revenue,
        cost: data.cost,
        margin: data.revenue > 0
          ? ((data.revenue - data.cost) / data.revenue) * 100
          : 0,
        qty: data.qty,
        count: data.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 3. Totais de OS no período
    const totalOS = await prisma.serviceOrder.count({
      where: {
        companyId,
        branchId,
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ["CANCELED"] },
      },
    });

    const totalRevenue = segments.reduce((sum, s) => sum + s.revenue, 0);
    const lensRevenue = segments
      .filter((s) => ["LENS_SERVICE", "OPHTHALMIC_LENS", "CONTACT_LENS"].includes(s.type))
      .reduce((sum, s) => sum + s.revenue, 0);

    return NextResponse.json({
      success: true,
      data: {
        topLabs,
        segments,
        summary: {
          totalOS,
          totalRevenue,
          lensRevenue,
          lensPercentage: totalRevenue > 0
            ? (lensRevenue / totalRevenue) * 100
            : 0,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
