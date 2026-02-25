import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { paginatedResponse, createdResponse, createPaginationMeta, getPaginationParams } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const searchParams = req.nextUrl.searchParams;

    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const productId = searchParams.get("productId");
    const branchId = searchParams.get("branchId");
    const onlyAvailable = searchParams.get("onlyAvailable") === "true";

    const { skip, take } = getPaginationParams(page, pageSize);

    const where: any = {
      companyId,
      ...(productId ? { productId } : {}),
      ...(branchId ? { branchId } : {}),
      ...(onlyAvailable ? { qtyRemaining: { gt: 0 } } : {}),
    };

    const [lots, total] = await Promise.all([
      prisma.inventoryLot.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, type: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { acquiredAt: "desc" },
        skip,
        take,
      }),
      prisma.inventoryLot.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    return paginatedResponse(
      JSON.parse(JSON.stringify(lots)),
      pagination
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const body = await req.json();

    const { productId, supplierId, qtyIn, unitCost, branchId, invoiceNumber } = body;

    if (!productId || !qtyIn || !unitCost) {
      return handleApiError(new Error("productId, qtyIn e unitCost são obrigatórios"));
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Criar lote
      const lot = await tx.inventoryLot.create({
        data: {
          companyId,
          branchId: branchId || undefined,
          productId,
          supplierId: supplierId || undefined,
          qtyIn,
          qtyRemaining: qtyIn,
          unitCost,
          totalCost: qtyIn * unitCost,
          invoiceNumber: invoiceNumber || undefined,
        },
      });

      // 2. Atualizar estoque do produto
      await tx.product.update({
        where: { id: productId },
        data: {
          stockQty: { increment: qtyIn },
          costPrice: unitCost, // Atualizar custo médio simples
        },
      });

      // 3. Criar StockMovement
      await tx.stockMovement.create({
        data: {
          companyId,
          productId,
          type: "PURCHASE",
          quantity: qtyIn,
          reason: invoiceNumber ? `NF ${invoiceNumber}` : "Entrada de lote",
          createdByUserId: userId,
          branchId: branchId || undefined,
          invoiceNumber: invoiceNumber || undefined,
        },
      });

      return lot;
    });

    return createdResponse(JSON.parse(JSON.stringify(result)));
  } catch (error) {
    return handleApiError(error);
  }
}
