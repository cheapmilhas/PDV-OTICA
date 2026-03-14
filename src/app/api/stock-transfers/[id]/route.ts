import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { auth } from "@/auth";

/**
 * POST /api/stock-transfers/[id]
 * Ações: approve, cancel
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Não autenticado");
    const companyId = await getCompanyId();
    const userId = session.user.id;

    const { id: transferId } = await params;
    const body = await request.json();
    const { action } = body;

    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: transferId, companyId },
      include: { items: true },
    });

    if (!transfer) {
      return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });
    }

    switch (action) {
      case "approve": {
        if (transfer.status !== "PENDING") {
          return NextResponse.json({ error: "Apenas transferências pendentes podem ser aprovadas" }, { status: 400 });
        }

        // Verificar permissão (só admin)
        if (session.user.role !== "ADMIN") {
          return NextResponse.json({ error: "Apenas administradores podem aprovar transferências" }, { status: 403 });
        }

        // Verificar estoque na origem
        for (const item of transfer.items) {
          const branchStock = await prisma.branchStock.findUnique({
            where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
          });
          if (!branchStock || branchStock.quantity < item.quantity) {
            const product = await prisma.product.findUnique({
              where: { id: item.productId },
              select: { name: true },
            });
            return NextResponse.json({
              error: `Estoque insuficiente de "${product?.name}" na origem. Disponível: ${branchStock?.quantity ?? 0}`,
            }, { status: 400 });
          }
        }

        // Executar em transação
        await prisma.$transaction(async (tx) => {
          await tx.stockTransfer.update({
            where: { id: transferId },
            data: {
              status: "COMPLETED",
              approvedById: userId,
              approvedAt: new Date(),
              completedAt: new Date(),
            },
          });

          for (const item of transfer.items) {
            // Debitar origem
            await tx.branchStock.update({
              where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
              data: { quantity: { decrement: item.quantity } },
            });

            // Creditar destino
            await tx.branchStock.upsert({
              where: { branchId_productId: { branchId: transfer.toBranchId, productId: item.productId } },
              create: { branchId: transfer.toBranchId, productId: item.productId, quantity: item.quantity },
              update: { quantity: { increment: item.quantity } },
            });

            // Movimentações de estoque
            await tx.stockMovement.create({
              data: {
                companyId,
                branchId: transfer.fromBranchId,
                productId: item.productId,
                type: "TRANSFER_OUT",
                quantity: -item.quantity,
                targetBranchId: transfer.toBranchId,
                notes: `Transferência #${transferId.slice(-6)} aprovada`,
                createdByUserId: userId,
              },
            });
            await tx.stockMovement.create({
              data: {
                companyId,
                branchId: transfer.toBranchId,
                productId: item.productId,
                type: "TRANSFER_IN",
                quantity: item.quantity,
                sourceBranchId: transfer.fromBranchId,
                notes: `Transferência #${transferId.slice(-6)} aprovada`,
                createdByUserId: userId,
              },
            });
          }
        });

        return NextResponse.json({ success: true, message: "Transferência aprovada e executada" });
      }

      case "cancel": {
        if (transfer.status !== "PENDING") {
          return NextResponse.json({ error: "Apenas transferências pendentes podem ser canceladas" }, { status: 400 });
        }

        await prisma.stockTransfer.update({
          where: { id: transferId },
          data: { status: "CANCELLED" },
        });

        return NextResponse.json({ success: true, message: "Transferência cancelada" });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
