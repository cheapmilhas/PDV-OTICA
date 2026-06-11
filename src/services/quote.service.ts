import { prisma } from "@/lib/prisma";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { logger } from "@/lib/logger";
import { getNextSequence } from "@/lib/counter";
import { Prisma, QuoteStatus } from "@prisma/client";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import { PaymentDTO, validateStoreCredit } from "@/lib/validations/sale.schema";
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
import { validateBranchOwnership } from "@/lib/validate-branch";
import { assertValidManagerOverride, overrideAllows } from "@/lib/manager-override";
import type { ManagerOverrideDTO } from "@/lib/validations/sale.schema";
import { validateCreditLimit, sumOnCreditAmount } from "@/lib/installment-utils";
import { getProductPrice } from "@/lib/product-price";
import { assertSalePricing, discountRuleKeyForRole } from "@/lib/sale-price-guard";
import { SystemRuleService } from "@/services/system-rule.service";
import {
  applyStockDebitInTx,
  applyPaymentsInTx,
  applyCommissionInTx,
  applyFinanceEntriesInTx,
  applyPostCommitSideEffects,
} from "@/services/sale-side-effects.service";

const systemRuleService = new SystemRuleService();

/**
 * Service para operações de Orçamentos
 *
 * Características:
 * - Multi-tenancy (companyId filter)
 * - Conversão de orçamento em venda (B1)
 * - Validações de negócio (status, validade, estoque, pagamentos)
 */
const log = logger.child({ service: "quote" });

export class QuoteService {
  /**
   * Lista orçamentos com paginação, busca e filtros
   */
  async list(query: QuoteQuery, companyId: string, branchId?: string | null) {
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
      ...(branchId && { branchId }),
      ...(status === "ativos" && { status: { notIn: ["CANCELED", "EXPIRED", "LOST"] } }),
      ...(status === "inativos" && { status: { in: ["CANCELED", "EXPIRED", "LOST"] } }),
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
    }, { timeout: 30_000 });

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
    }, { timeout: 30_000 });

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
      DRAFT: ["PENDING", "SENT", "CANCELED"],
      PENDING: ["SENT", "APPROVED", "CANCELED", "EXPIRED"],
      SENT: ["APPROVED", "CANCELED", "EXPIRED", "PENDING"],
      APPROVED: ["CONVERTED", "CANCELED", "EXPIRED"],
      CONVERTED: [], // Não pode mudar status de convertido
      EXPIRED: ["PENDING", "SENT"], // Pode reativar
      CANCELED: ["PENDING"], // Pode reativar
      LOST: ["PENDING"], // Pode reativar
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

    return this.updateStatus(id, QuoteStatus.CANCELED, companyId, data.lostReason);
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
          status: { in: ["CANCELED", "EXPIRED", "LOST"] },
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
          status: { notIn: ["CONVERTED", "CANCELED", "EXPIRED", "LOST"] },
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
        status: { in: ["PENDING", "SENT", "DRAFT"] },
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
    payments: PaymentDTO[],
    override?: ManagerOverrideDTO
  ) {
    // 0. Validação multi-tenant — branchId pertence à empresa do usuário?
    await validateBranchOwnership(branchId, companyId);

    // Override de gerente: re-valida o autorizador no servidor.
    let overrideApproverName: string | null = null;
    if (override) {
      const { approverName } = await assertValidManagerOverride(override, companyId);
      overrideApproverName = approverName;
    }

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
                costPrice: true,
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

    // 3.5. Grupo D: anti-fraude de preço também na conversão de orçamento.
    // convertToSale cria a venda direto (não passa por sale.service.create),
    // então sem isto seria um bypass das validações D1/D2 via orçamento.
    const operator = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { role: true },
    });
    const FALLBACK_MAX_DISCOUNT_PERCENT = 10; // teto conservador se regra ausente
    const maxDiscountPercent = Number(
      (await systemRuleService.get(
        discountRuleKeyForRole(operator?.role),
        companyId
      )) ?? FALLBACK_MAX_DISCOUNT_PERCENT
    );
    assertSalePricing({
      items: quote.items.map((qi) => {
        const resolved = getProductPrice(qi.product ?? {});
        return {
          productId: qi.productId ?? "",
          productName: qi.product?.name ?? "Produto",
          qty: qi.qty,
          unitPrice: Number(qi.unitPrice),
          itemDiscount: Number(qi.discount),
          referencePrice: resolved.promoPrice ?? resolved.salePrice,
          costPrice: resolved.costPrice,
        };
      }),
      saleDiscount: Number(quote.discountTotal ?? 0),
      maxDiscountPercent,
      override,
    });

    // 4. Garantir caixa aberto — auto-abre se necessário (paridade com o PDV /
    // sale.service.create, que também auto-abre). Antes lançava 400 e travava a
    // conversão quando o caixa do dia não tinha sido aberto manualmente.
    let openShift = await prisma.cashShift.findFirst({
      where: { branchId, status: "OPEN" },
    });

    if (!openShift) {
      const defaultRegister = await prisma.cashRegister.findFirst({
        where: { branchId, active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      try {
        openShift = await prisma.cashShift.create({
          data: {
            companyId,
            branchId,
            openedByUserId: userId,
            openingFloatAmount: 0,
            status: "OPEN",
            openedAt: new Date(),
            ...(defaultRegister && { cashRegisterId: defaultRegister.id }),
          },
        });

        // Auditoria SÓ quando este request realmente abriu o caixa — dentro do
        // try, depois do create. No caminho P2002 (caixa aberto pelo
        // concorrente) NÃO logamos, senão o audit teria 2 "auto-aberto" para o
        // mesmo shiftId.
        await prisma.activityLog
          .create({
            data: {
              companyId,
              type: "DATA_UPDATED",
              title: "Turno de caixa auto-aberto",
              detail: {
                kind: "cash_shift_auto_opened",
                shiftId: openShift.id,
                branchId,
                cashRegisterId: defaultRegister?.id ?? null,
                triggeredBy: "quote.service.convertToSale",
              },
              actorId: userId,
              actorType: "CLIENT",
            },
          })
          .catch(() => {
            // Auditoria nunca deve impedir a conversão.
          });
      } catch (autoOpenErr) {
        // M1: corrida de auto-abertura (mesmo fix de sale.service.create). No
        // P2002 do índice único parcial, o concorrente já abriu o caixa —
        // rebusca e segue em vez de derrubar a conversão.
        if (
          autoOpenErr instanceof Prisma.PrismaClientKnownRequestError &&
          autoOpenErr.code === "P2002"
        ) {
          openShift = await prisma.cashShift.findFirst({
            where: { branchId, status: "OPEN" },
          });
        }
        if (!openShift) throw autoOpenErr;
      }
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

      if (
        item.product.stockQty < item.qty &&
        !overrideAllows(override, "INSUFFICIENT_STOCK")
      ) {
        throw new AppError(
          ERROR_CODES.INSUFFICIENT_STOCK,
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

    // 7. Validações por método de pagamento (paridade com sale.create)
    //
    // Decisão (Matheus, 2026-05-06): BALANCE_DUE também passa por validateCreditLimit.
    // Razão: BALANCE_DUE é venda a prazo igual STORE_CREDIT — cliente inadimplente
    // não deve burlar a validação só trocando o método.
    for (const payment of payments) {
      if (payment.method === "STORE_CREDIT") {
        validateStoreCredit(payment, quote.customerId);
      }

      if (payment.method === "BALANCE_DUE" && !quote.customerId) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Saldo a Receber exige um cliente vinculado",
          400
        );
      }
    }

    // H2: limite de crédito pela SOMA dos pagamentos a prazo (mesma correção de
    // sale.service.create). Por pagamento isolado, 2 métodos a prazo burlavam
    // o limite (cada um < limite, soma > limite).
    const onCreditAmount = sumOnCreditAmount(payments);

    if (onCreditAmount > 0 && quote.customerId) {
      const creditCheck = await validateCreditLimit(
        quote.customerId,
        onCreditAmount,
        companyId
      );
      if (!creditCheck.approved) {
        const isOverdue = creditCheck.code === "CUSTOMER_OVERDUE";
        const authorized = isOverdue
          ? overrideAllows(override, "CUSTOMER_OVERDUE")
          : overrideAllows(override, "CREDIT_LIMIT_EXCEEDED");
        if (!authorized) {
          throw new AppError(
            isOverdue ? ERROR_CODES.CUSTOMER_OVERDUE : ERROR_CODES.CREDIT_LIMIT_EXCEEDED,
            creditCheck.message || "Limite de crédito excedido",
            400
          );
        }
      }
    }

    // 8. Buscar configurações de juros/multa default (para parcelas STORE_CREDIT)
    const companySettings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { defaultFinePercent: true, defaultInterestPercent: true, defaultGraceDays: true },
    });

    // 9. Criar venda em transação (usa helpers compartilhados — paridade com sale.create)
    const result = await prisma.$transaction(async (tx) => {
      // 9.0. Número sequencial de venda por empresa (mesma chave "sale" do
      // caminho sale.create — atômico via Counter).
      const number = await getNextSequence(companyId, "sale", tx);

      // 9.1. Criar Sale
      const sale = await tx.sale.create({
        data: {
          companyId,
          number,
          customerId: quote.customerId,
          branchId,
          sellerUserId: userId,
          subtotal: quote.subtotal,
          discountTotal: quote.discountTotal,
          total: quote.total,
          status: "COMPLETED",
          completedAt: new Date(),
          convertedFromQuoteId: quoteId, // ✅ Link bidirecional + @unique impede dupla conversão
        },
      });

      // 9.2. Criar SaleItems com costPrice (paridade com sale.create)
      for (const item of quote.items) {
        const itemCostPrice = item.product?.costPrice
          ? Number(item.product.costPrice)
          : 0;
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount,
            lineTotal: item.total,
            costPrice: itemCostPrice,
          },
        });
      }

      // 9.3. Estoque atomic + StockMovement (helper)
      await applyStockDebitInTx(tx, {
        sale: { id: sale.id, branchId, companyId },
        items: quote.items.map((i) => ({ productId: i.productId, qty: i.qty })),
        userId,
        // A5: propaga o override do gerente — se o estoque mudou entre o PDV e a
        // conversão, o gerente pode autorizar a venda negativa (espelha sale.service).
        allowNegative: overrideAllows(override, "INSUFFICIENT_STOCK"),
      });

      // 9.4. SalePayments + auto-fee + CashMovement (filtrado IN_CASH) + AR + CR (helper)
      await applyPaymentsInTx(tx, {
        sale: { id: sale.id, number: sale.number, branchId, companyId },
        payments,
        userId,
        openShiftId: openShift.id,
        customerId: quote.customerId,
        companySettings,
        note: `Venda #${sale.id.substring(0, 8)} (convertida de orçamento #${quoteId.substring(0, 8)})`,
      });

      // 9.5. Comissão (helper)
      await applyCommissionInTx(tx, {
        sale: { id: sale.id, companyId, total: sale.total },
        sellerUserId: userId,
      });

      // 9.6. FinanceEntry / DRE (helper — log estruturado, não bloqueia)
      await applyFinanceEntriesInTx(tx, {
        saleId: sale.id,
        companyId,
      });

      // 9.7. Atualizar orçamento → CONVERTED + link bidirecional
      const updatedQuote = await tx.quote.update({
        where: { id: quoteId },
        data: {
          status: "CONVERTED",
          convertedToSaleId: sale.id,
          convertedAt: new Date(),
          convertedByUserId: userId,
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

      // 9.8. Buscar venda completa para retorno
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
    }, {
      // timeout=30s — paridade com sale.create. applyFinanceEntriesInTx faz
      // muitas queries dentro da tx; default 5s estoura sob latência alta.
      maxWait: 10_000,
      timeout: 30_000,
    });

    // Resultado da auto-geração de OS (anexado ao retorno p/ a UI avisar).
    // null = venda não criada; created:false + reason = OS não nasceu (ex: lente sem cliente).
    let serviceOrder: { created: boolean; serviceOrderId: string | null; number: number | null; reason: string | null } | null = null;

    // 10. Side-effects pós-commit (cashback ganho + campanhas + lembrete) — helper
    if (result.sale) {
      await applyPostCommitSideEffects({
        saleId: result.sale.id,
        customerId: quote.customerId,
        branchId,
        companyId,
        total: Number(result.sale.total),
        // NOVAS conversões geram cashback normalmente.
        // Apenas o script de migração de vendas órfãs antigas (fix-bug1-orphan-quotes.ts)
        // passa skipCashbackEarn=true para não dar cashback retroativo confuso ao cliente.
        skipCashbackEarn: false,
      });

      // Auditoria do override de gerente na conversão.
      if (override && overrideApproverName) {
        await prisma.activityLog
          .create({
            data: {
              companyId,
              type: "DATA_UPDATED",
              title: "Conversão de orçamento liberada pelo operador (override)",
              detail: {
                kind: "quote_convert_manager_override",
                saleId: result.sale.id,
                quoteId,
                approvedByUserId: override.approvedByUserId,
                approverName: overrideApproverName,
                reasons: override.reasons,
                convertedByUserId: userId,
              },
              actorId: override.approvedByUserId,
              actorType: "CLIENT",
            },
          })
          .catch(() => {
            // Auditoria nunca bloqueia a conversão.
          });
      }

      // 11. Auto-gerar Ordem de Serviço se a venda convertida tiver lente (pós-commit).
      // Paridade com sale.service.create — sem isto, converter um orçamento com
      // lente não gerava a OS automática (só a venda direta gerava). Falha aqui
      // não reverte a conversão; o usuário pode gerar a OS manualmente depois.
      // Import dinâmico evita ciclo quote.service <-> service-order.service.
      //
      // serviceOrder é anexado ao retorno para a UI poder avisar quando a OS NÃO
      // nasceu (ex: orçamento de lente sem cliente vinculado, ou item avulso sem
      // produto) — sem isto, a falha era silenciosa e o usuário não sabia.
      try {
        const { serviceOrderService } = await import("@/services/service-order.service");
        const osResult = await serviceOrderService.createFromSale(result.sale.id, companyId, userId);
        serviceOrder = { created: osResult.created, serviceOrderId: osResult.serviceOrderId, number: osResult.number, reason: null };
        if (osResult.created) {
          log.info("OS gerada automaticamente da conversão de orçamento", { saleId: result.sale.id, quoteId, serviceOrderId: osResult.serviceOrderId, number: osResult.number });
        }
      } catch (osError) {
        const isValidationError = osError instanceof AppError && osError.statusCode === 400;
        const reason = osError instanceof AppError ? osError.message : "Erro ao gerar a Ordem de Serviço.";
        serviceOrder = { created: false, serviceOrderId: null, number: null, reason };
        if (isValidationError) {
          log.warn("OS não gerada automaticamente da conversão", { saleId: result.sale.id, motivo: osError.message });
        } else {
          log.error("Falha ao gerar OS automática da conversão", { saleId: result.sale.id, err: String(osError) });
        }
      }
    }

    return { ...result, serviceOrder };
  }
}

export const quoteService = new QuoteService();
