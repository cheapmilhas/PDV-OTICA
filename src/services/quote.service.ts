import { prisma } from "@/lib/prisma";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { Prisma } from "@prisma/client";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { PaymentDTO } from "@/lib/validations/sale.schema";
import type { QuoteQuery } from "@/lib/validations/quote.schema";
import { validateQuotePayments } from "@/lib/validations/quote.schema";

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
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build where clause
    const where: Prisma.QuoteWhereInput = {
      companyId,
      ...(status === "ativos" && { status: { notIn: ["CANCELED", "EXPIRED"] } }),
      ...(status === "inativos" && { status: { in: ["CANCELED", "EXPIRED"] } }),
      ...(quoteStatus && { status: quoteStatus }),
      ...(customerId && { customerId }),
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
              qty: true,
              unitPrice: true,
              discount: true,
              lineTotal: true,
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
            lineTotal: item.lineTotal,
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

        // 7.5. Criar CashMovement para pagamentos em dinheiro
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
              note: `Venda #${sale.id.substring(0, 8)} (convertida de orçamento #${quoteId.substring(0, 8)})`,
            },
          });
        }
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
