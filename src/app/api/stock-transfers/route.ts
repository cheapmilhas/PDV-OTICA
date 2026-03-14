import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { auth } from "@/auth";

/**
 * GET /api/stock-transfers
 * Lista transferências de estoque da empresa
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const branchId = searchParams.get("branchId");

    const where: any = { companyId };
    if (status && status !== "ALL") {
      where.status = status;
    }
    // Filtrar por branch (origem ou destino)
    if (branchId && branchId !== "ALL") {
      where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }];
    }

    const transfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: transfers });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/stock-transfers
 * Cria nova transferência de estoque
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Não autenticado");
    const companyId = await getCompanyId();
    const userId = session.user.id;
    const userRole = session.user.role;

    const body = await request.json();
    const { fromBranchId, toBranchId, items, notes } = body;

    // Validações
    if (!fromBranchId || !toBranchId) {
      return NextResponse.json({ error: "Filiais de origem e destino são obrigatórias" }, { status: 400 });
    }
    if (fromBranchId === toBranchId) {
      return NextResponse.json({ error: "Origem e destino devem ser diferentes" }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Adicione ao menos um produto" }, { status: 400 });
    }

    // Verificar que ambas pertencem à mesma empresa
    const branches = await prisma.branch.findMany({
      where: { id: { in: [fromBranchId, toBranchId] }, companyId, active: true },
    });
    if (branches.length !== 2) {
      return NextResponse.json({ error: "Filiais não encontradas ou não pertencem a esta empresa" }, { status: 400 });
    }

    // Verificar estoque suficiente na origem
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return NextResponse.json({ error: "Produto e quantidade são obrigatórios" }, { status: 400 });
      }

      const branchStock = await prisma.branchStock.findUnique({
        where: { branchId_productId: { branchId: fromBranchId, productId: item.productId } },
      });

      if (!branchStock || branchStock.quantity < item.quantity) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true },
        });
        return NextResponse.json({
          error: `Estoque insuficiente de "${product?.name || item.productId}" na origem. Disponível: ${branchStock?.quantity ?? 0}`,
        }, { status: 400 });
      }
    }

    // Admin auto-aprova; gerente fica pendente
    const autoApprove = userRole === "ADMIN";

    const result = await prisma.$transaction(async (tx) => {
      // Criar transferência
      const transfer = await tx.stockTransfer.create({
        data: {
          companyId,
          fromBranchId,
          toBranchId,
          requestedById: userId,
          status: autoApprove ? "COMPLETED" : "PENDING",
          notes: notes || null,
          ...(autoApprove && {
            approvedById: userId,
            approvedAt: new Date(),
            completedAt: new Date(),
          }),
          items: {
            create: items.map((item: { productId: string; quantity: number }) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { name: true } } } },
        },
      });

      // Se auto-aprovada, executar débito/crédito
      if (autoApprove) {
        for (const item of transfer.items) {
          // Debitar origem
          await tx.branchStock.update({
            where: { branchId_productId: { branchId: fromBranchId, productId: item.productId } },
            data: { quantity: { decrement: item.quantity } },
          });

          // Creditar destino
          await tx.branchStock.upsert({
            where: { branchId_productId: { branchId: toBranchId, productId: item.productId } },
            create: { branchId: toBranchId, productId: item.productId, quantity: item.quantity },
            update: { quantity: { increment: item.quantity } },
          });

          // Registrar movimentações
          await tx.stockMovement.create({
            data: {
              companyId,
              branchId: fromBranchId,
              productId: item.productId,
              type: "TRANSFER_OUT",
              quantity: -item.quantity,
              targetBranchId: toBranchId,
              notes: `Transferência #${transfer.id.slice(-6)}`,
              createdByUserId: userId,
            },
          });
          await tx.stockMovement.create({
            data: {
              companyId,
              branchId: toBranchId,
              productId: item.productId,
              type: "TRANSFER_IN",
              quantity: item.quantity,
              sourceBranchId: fromBranchId,
              notes: `Transferência #${transfer.id.slice(-6)}`,
              createdByUserId: userId,
            },
          });
        }
      }

      return transfer;
    });

    return NextResponse.json(
      { success: true, data: result },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
