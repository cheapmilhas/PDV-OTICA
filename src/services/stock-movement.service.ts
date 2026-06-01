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
import { atomicStockDebit, atomicStockCredit } from "@/services/stock.service";
import { validateBranchOwnership } from "@/lib/validate-branch";
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

    // T9: valida que a filial pertence à empresa (anti-leak multi-tenant).
    if (data.branchId) {
      await validateBranchOwnership(data.branchId, companyId);
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

    // Criar movimentação e atualizar estoque em transação
    const movement = await prisma.$transaction(async (tx) => {
      // Criar a movimentação
      const createdMovement = await tx.stockMovement.create({
        data: {
          companyId,
          productId: data.productId,
          // T9: o branchId vinha sendo descartado aqui — o movimento gravava sem
          // filial (coluna FILIAIS vazia no histórico) e o crédito não chegava
          // ao BranchStock da loja. Agora persiste a filial da entrada.
          branchId: data.branchId || undefined,
          type: data.type,
          quantity: data.quantity,
          supplierId: data.supplierId || undefined,
          invoiceNumber: data.invoiceNumber || undefined,
          reason: data.reason || undefined,
          notes: data.notes || undefined,
          ...(userId && { createdByUserId: userId }),
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

      // Atualizar estoque. T9/H3: o estoque é por FILIAL (BranchStock) e o PDV
      // lê de lá. Antes só Product.stockQty (cache global) era atualizado →
      // a entrada não aparecia no PDV da loja. Agora, com branchId, usa
      // atomicStockCredit/Debit (upsert no BranchStock + atualiza o cache).
      const branchId = data.branchId || null;

      if (data.type === StockMovementType.ADJUSTMENT) {
        // Ajuste define o valor ABSOLUTO da filial. O cache Product.stockQty é a
        // SOMA de todas as filiais — com branchId, recalcula da soma (setar o
        // cache pro valor da filial só seria correto com 1 filial). Sem branchId
        // (setup sem BranchStock), aplica o valor absoluto direto no cache.
        // NÃO filtra stockControlled de propósito: ajuste é inventário físico
        // (contagem) e deve refletir no saldo independente do flag — mesmo
        // raciocínio das entradas (crédito não guarda; só o débito de venda guarda).
        if (branchId) {
          await tx.branchStock.upsert({
            where: { branchId_productId: { branchId, productId: data.productId } },
            create: { branchId, productId: data.productId, quantity: data.quantity },
            update: { quantity: data.quantity },
          });
          await tx.$executeRaw`
            UPDATE "Product"
            SET "stockQty" = (
              SELECT COALESCE(SUM("quantity"), 0)
              FROM "branch_stocks"
              WHERE "product_id" = ${data.productId}
            ),
            "updatedAt" = NOW()
            WHERE "id" = ${data.productId}
          `;
        } else {
          await tx.product.update({
            where: { id: data.productId },
            data: { stockQty: data.quantity },
          });
        }
      } else if (isStockIncrease(data.type)) {
        // T9/H3: entrada de estoque é evento explícito e deve creditar o
        // BranchStock + cache MESMO para produto não-controlado — senão a
        // entrada some do PDV (bug: produto stockControlled=false, entrada de
        // 10 un. registrava o movimento mas o saldo da filial seguia 0).
        // atomicStockCredit já faz upsert no BranchStock quando há branchId e
        // não filtra por stockControlled (assimetria intencional com o débito).
        await atomicStockCredit(data.productId, data.quantity, companyId, tx, branchId);
      } else if (isStockDecrease(data.type)) {
        // Saída mantém o guard: atomicStockDebit pula produto não-controlado
        // internamente (retorna sucesso sem debitar). Só registra o movimento.
        await atomicStockDebit(data.productId, data.quantity, companyId, tx, branchId);
      }

      return createdMovement;
    }, { timeout: 30_000 });

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

      // Atualizar estoque de forma atômica: deduzir da origem E creditar no
      // destino. Bug pré-existente (HIGH): a transferência só debitava a origem,
      // nunca creditava o destino — o BranchStock da filial de destino seguia
      // 0 e o produto não aparecia no PDV de lá. Como é transferência interna,
      // o cache global Product.stockQty deve permanecer inalterado: o débito
      // (−qty) e o crédito (+qty) no cache se cancelam. Ambos sob o guard
      // stockControlled para manter a simetria com o resto do serviço.
      if (product.stockControlled) {
        const debitResult = await atomicStockDebit(data.productId, data.quantity, companyId, tx, data.sourceBranchId);
        if (!debitResult.success) {
          throw new Error(debitResult.error || "Estoque insuficiente para transferência");
        }
        await atomicStockCredit(data.productId, data.quantity, companyId, tx, data.targetBranchId);
      }

      return { transferOut, transferIn };
    }, { timeout: 30_000 });

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
