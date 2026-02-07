import { prisma } from "@/lib/prisma";
import { Sale, SaleItem, SalePayment, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { SaleQuery, CreateSaleDTO } from "@/lib/validations/sale.schema";

/**
 * Service para operações de Vendas (PDV)
 *
 * Características:
 * - Multi-tenancy (companyId filter)
 * - Status-based filtering (OPEN, COMPLETED, CANCELED, REFUNDED)
 * - Transações Prisma (venda + itens + pagamentos + estoque)
 * - Validações de negócio (estoque, pagamentos)
 */
export class SaleService {
  /**
   * Lista vendas com paginação, busca e filtros
   */
  async list(query: SaleQuery, companyId: string) {
    const {
      search = "",
      page = 1,
      pageSize = 20,
      status = "ativos",
      customerId,
      startDate,
      endDate,
      paymentMethod,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build where clause
    const where: Prisma.SaleWhereInput = {
      companyId,
      ...(status === "ativos" && { status: { notIn: ["CANCELED", "REFUNDED"] } }),
      ...(status === "inativos" && { status: { in: ["CANCELED", "REFUNDED"] } }),
      ...(customerId && { customerId }),
      ...(paymentMethod && {
        payments: {
          some: { method: paymentMethod },
        },
      }),
      ...(startDate && {
        createdAt: { gte: new Date(startDate) },
      }),
      ...(endDate && {
        createdAt: { lte: new Date(endDate) },
      }),
    };

    // Busca em múltiplos campos
    if (search) {
      where.OR = [
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { cpf: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
      ];
    }

    const { skip, take } = getPaginationParams(page, pageSize);

    // Build orderBy
    let orderBy: Prisma.SaleOrderByWithRelationInput = {};
    if (sortBy === "customer") {
      orderBy = { customer: { name: sortOrder } };
    } else if (sortBy === "total") {
      orderBy = { total: sortOrder };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Query paralela para performance
    const [data, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          customer: {
            select: { id: true, name: true, cpf: true, phone: true },
          },
          sellerUser: {
            select: { id: true, name: true },
          },
          items: {
            select: {
              id: true,
              productId: true,
              qty: true,
              unitPrice: true,
              discount: true,
              lineTotal: true,
              product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
          payments: {
            select: {
              id: true,
              method: true,
              amount: true,
              installments: true,
            },
          },
          _count: {
            select: { items: true, payments: true },
          },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    return { data, pagination };
  }

  /**
   * Busca venda por ID com todos os dados relacionados
   */
  async getById(id: string, companyId: string, includeInactive = false) {
    const sale = await prisma.sale.findFirst({
      where: {
        id,
        companyId,
        ...(includeInactive ? {} : { status: { notIn: ["CANCELED", "REFUNDED"] } }),
      },
      include: {
        customer: true,
        sellerUser: {
          select: { id: true, name: true, email: true },
        },
        branch: {
          select: { id: true, name: true },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                barcode: true,
                type: true,
                salePrice: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        payments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!sale) {
      throw notFoundError("Venda não encontrada");
    }

    return sale;
  }

  /**
   * Cria nova venda com itens e pagamentos (transação)
   *
   * Validações:
   * - Estoque disponível para cada item
   * - Soma de pagamentos = total da venda
   * - Pelo menos 1 item
   * - Pelo menos 1 pagamento
   */
  async create(data: CreateSaleDTO, companyId: string, userId: string) {
    const { customerId, branchId, items, payments, discount = 0, notes } = data;

    // Validação: pelo menos 1 item
    if (!items || items.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Venda deve ter pelo menos 1 item",
        400
      );
    }

    // Validação: pelo menos 1 pagamento
    if (!payments || payments.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Venda deve ter pelo menos 1 forma de pagamento",
        400
      );
    }

    // Calcular total dos itens
    let subtotal = 0;
    for (const item of items) {
      const itemTotal = item.qty * item.unitPrice - (item.discount || 0);
      subtotal += itemTotal;
    }

    const total = subtotal - discount;

    // Validação: soma de pagamentos = total
    const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentTotal - total) > 0.01) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Soma dos pagamentos (R$ ${paymentTotal.toFixed(2)}) deve ser igual ao total da venda (R$ ${total.toFixed(2)})`,
        400
      );
    }

    // Verificar estoque para cada item
    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, stockQty: true, companyId: true },
      });

      if (!product) {
        throw notFoundError(`Produto ${item.productId} não encontrado`);
      }

      if (product.companyId !== companyId) {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          "Produto não pertence à sua empresa",
          403
        );
      }

      if (product.stockQty < item.qty) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Estoque insuficiente para ${product.name}. Disponível: ${product.stockQty}, Solicitado: ${item.qty}`,
          400
        );
      }
    }

    // Validar se há caixa aberto (obrigatório para vender)
    const openShift = await prisma.cashShift.findFirst({
      where: { branchId, status: "OPEN" },
    });

    if (!openShift) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não há caixa aberto. Abra o caixa antes de realizar vendas.",
        400
      );
    }

    // Criar venda em transação (venda + itens + pagamentos + cashMovement + estoque)
    const sale = await prisma.$transaction(async (tx) => {
      // 1. Criar venda
      const newSale = await tx.sale.create({
        data: {
          companyId,
          customerId,
          branchId,
          sellerUserId: userId,
          subtotal,
          discountTotal: discount,
          total,
          status: "COMPLETED",
        },
      });

      // 2. Criar itens
      for (const item of items) {
        const itemTotal = item.qty * item.unitPrice - (item.discount || 0);
        await tx.saleItem.create({
          data: {
            saleId: newSale.id,
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            lineTotal: itemTotal,
          },
        });

        // 3. Atualizar estoque
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: {
              decrement: item.qty,
            },
          },
        });
      }

      // 4. Criar pagamentos
      for (const payment of payments) {
        const salePayment = await tx.salePayment.create({
          data: {
            saleId: newSale.id,
            method: payment.method,
            amount: payment.amount,
            installments: payment.installments || 1,
            status: "RECEIVED",
            receivedAt: new Date(),
            receivedByUserId: userId,
          },
        });

        // 5. Criar CashMovement para pagamentos em dinheiro
        if (payment.method === "CASH") {
          await tx.cashMovement.create({
            data: {
              cashShiftId: openShift.id,
              branchId,
              type: "SALE_PAYMENT",
              direction: "IN",
              method: "CASH",
              amount: payment.amount,
              originType: "SALE_PAYMENT",
              originId: salePayment.id,
              salePaymentId: salePayment.id,
              createdByUserId: userId,
              note: `Venda #${newSale.id.substring(0, 8)}`,
            },
          });
        }
      }

      // 6. Calcular e criar comissão do vendedor
      const seller = await tx.user.findUnique({
        where: { id: userId },
        select: { defaultCommissionPercent: true },
      });

      const commissionPercent = seller?.defaultCommissionPercent || new Prisma.Decimal(5); // 5% default
      const baseAmount = newSale.total; // Base de cálculo é o total da venda
      const commissionAmount = new Prisma.Decimal(baseAmount)
        .mul(commissionPercent)
        .div(100);

      await tx.commission.create({
        data: {
          companyId,
          saleId: newSale.id,
          userId,
          baseAmount,
          percentage: commissionPercent,
          commissionAmount,
          status: "PENDING",
          periodMonth: new Date().getMonth() + 1,
          periodYear: new Date().getFullYear(),
        },
      });

      return newSale;
    });

    // Retornar venda completa
    return this.getById(sale.id, companyId);
  }

  /**
   * Cancela venda (soft delete) e estorna estoque
   *
   * Validações:
   * - Não permitir cancelar venda já cancelada
   * - Estornar estoque de todos os itens
   */
  async cancel(id: string, companyId: string, reason?: string) {
    // Busca venda
    const sale = await this.getById(id, companyId);

    if (sale.status === "CANCELED" || sale.status === "REFUNDED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Venda já está cancelada",
        400
      );
    }

    // Buscar turno de caixa aberto (necessário para criar movimentos de REFUND)
    const openShift = await prisma.cashShift.findFirst({
      where: { branchId: sale.branchId, status: "OPEN" },
    });

    // Cancelar venda e estornar estoque em transação
    await prisma.$transaction(async (tx) => {
      // 1. Marcar venda como cancelada
      await tx.sale.update({
        where: { id },
        data: {
          status: "CANCELED",
        },
      });

      // 2. Estornar estoque de cada item
      for (const item of sale.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: {
                increment: item.qty,
              },
            },
          });
        }
      }

      // 3. Marcar pagamentos como cancelados e criar movimentos de REFUND
      for (const payment of sale.payments) {
        await tx.salePayment.update({
          where: { id: payment.id },
          data: { status: "VOIDED" },
        });

        // Se tinha caixa aberto E o pagamento foi em dinheiro, criar movimento de REFUND
        if (openShift && payment.method === "CASH") {
          await tx.cashMovement.create({
            data: {
              cashShiftId: openShift.id,
              branchId: sale.branchId,
              type: "REFUND",
              direction: "OUT",
              method: "CASH",
              amount: payment.amount,
              originType: "SALE_PAYMENT",
              originId: payment.id,
              salePaymentId: payment.id,
              createdByUserId: sale.sellerUserId,
              note: `Cancelamento venda #${id.substring(0, 8)}${reason ? ` - ${reason}` : ""}`,
            },
          });
        }
      }

      // 4. Cancelar comissões pendentes
      await tx.commission.updateMany({
        where: {
          saleId: id,
          status: "PENDING",
        },
        data: {
          status: "CANCELED",
        },
      });
    });

    return this.getById(id, companyId, true);
  }

  /**
   * Busca vendas de um cliente específico
   */
  async getByCustomer(customerId: string, companyId: string) {
    const sales = await prisma.sale.findMany({
      where: {
        customerId,
        companyId,
        status: { notIn: ["CANCELED", "REFUNDED"] },
      },
      include: {
        items: {
          select: {
            qty: true,
            unitPrice: true,
            discount: true,
            lineTotal: true,
            product: {
              select: { name: true, sku: true },
            },
          },
        },
        payments: {
          select: {
            method: true,
            amount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return sales;
  }

  /**
   * Busca vendas do dia (para caixa)
   */
  async getDailySales(date: Date, companyId: string, branchId?: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const where: Prisma.SaleWhereInput = {
      companyId,
      status: { notIn: ["CANCELED", "REFUNDED"] },
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      ...(branchId && { branchId }),
    };

    const [sales, summary] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          customer: {
            select: { name: true },
          },
          sellerUser: {
            select: { name: true },
          },
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sale.aggregate({
        where,
        _sum: {
          total: true,
          discountTotal: true,
        },
        _count: true,
      }),
    ]);

    return {
      sales,
      summary: {
        count: summary._count,
        totalSales: Number(summary._sum.total || 0),
        totalDiscount: Number(summary._sum.discountTotal || 0),
      },
    };
  }

  /**
   * Calcula total da venda baseado nos itens
   */
  calculateTotal(items: Array<{ qty: number; unitPrice: number; discount?: number }>, discount = 0) {
    const subtotal = items.reduce((sum, item) => {
      const itemTotal = item.qty * item.unitPrice - (item.discount || 0);
      return sum + itemTotal;
    }, 0);

    return {
      subtotal,
      discount,
      total: subtotal - discount,
    };
  }

  /**
   * Conta vendas ativas de uma empresa
   */
  async countActive(companyId: string): Promise<number> {
    return prisma.sale.count({
      where: { companyId, status: { notIn: ["CANCELED", "REFUNDED"] } },
    });
  }
}

export const saleService = new SaleService();
