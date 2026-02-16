import { prisma } from "@/lib/prisma";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { Prisma, QuoteStatus } from "@prisma/client";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { PaymentDTO } from "@/lib/validations/sale.schema";
import type {
  QuoteQuery,
  CreateQuoteDTO,
  UpdateQuoteDTO,
  CancelQuoteDTO,
} from "@/lib/validations/quote.schema";
import {
  validateQuotePayments,
  calculateQuoteTotals,
  calculateQuoteItemTotal,
} from "@/lib/validations/quote.schema";

/**
 * Service para operações de Orçamentos
 *
 * Características:
 * - Multi-tenancy (companyId filter)
 * - Conversão de orçamento em venda (B1)
 * - Validações de negócio (status, validade, estoque, pagamentos)
 */
export class QuoteService {
  /**
   * Lista orçamentos com paginação, busca e filtros
   */
  async list(query: QuoteQuery, companyId: string) {
    const {
      search = "",
      page = 1,
      pageSize = 20,
      status = "ativos",
      quoteStatus,
      customerId,
      sellerUserId,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build where clause
    const where: Prisma.QuoteWhereInput = {
      companyId,
      ...(status === "ativos" && { status: { notIn: ["CANCELED", "EXPIRED", "CANCELLED"] } }),
      ...(status === "inativos" && { status: { in: ["CANCELED", "EXPIRED", "CANCELLED"] } }),
      ...(quoteStatus && { status: quoteStatus }),
      ...(customerId && { customerId }),
      ...(sellerUserId && { sellerUserId }),
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
    let orderBy: Prisma.QuoteOrderByWithRelationInput = {};
    if (sortBy === "customer") {
      orderBy = { customer: { name: sortOrder } };
    } else if (sortBy === "total") {
      orderBy = { total: sortOrder };
    } else if (sortBy === "validUntil") {
      orderBy = { validUntil: sortOrder };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Query paralela para performance
    const [data, total] = await Promise.all([
      prisma.quote.findMany({
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
              description: true,
              qty: true,
              unitPrice: true,
              discount: true,
              total: true,
              itemType: true,
              prescriptionData: true,
              notes: true,
            },
          },
          _count: {
            select: { items: true },
          },
        },
      }),
      prisma.quote.count({ where }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    return { data, pagination };
  }

  /**
   * Busca orçamento por ID com todos os dados relacionados
   */
  async getById(id: string, companyId: string, includeInactive = false) {
    const quote = await prisma.quote.findFirst({
      where: {
        id,
        companyId,
        ...(includeInactive ? {} : { status: { notIn: ["CANCELED", "EXPIRED"] } }),
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
                stockQty: true,
              },
            },
          },
        },
        convertedToSale: true,
      },
    });

    if (!quote) {
      throw notFoundError("Orçamento não encontrado");
    }

    return quote;
  }

  /**
   * Cria novo orçamento
   *
   * Validações:
   * - Pelo menos 1 item
   * - Se customerId não fornecido, customerName é obrigatório
   * - Calcula subtotal, discountTotal, total
   * - Define validUntil baseado em validDays
   */
  async create(data: CreateQuoteDTO, companyId: string, userId: string, branchId: string) {
    const {
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      items,
      discountTotal = 0,
      discountPercent = 0,
      notes,
      internalNotes,
      paymentConditions,
      validDays = 15,
    } = data;

    // Validação: Cliente cadastrado OU nome do cliente avulso
    if (!customerId && !customerName) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Informe um cliente cadastrado ou o nome do cliente",
        400
      );
    }

    // Validação: Pelo menos 1 item
    if (!items || items.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Orçamento deve ter pelo menos 1 item",
        400
      );
    }

    // Calcular totais
    const totals = calculateQuoteTotals(items, discountTotal, discountPercent);

    // Calcular data de validade
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    // Criar orçamento em transação
    const quote = await prisma.$transaction(async (tx) => {
      const newQuote = await tx.quote.create({
        data: {
          companyId,
          branchId,
          customerId: customerId || null,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          customerEmail: customerEmail || null,
          sellerUserId: userId,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          discountPercent: discountPercent || 0,
          total: totals.total,
          status: QuoteStatus.PENDING,
          validUntil,
          notes,
          internalNotes,
          paymentConditions,
        },
      });

      // Criar itens
      for (const item of items) {
        const itemTotal = calculateQuoteItemTotal(item);
        await tx.quoteItem.create({
          data: {
            quoteId: newQuote.id,
            productId: item.productId || null,
            description: item.description,
            qty: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            total: itemTotal,
            itemType: item.itemType || "PRODUCT",
            prescriptionData: item.prescriptionData as Prisma.InputJsonValue,
            notes: item.notes,
          },
        });
      }

      return newQuote;
    });

    // Retornar orçamento completo
    return this.getById(quote.id, companyId, true);
  }

  /**
   * Atualiza orçamento existente
   *
   * Validações:
   * - Apenas orçamentos PENDING, SENT ou OPEN podem ser editados
   * - Se items mudarem, recalcula totais
   * - Deleta itens antigos e cria novos (replace)
   */
  async update(id: string, data: UpdateQuoteDTO, companyId: string) {
    // Buscar orçamento
    const existing = await this.getById(id, companyId, true);

    // Validar status
    if (!["PENDING", "SENT", "OPEN"].includes(existing.status)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Orçamento com status ${existing.status} não pode ser editado`,
        400
      );
    }

    const {
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      items,
      discountTotal,
      discountPercent,
      notes,
      internalNotes,
      paymentConditions,
      validDays,
    } = data;

    // Calcular novos totais se items mudarem
    let totals = {
      subtotal: Number(existing.subtotal),
      discountTotal: Number(existing.discountTotal),
      total: Number(existing.total),
    };

    if (items && items.length > 0) {
      totals = calculateQuoteTotals(
        items,
        discountTotal ?? Number(existing.discountTotal),
        discountPercent ?? Number(existing.discountPercent)
      );
    }

    // Calcular nova validade se validDays fornecido
    let validUntil: Date | undefined = undefined;
    if (validDays) {
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validDays);
    }

    // Atualizar em transação
    const quote = await prisma.$transaction(async (tx) => {
      // Atualizar orçamento
      const updated = await tx.quote.update({
        where: { id },
        data: {
          ...(customerId !== undefined && { customerId }),
          ...(customerName !== undefined && { customerName }),
          ...(customerPhone !== undefined && { customerPhone }),
          ...(customerEmail !== undefined && { customerEmail }),
          ...(notes !== undefined && { notes }),
          ...(internalNotes !== undefined && { internalNotes }),
          ...(paymentConditions !== undefined && { paymentConditions }),
          ...(validUntil && { validUntil }),
          ...(items && {
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            discountPercent: discountPercent ?? Number(existing.discountPercent),
            total: totals.total,
          }),
        },
      });

      // Se items fornecidos, deletar antigos e criar novos
      if (items && items.length > 0) {
        // Deletar itens antigos
        await tx.quoteItem.deleteMany({
          where: { quoteId: id },
        });

        // Criar novos itens
        for (const item of items) {
          const itemTotal = calculateQuoteItemTotal(item);
          await tx.quoteItem.create({
            data: {
              quoteId: id,
              productId: item.productId || null,
              description: item.description,
              qty: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              total: itemTotal,
              itemType: item.itemType || "PRODUCT",
              prescriptionData: item.prescriptionData as Prisma.InputJsonValue,
              notes: item.notes,
            },
          });
        }
      }

      return updated;
    });

    // Retornar orçamento completo
    return this.getById(quote.id, companyId, true);
  }

  /**
   * Atualiza status do orçamento
   *
   * Incrementa followUpCount e atualiza lastFollowUpAt
   */
  async updateStatus(
    id: string,
    status: QuoteStatus,
    companyId: string,
    lostReason?: string
  ) {
    const existing = await this.getById(id, companyId, true);

    // Validar transições permitidas
    const allowedTransitions: Record<QuoteStatus, QuoteStatus[]> = {
      PENDING: ["SENT", "APPROVED", "CANCELLED", "EXPIRED"],
      SENT: ["APPROVED", "CANCELLED", "EXPIRED", "PENDING"],
      APPROVED: ["CONVERTED", "CANCELLED", "EXPIRED"],
      CONVERTED: [], // Não pode mudar status de convertido
      EXPIRED: ["PENDING", "SENT"], // Pode reativar
      CANCELLED: ["PENDING"], // Pode reativar
      OPEN: ["PENDING", "SENT", "APPROVED", "CANCELLED"], // Legacy
      CANCELED: ["PENDING"], // Legacy
    };

    if (!allowedTransitions[existing.status as QuoteStatus]?.includes(status)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Não é permitido mudar de ${existing.status} para ${status}`,
        400
      );
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        status,
        lastFollowUpAt: new Date(),
        followUpCount: { increment: 1 },
        ...(lostReason && { lostReason }),
      },
      include: {
        customer: true,
        sellerUser: {
          select: { id: true, name: true, email: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true },
            },
          },
        },
      },
    });

    return quote;
  }

  /**
   * Cancela orçamento com motivo
   */
  async cancel(id: string, data: CancelQuoteDTO, companyId: string) {
    const existing = await this.getById(id, companyId, true);

    if (existing.status === "CONVERTED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Orçamento já foi convertido em venda e não pode ser cancelado",
        400
      );
    }

    return this.updateStatus(id, QuoteStatus.CANCELLED, companyId, data.lostReason);
  }

  /**
   * Retorna estatísticas de orçamentos
   *
   * Filtros: branchId, startDate, endDate
   */
  async getStats(
    companyId: string,
    branchId?: string,
    startDate?: string,
    endDate?: string
  ) {
    const where: Prisma.QuoteWhereInput = {
      companyId,
      ...(branchId && { branchId }),
      ...(startDate && {
        createdAt: { gte: new Date(startDate) },
      }),
      ...(endDate && {
        createdAt: { lte: new Date(endDate) },
      }),
    };

    // Query paralela para métricas
    const [byStatus, totals, lostReasons, conversionMetrics, sentCount, pendingFollowUpCount] = await Promise.all([
      // Contar por status
      prisma.quote.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),

      // Totais gerais
      prisma.quote.aggregate({
        where,
        _count: true,
        _sum: {
          total: true,
        },
      }),

      // Motivos de perda
      prisma.quote.groupBy({
        by: ["lostReason"],
        where: {
          ...where,
          status: { in: ["CANCELLED", "EXPIRED"] },
          lostReason: { not: null },
        },
        _count: { _all: true },
      }),

      // Métricas de conversão (apenas count, cálculo manual depois)
      prisma.quote.count({
        where: {
          ...where,
          status: "CONVERTED",
          convertedAt: { not: null },
        },
      }),

      // CRM: Orçamentos enviados
      prisma.quote.count({
        where: {
          ...where,
          sentAt: { not: null },
        },
      }),

      // CRM: Orçamentos com follow-up pendente
      prisma.quote.count({
        where: {
          ...where,
          followUpDate: { lte: new Date() },
          status: { notIn: ["CONVERTED", "CANCELLED", "EXPIRED"] },
        },
      }),
    ]);

    // Montar objeto de resposta
    const statusMap: Record<string, number> = {};
    byStatus.forEach((item) => {
      statusMap[item.status] = item._count._all;
    });

    const total = totals._count;
    const converted = statusMap["CONVERTED"] || 0;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;

    const lostReasonsMap: Record<string, number> = {};
    lostReasons.forEach((item) => {
      if (item.lostReason) {
        lostReasonsMap[item.lostReason] = item._count._all;
      }
    });

    // Calcular tempo médio de conversão manualmente
    const convertedQuotes = await prisma.quote.findMany({
      where: {
        ...where,
        status: "CONVERTED",
        convertedAt: { not: null },
      },
      select: {
        createdAt: true,
        convertedAt: true,
      },
    });

    let avgTimeToConversion = 0;
    if (convertedQuotes.length > 0) {
      const totalDays = convertedQuotes.reduce((sum, q) => {
        if (q.convertedAt) {
          const diff = q.convertedAt.getTime() - q.createdAt.getTime();
          return sum + diff / (1000 * 60 * 60 * 24); // ms para dias
        }
        return sum;
      }, 0);
      avgTimeToConversion = totalDays / convertedQuotes.length;
    }

    return {
      total,
      byStatus: statusMap,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      totalQuotedValue: Number(totals._sum.total || 0),
      totalConvertedValue: 0, // TODO: Calcular somando Sale.total de vendas convertidas
      avgTimeToConversion: parseFloat(avgTimeToConversion.toFixed(1)),
      lostReasons: lostReasonsMap,
      // CRM
      sent: sentCount,
      notSent: total - sentCount,
      pendingFollowUp: pendingFollowUpCount,
    };
  }

  /**
   * Marca orçamentos expirados automaticamente
   *
   * Atualiza status de PENDING/SENT para EXPIRED se validUntil < hoje
   */
  async markExpired(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await prisma.quote.updateMany({
      where: {
        companyId,
        status: { in: ["PENDING", "SENT", "OPEN"] },
        validUntil: { lt: today },
      },
      data: {
        status: QuoteStatus.EXPIRED,
      },
    });

    return { expired: result.count };
  }

  /**
   * Converte orçamento aprovado em venda (B1)
   *
   * Fluxo:
   * 1. Valida se orçamento existe e está APPROVED
   * 2. Valida se não expirou (validUntil >= hoje)
   * 3. Valida se há caixa aberto
   * 4. Valida estoque de todos os itens
   * 5. Valida se pagamentos cobrem o total
   * 6. Transação Prisma:
   *    - Cria Sale + SaleItems
   *    - Cria SalePayments
   *    - Decrementa estoque dos produtos
   *    - Cria CashMovements (para CASH)
   *    - Cria Commission do vendedor
   *    - Atualiza Quote.status → CONVERTED
   *    - Define Quote.convertedToSaleId e Sale.convertedFromQuoteId
   * 7. Retorna { sale, quote }
   */
  async convertToSale(
    quoteId: string,
    companyId: string,
    branchId: string,
    userId: string,
    payments: PaymentDTO[]
  ) {
    // 1. Buscar orçamento com todos os dados
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, companyId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                stockQty: true,
                salePrice: true,
              },
            },
          },
        },
        customer: true,
      },
    });

    if (!quote) {
      throw notFoundError("Orçamento não encontrado");
    }

    // 2. Validar status = APPROVED
    if (quote.status !== "APPROVED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Orçamento deve estar APROVADO para conversão. Status atual: ${quote.status}`,
        400
      );
    }

    // 3. Validar se não expirou
    if (quote.validUntil) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const validUntil = new Date(quote.validUntil);
      validUntil.setHours(0, 0, 0, 0);

      if (validUntil < today) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Orçamento expirado. Válido até: ${quote.validUntil.toLocaleDateString("pt-BR")}`,
          400
        );
      }
    }

    // 4. Validar se há caixa aberto
    const openShift = await prisma.cashShift.findFirst({
      where: { branchId, status: "OPEN" },
    });

    if (!openShift) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não há caixa aberto. Abra o caixa antes de converter o orçamento em venda.",
        400
      );
    }

    // 5. Validar estoque de todos os itens
    for (const item of quote.items) {
      if (!item.product) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Produto do item ${item.id} não encontrado`,
          400
        );
      }

      if (item.product.stockQty < item.qty) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Estoque insuficiente para ${item.product.name}. Disponível: ${item.product.stockQty}, Solicitado: ${item.qty}`,
          400
        );
      }
    }

    // 6. Validar pagamentos cobrem o total
    const paymentValidation = validateQuotePayments(payments, Number(quote.total));
    if (!paymentValidation.valid) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        paymentValidation.message || "Pagamentos inválidos",
        400
      );
    }

    // 7. Criar venda em transação
    const result = await prisma.$transaction(async (tx) => {
      // 7.1. Criar venda
      const sale = await tx.sale.create({
        data: {
          companyId,
          customerId: quote.customerId,
          branchId,
          sellerUserId: userId,
          subtotal: quote.subtotal,
          discountTotal: quote.discountTotal,
          total: quote.total,
          status: "COMPLETED",
          convertedFromQuoteId: quoteId, // ✅ Link bidirecional
        },
      });

      // 7.2. Criar itens da venda (baseado nos itens do orçamento)
      for (const item of quote.items) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount,
            lineTotal: item.total, // Usar 'total' do novo schema
          },
        });

        // 7.3. Decrementar estoque (somente se tiver productId)
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: {
                decrement: Number(item.qty),
              },
            },
          });
        }
      }

      // 7.4. Criar pagamentos
      for (const payment of payments) {
        const salePayment = await tx.salePayment.create({
          data: {
            saleId: sale.id,
            method: payment.method,
            amount: payment.amount,
            installments: payment.installments || 1,
            status: "RECEIVED",
            receivedAt: new Date(),
            receivedByUserId: userId,
          },
        });

        // 7.5. Criar CashMovement para TODOS os métodos de pagamento
        await tx.cashMovement.create({
          data: {
            cashShiftId: openShift.id,
            branchId,
            type: "SALE_PAYMENT",
            direction: "IN",
            method: payment.method,
            amount: payment.amount,
            originType: "SALE_PAYMENT",
            originId: salePayment.id,
            salePaymentId: salePayment.id,
            createdByUserId: userId,
            note: `Venda #${sale.id.substring(0, 8)} (convertida de orçamento #${quoteId.substring(0, 8)})`,
          },
        });
      }

      // 7.6. Criar comissão do vendedor
      const seller = await tx.user.findUnique({
        where: { id: userId },
        select: { defaultCommissionPercent: true },
      });

      const commissionPercent = seller?.defaultCommissionPercent || new Prisma.Decimal(5);
      const baseAmount = Number(sale.total);
      const commissionAmount = new Prisma.Decimal(baseAmount)
        .mul(commissionPercent)
        .div(100);

      await tx.commission.create({
        data: {
          companyId,
          saleId: sale.id,
          userId,
          baseAmount,
          percentage: commissionPercent,
          commissionAmount,
          status: "PENDING",
          periodMonth: new Date().getMonth() + 1,
          periodYear: new Date().getFullYear(),
        },
      });

      // 7.7. Atualizar orçamento: status CONVERTED + link para venda
      const updatedQuote = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: "CONVERTED",
          convertedToSaleId: sale.id, // ✅ Link bidirecional
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
          customer: true,
          convertedToSale: true,
        },
      });

      // Buscar venda completa
      const completeSale = await tx.sale.findUnique({
        where: { id: sale.id },
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
                select: { id: true, name: true, sku: true, barcode: true, salePrice: true },
              },
            },
          },
          payments: true,
          convertedFromQuote: true,
        },
      });

      return { sale: completeSale, quote: updatedQuote };
    });

    return result;
  }
}

export const quoteService = new QuoteService();
