import { prisma } from "@/lib/prisma";
import type {
  CreateStockMovementDTO,
  CreateTransferDTO,
  StockMovementQuery,
} from "@/lib/validations/stock-movement.schema";
import {
  isStockIncrease,
  isStockDecrease,
} from "@/lib/validations/stock-movement.schema";
import {
  notFoundError,
  businessRuleError,
} from "@/lib/error-handler";
import { createPaginationMeta } from "@/lib/api-response";
import { StockMovementType } from "@prisma/client";

/**
 * Service de movimentações de estoque
 * Camada de business logic para operações de StockMovement
 */
export class StockMovementService {
  /**
   * Lista movimentações de estoque com paginação e filtros
   */
  async list(query: StockMovementQuery, companyId: string) {
    const {
      page,
      pageSize,
      type,
      productId,
      supplierId,
      sourceBranchId,
      targetBranchId,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    } = query;

    // Build where clause
    const where: any = {
      companyId,
    };

    if (type) {
      where.type = type;
    }

    if (productId) {
      where.productId = productId;
    }

    if (supplierId) {
      where.supplierId = supplierId;
    }

    if (sourceBranchId) {
      where.sourceBranchId = sourceBranchId;
    }

    if (targetBranchId) {
      where.targetBranchId = targetBranchId;
    }

    // Filtro por período
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Count total
    const total = await prisma.stockMovement.count({ where });

    // Buscar dados
    const skip = (page - 1) * pageSize;
    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            type: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        sourceBranch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        targetBranch: {
          select: {
            id: true,
            name: true,
            code: true,
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
        [sortBy]: sortOrder,
      },
      skip,
      take: pageSize,
    });

    // Criar metadata de paginação
    const meta = createPaginationMeta(total, page, pageSize);

    return {
      data: movements,
      meta,
    };
  }

  /**
   * Busca uma movimentação específica por ID
   */
  async findById(id: string, companyId: string) {
    const movement = await prisma.stockMovement.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        product: true,
        supplier: true,
        sourceBranch: true,
        targetBranch: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!movement) {
      throw notFoundError("Movimentação de estoque não encontrada");
    }

    return movement;
  }

  /**
   * Cria uma nova movimentação de estoque e atualiza o estoque do produto
   */
  async create(
    data: CreateStockMovementDTO,
    companyId: string,
    userId?: string
  ) {
    // Verificar se produto existe
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        companyId,
      },
    });

    if (!product) {
      throw notFoundError("Produto não encontrado");
    }

    // Verificar se fornecedor existe (se informado)
    if (data.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: {
          id: data.supplierId,
          companyId,
        },
      });

      if (!supplier) {
        throw notFoundError("Fornecedor não encontrado");
      }
    }

    // Validar estoque para movimentações de saída
    if (isStockDecrease(data.type)) {
      if (product.stockControlled && product.stockQty < data.quantity) {
        throw businessRuleError(
          `Estoque insuficiente. Disponível: ${product.stockQty}, Solicitado: ${data.quantity}`
        );
      }
    }

    // Calcular nova quantidade de estoque
    let newStockQty = product.stockQty;
    if (isStockIncrease(data.type)) {
      newStockQty += data.quantity;
    } else if (isStockDecrease(data.type)) {
      newStockQty -= data.quantity;
    } else if (data.type === StockMovementType.ADJUSTMENT) {
      // Para ajustes, a quantidade pode ser positiva (acréscimo) ou negativa (decréscimo)
      // Mas no schema validamos que sempre seja positivo, então precisamos de lógica adicional
      // Por enquanto, vamos considerar ajustes como entrada
      newStockQty = data.quantity;
    }

    // Criar movimentação e atualizar estoque em transação
    const movement = await prisma.$transaction(async (tx) => {
      // Criar a movimentação
      const createdMovement = await tx.stockMovement.create({
        data: {
          companyId,
          productId: data.productId,
          type: data.type,
          quantity: data.quantity,
          supplierId: data.supplierId || undefined,
          invoiceNumber: data.invoiceNumber || undefined,
          reason: data.reason || undefined,
          notes: data.notes || undefined,
          createdByUserId: userId,
        },
        include: {
          product: true,
          supplier: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Atualizar estoque do produto (se controlar estoque)
      if (product.stockControlled && data.type !== StockMovementType.ADJUSTMENT) {
        await tx.product.update({
          where: { id: data.productId },
          data: { stockQty: newStockQty },
        });
      } else if (data.type === StockMovementType.ADJUSTMENT) {
        // Para ajustes, define o estoque para a quantidade especificada
        await tx.product.update({
          where: { id: data.productId },
          data: { stockQty: data.quantity },
        });
      }

      return createdMovement;
    });

    return movement;
  }

  /**
   * Cria uma transferência entre filiais
   * Cria duas movimentações: TRANSFER_OUT na origem e TRANSFER_IN no destino
   */
  async createTransfer(
    data: CreateTransferDTO,
    companyId: string,
    userId?: string
  ) {
    // Verificar se produto existe
    const product = await prisma.product.findFirst({
      where: {
        id: data.productId,
        companyId,
      },
    });

    if (!product) {
      throw notFoundError("Produto não encontrado");
    }

    // Verificar se filiais existem
    const [sourceBranch, targetBranch] = await Promise.all([
      prisma.branch.findFirst({
        where: {
          id: data.sourceBranchId,
          companyId,
        },
      }),
      prisma.branch.findFirst({
        where: {
          id: data.targetBranchId,
          companyId,
        },
      }),
    ]);

    if (!sourceBranch) {
      throw notFoundError("Filial de origem não encontrada");
    }

    if (!targetBranch) {
      throw notFoundError("Filial de destino não encontrada");
    }

    // Validar estoque suficiente na origem
    if (product.stockControlled && product.stockQty < data.quantity) {
      throw businessRuleError(
        `Estoque insuficiente na filial de origem. Disponível: ${product.stockQty}, Solicitado: ${data.quantity}`
      );
    }

    // Criar transferência em transação
    const result = await prisma.$transaction(async (tx) => {
      // Criar movimentação de saída na origem
      const transferOut = await tx.stockMovement.create({
        data: {
          companyId,
          productId: data.productId,
          type: StockMovementType.TRANSFER_OUT,
          quantity: data.quantity,
          sourceBranchId: data.sourceBranchId,
          targetBranchId: data.targetBranchId,
          reason: data.reason || `Transferência para ${targetBranch.name}`,
          notes: data.notes || undefined,
          createdByUserId: userId,
        },
      });

      // Criar movimentação de entrada no destino
      const transferIn = await tx.stockMovement.create({
        data: {
          companyId,
          productId: data.productId,
          type: StockMovementType.TRANSFER_IN,
          quantity: data.quantity,
          sourceBranchId: data.sourceBranchId,
          targetBranchId: data.targetBranchId,
          reason: data.reason || `Transferência de ${sourceBranch.name}`,
          notes: data.notes || undefined,
          createdByUserId: userId,
        },
      });

      // Atualizar estoque do produto (deduzir da origem)
      if (product.stockControlled) {
        await tx.product.update({
          where: { id: data.productId },
          data: { stockQty: product.stockQty - data.quantity },
        });
      }

      return { transferOut, transferIn };
    });

    return result;
  }

  /**
   * Busca histórico de movimentações de um produto específico
   */
  async getProductHistory(productId: string, companyId: string, limit = 50) {
    const movements = await prisma.stockMovement.findMany({
      where: {
        productId,
        companyId,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        sourceBranch: {
          select: {
            id: true,
            name: true,
          },
        },
        targetBranch: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return movements;
  }

  /**
   * Busca estatísticas de movimentações por período
   */
  async getStatistics(companyId: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      companyId,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [
      totalMovements,
      totalPurchases,
      totalSales,
      totalTransfers,
      totalAdjustments,
      totalLosses,
    ] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.count({
        where: { ...where, type: StockMovementType.PURCHASE },
      }),
      prisma.stockMovement.count({
        where: { ...where, type: StockMovementType.SALE },
      }),
      prisma.stockMovement.count({
        where: {
          ...where,
          type: {
            in: [StockMovementType.TRANSFER_IN, StockMovementType.TRANSFER_OUT],
          },
        },
      }),
      prisma.stockMovement.count({
        where: { ...where, type: StockMovementType.ADJUSTMENT },
      }),
      prisma.stockMovement.count({
        where: { ...where, type: StockMovementType.LOSS },
      }),
    ]);

    return {
      totalMovements,
      totalPurchases,
      totalSales,
      totalTransfers: totalTransfers / 2, // Dividir por 2 pois cada transferência gera 2 movimentações
      totalAdjustments,
      totalLosses,
    };
  }
}
