import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { requirePlanFeature } from "@/lib/plan-features";
import * as crmService from "@/services/crm.service";
import { prisma } from "@/lib/prisma";
import { CustomerSegment } from "@prisma/client";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ segment: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "crm");
    const { segment } = await context.params;
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "customerId é obrigatório" } },
        { status: 400 }
      );
    }

    // Buscar template
    const template = await prisma.messageTemplate.findUnique({
      where: {
        companyId_segment: {
          companyId,
          segment: segment as CustomerSegment,
        },
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Template não encontrado" } },
        { status: 404 }
      );
    }

    // Buscar dados do cliente e última compra
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        sales: {
          where: { status: { not: "CANCELED" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            items: {
              include: {
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Cliente não encontrado" } },
        { status: 404 }
      );
    }

    const lastSale = customer.sales[0];
    const lastSaleDate = lastSale?.createdAt;
    const daysSinceLastPurchase = lastSaleDate
      ? Math.floor((new Date().getTime() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Processar template
    const message = crmService.processTemplate(
      template.message,
      {
        name: customer.name,
        birthDate: customer.birthDate,
      },
      {
        lastPurchaseDate: lastSaleDate,
        daysSinceLastPurchase,
        cashbackBalance: 0, // TODO: buscar cashback real
        lastPurchaseProduct: lastSale?.items[0]?.product?.name,
        lastPurchaseAmount: lastSale?.total ? Number(lastSale.total) : null,
      }
    );

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
