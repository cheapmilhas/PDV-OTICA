import { prisma } from "@/lib/prisma";
import { StockAdjustmentStatus, Prisma } from "@prisma/client";
import type { CreateStockAdjustmentDTO, StockAdjustmentQuery } from "@/lib/validations/stock-adjustment.schema";
import { SystemRuleService } from "./system-rule.service";

const systemRuleService = new SystemRuleService();

export class StockAdjustmentService {
  /**
   * Cria um novo ajuste de estoque
   */
  async create(
    data: CreateStockAdjustmentDTO,
    companyId: string,
    userId: string
  ) {
    // Busca produto para obter estoque e custo atuais
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        companyId,
      },
      select: {
        id: true,
        sku: true,
        name: true,
        stockQty: true,
        costPrice: true,
        stockControlled: true,
      },
    });

    if (!product) {
      throw new Error("Produto não encontrado");
    }

    if (!product.stockControlled) {
      throw new Error("Este produto não possui controle de estoque");
    }

    // Calcula valores
    const quantityBefore = product.stockQty;
    const quantityAfter = quantityBefore + data.quantityChange;
    const unitCost = product.costPrice;
    const totalValue = Math.abs(data.quantityChange) * Number(unitCost);

    // Verifica se estoque ficaria negativo
    const allowNegativeStock = await systemRuleService.get(
      "stock.allow_negative_stock",
      companyId
    );

    if (!allowNegativeStock && quantityAfter < 0) {
      throw new Error(
        `Ajuste resultaria em estoque negativo (${quantityAfter}). Estoque atual: ${quantityBefore}`
      );
    }

    // Verifica se precisa de aprovação
    const needsApproval = await this.needsApproval(totalValue, companyId);
    const status = needsApproval
      ? StockAdjustmentStatus.PENDING
      : StockAdjustmentStatus.AUTO_APPROVED;

    // Verifica se precisa de foto
    const requirePhotoAbove = await systemRuleService.get(
      "stock.adjustment.require_photo_above",
      companyId
    );

    if (
      requirePhotoAbove &&
      totalValue > requirePhotoAbove &&
      (!data.attachments || data.attachments.length === 0)
    ) {
      throw new Error(
        `Ajustes acima de R$ ${requirePhotoAbove} requerem foto anexada`
      );
    }

    // Cria o ajuste
    const adjustment = await prisma.stockAdjustment.create({
      data: {
        companyId,
        productId: product.id,
        type: data.type,
        status,
        quantityBefore,
        quantityChange: data.quantityChange,
        quantityAfter,
        unitCost,
        totalValue,
        reason: data.reason,
        attachments: data.attachments || [],
        createdByUserId: userId,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            stockQty: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Se auto-aprovado, aplica ajuste imediatamente
    if (status === StockAdjustmentStatus.AUTO_APPROVED) {
      await this.applyAdjustment(adjustment.id);
    }

    return adjustment;
  }

  /**
   * Lista ajustes com filtros e paginação
   */
  async list(query: StockAdjustmentQuery, companyId: string) {
    const {
      page = 1,
      pageSize = 20,
      status,
      type,
      productId,
      createdByUserId,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const where: Prisma.StockAdjustmentWhereInput = {
      companyId,
      ...(status && { status }),
      ...(type && { type }),
      ...(productId && { productId }),
      ...(createdByUserId && { createdByUserId }),
      ...(startDate &&
        endDate && {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }),
    };

    const [data, total] = await Promise.all([
      prisma.stockAdjustment.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              stockQty: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.stockAdjustment.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Busca ajuste por ID
   */
  async getById(id: string, companyId: string) {
    const adjustment = await prisma.stockAdjustment.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            stockQty: true,
            costPrice: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!adjustment) {
      throw new Error("Ajuste não encontrado");
    }

    return adjustment;
  }

  /**
   * Aprova um ajuste de estoque
   */
  async approve(id: string, userId: string, companyId: string) {
    const adjustment = await this.getById(id, companyId);

    if (adjustment.status !== StockAdjustmentStatus.PENDING) {
      throw new Error("Apenas ajustes pendentes podem ser aprovados");
    }

    // Atualiza ajuste
    const updated = await prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: StockAdjustmentStatus.APPROVED,
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
      include: {
        product: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    // Aplica ajuste no estoque
    await this.applyAdjustment(id);

    return updated;
  }

  /**
   * Rejeita um ajuste de estoque
   */
  async reject(
    id: string,
    userId: string,
    rejectionReason: string,
    companyId: string
  ) {
    const adjustment = await this.getById(id, companyId);

    if (adjustment.status !== StockAdjustmentStatus.PENDING) {
      throw new Error("Apenas ajustes pendentes podem ser rejeitados");
    }

    const updated = await prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: StockAdjustmentStatus.REJECTED,
        approvedByUserId: userId,
        approvedAt: new Date(),
        rejectionReason,
      },
      include: {
        product: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    return updated;
  }

  /**
   * Verifica se ajuste precisa de aprovação baseado nas regras
   */
  async needsApproval(
    totalValue: number,
    companyId: string
  ): Promise<boolean> {
    const approvalAmount = await systemRuleService.get(
      "stock.adjustment.approval_amount",
      companyId
    );

    return totalValue > (approvalAmount || 500);
  }

  /**
   * Aplica o ajuste no estoque do produto
   */
  async applyAdjustment(adjustmentId: string): Promise<void> {
    const adjustment = await prisma.stockAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { product: true },
    });

    if (!adjustment) {
      throw new Error("Ajuste não encontrado");
    }

    // Atualiza estoque do produto
    await prisma.product.update({
      where: { id: adjustment.productId },
      data: {
        stockQty: {
          increment: adjustment.quantityChange,
        },
      },
    });
  }

  /**
   * Busca resumo de ajustes por período
   */
  async getAdjustmentsSummary(
    startDate: Date,
    endDate: Date,
    companyId: string
  ) {
    const adjustments = await prisma.stockAdjustment.findMany({
      where: {
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: [StockAdjustmentStatus.APPROVED, StockAdjustmentStatus.AUTO_APPROVED],
        },
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
          },
        },
      },
    });

    // Agrupa por tipo
    const byType = adjustments.reduce((acc, adj) => {
      if (!acc[adj.type]) {
        acc[adj.type] = {
          count: 0,
          totalValue: 0,
          totalQuantity: 0,
        };
      }

      acc[adj.type].count++;
      acc[adj.type].totalValue += Number(adj.totalValue);
      acc[adj.type].totalQuantity += Math.abs(adj.quantityChange);

      return acc;
    }, {} as Record<string, { count: number; totalValue: number; totalQuantity: number }>);

    // Calcula totais
    const totalAdjustments = adjustments.length;
    const totalValue = adjustments.reduce(
      (sum, adj) => sum + Number(adj.totalValue),
      0
    );
    const totalQuantity = adjustments.reduce(
      (sum, adj) => sum + Math.abs(adj.quantityChange),
      0
    );

    return {
      totalAdjustments,
      totalValue,
      totalQuantity,
      byType,
      adjustments,
    };
  }

  /**
   * Busca ajustes pendentes que precisam de aprovação
   */
  async getPendingApprovals(companyId: string) {
    return prisma.stockAdjustment.findMany({
      where: {
        companyId,
        status: StockAdjustmentStatus.PENDING,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            stockQty: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
}
