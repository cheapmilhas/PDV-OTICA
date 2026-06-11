import { prisma } from "@/lib/prisma";
import { Sale, SaleItem, SalePayment, Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { notFoundError, AppError, ERROR_CODES, businessRuleError } from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { SaleQuery, CreateSaleDTO } from "@/lib/validations/sale.schema";
import { validateCreditLimit, sumOnCreditAmount } from "@/lib/installment-utils";
import { validateStoreCredit } from "@/lib/validations/sale.schema";
import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";
import { METHODS_IN_CASH } from "@/lib/payment-methods";
import { validateBranchOwnership } from "@/lib/validate-branch";
import { assertValidManagerOverride, overrideAllows } from "@/lib/manager-override";
import { atomicStockDebit } from "@/services/stock.service";
import { getNextSequence } from "@/lib/counter";
import { shouldRestockOnCancel } from "@/lib/stock-operation";
import { reverseBonusForSale, reactivateBonusForSale } from "@/services/product-campaign.service";
import {
  applyStockDebitInTx,
  applyPaymentsInTx,
  applyCashbackUsageInTx,
  applyCommissionInTx,
  applyFinanceEntriesInTx,
  applyPostCommitSideEffects,
  reverseCommissionForSaleInTx,
  reverseCashbackForSaleInTx,
} from "@/services/sale-side-effects.service";
import { getProductPrice } from "@/lib/product-price";
import { calculateTotals, itemLineTotal } from "@/lib/sale-totals";
import { assertSalePricing, discountRuleKeyForRole } from "@/lib/sale-price-guard";
import { SystemRuleService } from "@/services/system-rule.service";

const log = logger.child({ service: "sale" });

const systemRuleService = new SystemRuleService();

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
  async list(query: SaleQuery, companyId: string, branchId?: string | null) {
    const {
      search = "",
      page = 1,
      pageSize = 20,
      status = "ativos",
      customerId,
      sellerUserId,
      startDate,
      endDate,
      paymentMethod,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build where clause
    const where: Prisma.SaleWhereInput = {
      companyId,
      ...(branchId && { branchId }),
      ...(status === "ativos" && { status: { notIn: ["CANCELED", "REFUNDED"] } }),
      ...(status === "inativos" && { status: { in: ["CANCELED", "REFUNDED"] } }),
      ...(customerId && { customerId }),
      ...(sellerUserId && { sellerUserId }),
      ...(paymentMethod && {
        payments: {
          some: { method: paymentMethod },
        },
      }),
    };

    // Filtro de data (combinar startDate e endDate no mesmo objeto)
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

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
    const [data, total, aggregate] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          branch: {
            select: { id: true, name: true },
          },
          customer: {
            select: { id: true, name: true, cpf: true, phone: true },
          },
          sellerUser: {
            select: { id: true, name: true },
          },
          payments: {
            select: {
              id: true,
              method: true,
              amount: true,
              installments: true,
            },
          },
          serviceOrder: {
            select: { id: true, number: true },
          },
          _count: {
            select: { items: true, payments: true },
          },
        },
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where,
        _sum: { total: true },
      }),
    ]);

    const pagination = createPaginationMeta(page, pageSize, total);

    return { data, pagination, totalAmount: Number(aggregate._sum.total || 0) };
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
                stockControlled: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        payments: {
          orderBy: { createdAt: "asc" },
        },
        serviceOrder: {
          select: { id: true, number: true, status: true },
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
    const { customerId, branchId, items, payments, discount = 0, cashbackUsed = 0, notes, sellerUserId, serviceOrderId, override } = data;

    // Validação de segurança: branchId deve pertencer à empresa do usuário
    await validateBranchOwnership(branchId, companyId);

    // H10: sellerUserId vem do request. Sem validar, dá pra forjar comissão
    // atribuindo a venda a qualquer userId (inclusive de OUTRA empresa). Só
    // aceita se o vendedor pertence à mesma empresa; senão cai no userId logado.
    let effectiveSellerId = userId;
    if (sellerUserId && sellerUserId !== userId) {
      const seller = await prisma.user.findFirst({
        where: { id: sellerUserId, companyId },
        select: { id: true },
      });
      if (!seller) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Vendedor inválido para esta empresa",
          400,
        );
      }
      effectiveSellerId = sellerUserId;
    }

    // Se há override de gerente, re-validar no servidor que o autorizador é
    // ADMIN/GERENTE da empresa (nunca confiar só no que o cliente enviou).
    let overrideApproverName: string | null = null;
    if (override) {
      const { approverName } = await assertValidManagerOverride(override, companyId);
      overrideApproverName = approverName;
    }

    // H5: serviceOrderId vem do request e era gravado cru. Sem validar, dá
    // pra vincular a venda a uma OS de OUTRA empresa, já entregue/cancelada,
    // ou de garantia (que não deve gerar cobrança). Valida empresa + status
    // convertível antes de aceitar o vínculo.
    if (serviceOrderId) {
      // A FK serviceOrderId mora em Sale; em ServiceOrder a relação é o lado
      // inverso `sale` (Sale?). Pra saber se a OS já tem venda, checa `sale`.
      const linkedOrder = await prisma.serviceOrder.findFirst({
        where: { id: serviceOrderId, companyId },
        select: { id: true, status: true, sale: { select: { id: true } } },
      });
      if (!linkedOrder) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Ordem de serviço inválida para esta empresa",
          400,
        );
      }
      if (linkedOrder.sale) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Esta ordem de serviço já está vinculada a outra venda",
          400,
        );
      }
      if (["DELIVERED", "CANCELED"].includes(linkedOrder.status)) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Ordem de serviço entregue ou cancelada não pode gerar venda",
          400,
        );
      }
    }

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

    // TEC-06/BUG-02: cálculo via helper único (decimal.js). Paridade comprovada
    // com a fórmula float anterior (ver sale-totals.test.ts).
    const totals = calculateTotals({ items, discount, cashbackUsed });
    const subtotal = totals.subtotal;

    // Validação: desconto não pode ser maior que o subtotal
    if (discount > subtotal) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Desconto (R$ ${discount.toFixed(2)}) não pode ser maior que o subtotal da venda (R$ ${subtotal.toFixed(2)})`,
        400
      );
    }

    const total = totals.total;

    // Validação: cashback não pode ser maior que o total
    if (cashbackUsed > total) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Cashback usado (R$ ${cashbackUsed.toFixed(2)}) não pode ser maior que o total da venda (R$ ${total.toFixed(2)})`,
        400
      );
    }

    // Validar saldo de cashback se estiver usando
    if (cashbackUsed > 0 && customerId) {
      const cashback = await prisma.customerCashback.findUnique({
        where: {
          customerId_branchId: {
            customerId,
            branchId,
          },
        },
      });

      if (!cashback || Number(cashback.balance) < cashbackUsed) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Saldo de cashback insuficiente. Disponível: R$ ${cashback ? Number(cashback.balance).toFixed(2) : '0.00'}`,
          400
        );
      }
    }

    const totalAfterCashback = totals.totalAfterCashback;

    // Validação: soma de pagamentos = total após cashback
    const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentTotal - totalAfterCashback) > 0.01) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Soma dos pagamentos (R$ ${paymentTotal.toFixed(2)}) deve ser igual ao total da venda após cashback (R$ ${totalAfterCashback.toFixed(2)})`,
        400
      );
    }

    // Verificar estoque (bulk fetch — substitui N+1)
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        stockQty: true,
        companyId: true,
        stockControlled: true,
        // Grupo D: preços de referência para validar fraude de preço.
        costPrice: true,
        salePrice: true,
        promoPrice: true,
      },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    // Override por filial (BranchStock pode ter preço próprio).
    const branchStocks = await prisma.branchStock.findMany({
      where: { branchId, productId: { in: productIds } },
      select: { productId: true, costPrice: true, salePrice: true, promoPrice: true },
    });
    const branchStockByProduct = new Map(
      branchStocks.map((bs) => [bs.productId, bs])
    );

    for (const item of items) {
      const product = productById.get(item.productId);

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

      // Só valida estoque para produtos com controle de estoque ativo.
      // O operador pode liberar a venda mesmo sem estoque (gera estoque negativo)
      // confirmando o alerta — fica registrado no nome dele (override).
      if (
        product.stockControlled &&
        product.stockQty < item.qty &&
        !overrideAllows(override, "INSUFFICIENT_STOCK")
      ) {
        throw new AppError(
          ERROR_CODES.INSUFFICIENT_STOCK,
          `Estoque insuficiente para ${product.name}. Disponível: ${product.stockQty}, Solicitado: ${item.qty}`,
          400
        );
      }
    }

    // Grupo D: anti-fraude de preço. Valida que nenhum item vende abaixo do
    // custo nem excede o teto de desconto do papel do operador. Negativas são
    // autorizáveis por gerente (mesmo fluxo de override).
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
      items: items.map((item) => {
        const product = productById.get(item.productId)!;
        const branchStock = branchStockByProduct.get(item.productId);
        const resolved = getProductPrice(product, branchStock);
        const referencePrice = resolved.promoPrice ?? resolved.salePrice;
        if (referencePrice <= 0 && resolved.costPrice <= 0) {
          log.warn("Produto sem preço/custo cadastrado — venda sem guarda de preço", {
            productId: item.productId,
            productName: product.name,
            companyId,
          });
        }
        return {
          productId: item.productId,
          productName: product.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          itemDiscount: item.discount || 0,
          // Referência = promo se houver, senão preço de venda.
          referencePrice,
          costPrice: resolved.costPrice,
        };
      }),
      saleDiscount: discount,
      maxDiscountPercent,
      override,
    });

    // Validar crediário e saldo a receber (cliente obrigatório + limite de crédito)
    //
    // Decisão (Matheus, 2026-05-06): BALANCE_DUE também passa por validateCreditLimit.
    // Razão: BALANCE_DUE é venda a prazo igual STORE_CREDIT — cliente inadimplente
    // não deve burlar a validação só trocando o método. Bloqueio por inadimplência
    // (overdue_days_to_block) também se aplica a BALANCE_DUE.
    //
    // Diferença: BALANCE_DUE é parcela única vinculada à entrega da OS, então
    // a checagem é a mesma de STORE_CREDIT (totalOpen + requested > limite).
    // Validações por pagamento (estrutura/cliente obrigatório).
    for (const payment of payments) {
      if (payment.method === "STORE_CREDIT") {
        validateStoreCredit(payment, customerId);
      }

      // Saldo a Receber: cliente obrigatório (paga ao receber o produto)
      if (payment.method === "BALANCE_DUE" && !customerId) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Saldo a Receber exige um cliente vinculado",
          400
        );
      }
    }

    // H2: limite de crédito validado pela SOMA dos pagamentos a prazo, não por
    // pagamento isolado. Antes, 2 métodos a prazo (STORE_CREDIT + BALANCE_DUE)
    // eram checados separadamente contra o mesmo totalOpen do banco → cada um
    // passava abaixo do limite, mas a soma estourava. Agora agrega de uma vez.
    const onCreditAmount = sumOnCreditAmount(payments);

    if (onCreditAmount > 0 && customerId) {
      const creditCheck = await validateCreditLimit(
        customerId,
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

    // Verificar/Criar caixa aberto (auto-abertura se necessário)
    let openShift = await prisma.cashShift.findFirst({
      where: { branchId, status: "OPEN" },
    });

    // Se não houver caixa aberto, criar automaticamente.
    // O try/catch garante que falhas aqui sejam visíveis (antes eram silenciosas
    // e a venda prosseguia sem CashMovement, causando "nada entrou no caixa").
    if (!openShift) {
      try {
        const branch = await prisma.branch.findUnique({
          where: { id: branchId },
          select: { companyId: true },
        });
        if (!branch) {
          throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Filial não encontrada", 400);
        }

        // Vincular ao primeiro CashRegister (terminal físico) ativo da filial,
        // se houver. Hoje turnos auto-criados ficavam com cashRegisterId null.
        const defaultRegister = await prisma.cashRegister.findFirst({
          where: { branchId, active: true },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

        openShift = await prisma.cashShift.create({
          data: {
            companyId: branch.companyId,
            branchId,
            openedByUserId: userId,
            openingFloatAmount: 0,
            status: "OPEN",
            openedAt: new Date(),
            ...(defaultRegister && { cashRegisterId: defaultRegister.id }),
          },
        });

        // Auditoria — registra a auto-abertura para que admins possam rastrear
        // turnos que não foram abertos manualmente.
        await prisma.activityLog
          .create({
            data: {
              companyId: branch.companyId,
              type: "DATA_UPDATED",
              title: "Turno de caixa auto-aberto",
              detail: {
                kind: "cash_shift_auto_opened",
                shiftId: openShift.id,
                branchId,
                cashRegisterId: defaultRegister?.id ?? null,
                triggeredBy: "sale.service.createSale",
              },
              actorId: userId,
              actorType: "CLIENT",
            },
          })
          .catch((auditErr) => {
            // Log de auditoria nunca deve impedir a venda — apenas registramos.
            log.error("Falha ao gravar ActivityLog de auto-abertura", { err: String(auditErr) });
          });
      } catch (autoOpenErr) {
        // M1: corrida de auto-abertura. Duas vendas simultâneas na mesma filial
        // sem caixa: ambas passam o findFirst e tentam create; a 2ª viola o
        // índice único parcial CashShift_branchId_open_unique (P2002) e a venda
        // quebrava com 500. Aqui, no P2002, o concorrente JÁ criou o caixa —
        // rebuscamos o shift OPEN e seguimos normalmente.
        if (
          autoOpenErr instanceof Prisma.PrismaClientKnownRequestError &&
          autoOpenErr.code === "P2002"
        ) {
          openShift = await prisma.cashShift.findFirst({
            where: { branchId, status: "OPEN" },
          });
          if (openShift) {
            log.info("Auto-abertura: corrida resolvida, usando caixa do concorrente", {
              branchId,
              shiftId: openShift.id,
            });
          }
        }

        if (!openShift) {
          log.error("Falha na auto-abertura de CashShift", {
            branchId,
            userId,
            error: autoOpenErr instanceof Error ? autoOpenErr.message : String(autoOpenErr),
          });
          // Re-lança para que o usuário veja a mensagem (antes a falha era silenciosa
          // e a venda era criada sem CashMovement).
          throw autoOpenErr instanceof AppError
            ? autoOpenErr
            : new AppError(
                ERROR_CODES.INTERNAL_ERROR,
                "Não foi possível abrir o caixa automaticamente para registrar a venda. Abra o caixa manualmente e tente novamente.",
                500,
              );
        }
      }
    }

    // Buscar configurações de juros/multa padrão para crediário
    const companySettings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { defaultFinePercent: true, defaultInterestPercent: true, defaultGraceDays: true },
    });

    // Criar venda em transação (venda + itens + pagamentos + cashMovement + estoque)
    // Refatorado para usar helpers compartilhados em sale-side-effects.service.ts
    // (mesmos side-effects são reusados em quote.service.ts:convertToSale).
    // timeout=30s: applyFinanceEntriesInTx faz 6-12 queries sequenciais
    // (chartOfAccounts.findUnique + financeEntry.upsert) que estouravam o
    // default 5s sob latência alta (Neon US-East), causando P2028 e rollback
    // silencioso da venda. Mantido até que finance-entries saia da transação.
    const sale = await prisma.$transaction(async (tx) => {
      // 0. Número sequencial de venda por empresa (atômico via Counter key "sale").
      const number = await getNextSequence(companyId, "sale", tx);

      // 1. Criar venda
      const newSale = await tx.sale.create({
        data: {
          companyId,
          number,
          customerId,
          branchId,
          sellerUserId: effectiveSellerId,
          ...(serviceOrderId && { serviceOrderId }),
          subtotal,
          discountTotal: discount,
          cashbackUsed,
          total,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      // 2. Buscar custo dos produtos para gravar no SaleItem (margem em relatórios)
      const productIds = items.map((i) => i.productId).filter(Boolean);
      const productsWithCost = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, costPrice: true },
      });
      // costPrice no schema é Decimal NÃO-nullable (default 0), mas defendemos
      // contra registros legados ou cast errado mantendo null como sinal.
      const costMap = new Map(
        productsWithCost.map((p) => [p.id, p.costPrice == null ? null : Number(p.costPrice)]),
      );

      // 3. Criar SaleItems via createMany (Q7.3 P2-5: 1 query em vez de N).
      // Antes: N `tx.saleItem.create` sequenciais (N round-trips na TX).
      // Agora: 1 round-trip via createMany — em vendas com 5+ itens reduz
      // ~80% do tempo na fase de criação.
      const saleItemsData = items.map((item) => {
        const itemTotal = itemLineTotal(item);
        let itemCostPrice = 0;
        if (item.productId) {
          if (!costMap.has(item.productId)) {
            throw businessRuleError(
              `Produto ${item.productId} não encontrado ao calcular custo. Recarregue o carrinho.`,
            );
          }
          const cost = costMap.get(item.productId);
          if (cost == null) {
            log.warn("Produto sem costPrice — margem ficará distorcida", {
              productId: item.productId,
              saleId: newSale.id,
            });
          } else {
            itemCostPrice = cost;
          }
        }
        return {
          saleId: newSale.id,
          productId: item.productId,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          lineTotal: itemTotal,
          costPrice: itemCostPrice,
        };
      });
      await tx.saleItem.createMany({ data: saleItemsData });

      // 4. Estoque atomic + StockMovement (helper)
      // G1: se o gerente autorizou venda sem estoque (override INSUFFICIENT_STOCK),
      // o débito permite estoque negativo — senão o débito atômico falharia e
      // abortaria a venda, tornando o override inútil.
      await applyStockDebitInTx(tx, {
        sale: { id: newSale.id, branchId, companyId },
        items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        userId,
        allowNegative: overrideAllows(override, "INSUFFICIENT_STOCK"),
      });

      // 5. SalePayments + auto-fee + CashMovement (filtrado) + AR + CR (helper)
      await applyPaymentsInTx(tx, {
        sale: { id: newSale.id, number: newSale.number, branchId, companyId },
        payments,
        userId,
        openShiftId: openShift.id,
        customerId,
        companySettings,
      });

      // 6. Debitar cashback usado (helper)
      if (cashbackUsed > 0 && customerId) {
        await applyCashbackUsageInTx(tx, {
          sale: { id: newSale.id, branchId },
          customerId,
          cashbackUsed,
          userId,
        });
      }

      // 7. Comissão (helper)
      await applyCommissionInTx(tx, {
        sale: { id: newSale.id, companyId, total: newSale.total },
        sellerUserId: effectiveSellerId,
      });

      // 8. FinanceEntry / DRE (helper — log estruturado, não bloqueia)
      await applyFinanceEntriesInTx(tx, {
        saleId: newSale.id,
        companyId,
      });

      return newSale;
    }, {
      maxWait: 10_000,
      timeout: 30_000,
    });

    // 9. Side-effects pós-commit (cashback ganho + campanhas + lembrete) — helper
    await applyPostCommitSideEffects({
      saleId: sale.id,
      customerId,
      branchId,
      companyId,
      total,
      // Em vendas novas (PDV direto), gera cashback normalmente.
      skipCashbackEarn: false,
    });

    // Auditoria do override de gerente — rastreia quem autorizou e o quê.
    if (override && overrideApproverName) {
      await prisma.activityLog
        .create({
          data: {
            companyId,
            type: "DATA_UPDATED",
            title: "Venda liberada pelo operador (override)",
            detail: {
              kind: "sale_manager_override",
              saleId: sale.id,
              approvedByUserId: override.approvedByUserId,
              approverName: overrideApproverName,
              reasons: override.reasons,
              soldByUserId: userId,
            },
            actorId: override.approvedByUserId,
            actorType: "CLIENT",
          },
        })
        .catch((auditErr) => {
          log.error("Falha ao gravar ActivityLog de override", { err: String(auditErr) });
        });
    }

    // 10. Auto-gerar Ordem de Serviço se a venda tiver lente (pós-commit).
    // NUNCA dentro da transação da venda — falha aqui não pode reverter a venda.
    // Import dinâmico evita ciclo sale.service <-> service-order.service.
    try {
      const { serviceOrderService } = await import("@/services/service-order.service");
      const osResult = await serviceOrderService.createFromSale(sale.id, companyId, userId);
      if (osResult.created) {
        log.info("OS gerada automaticamente da venda", { saleId: sale.id, serviceOrderId: osResult.serviceOrderId, number: osResult.number });
      }
    } catch (osError) {
      // Venda já está concluída — a OS é side-effect. Falha não bloqueia a venda;
      // o usuário pode gerar a OS manualmente depois pelo botão na venda.
      // Venda de lente sem cliente (gating do PDV burlado) é caso esperado → warn,
      // não error, para não poluir o monitoramento.
      const isValidationError = osError instanceof AppError && osError.statusCode === 400;
      if (isValidationError) {
        log.warn("OS não gerada automaticamente", { saleId: sale.id, motivo: osError.message });
      } else {
        log.error("Falha ao gerar OS automática da venda", { saleId: sale.id, err: String(osError) });
      }
    }

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

      // 2. Estornar estoque de cada item e registrar movimentação
      for (const item of sale.items) {
        if (item.productId) {
          // Simetria com o débito da venda: produto NÃO-controlado nunca baixou
          // estoque na venda (atomicStockDebit pula !stockControlled), logo o
          // cancelamento NÃO pode creditar — senão o saldo sobe acima do original
          // (bug T7: estoque 34 → 35 após estornar uma venda de produto sem
          // controle). Decisão em shouldRestockOnCancel (lógica pura testada).
          const isStockControlled = shouldRestockOnCancel(item.product?.stockControlled ?? false);

          if (isStockControlled) {
            // Devolver ao BranchStock da filial da venda
            await tx.branchStock.upsert({
              where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
              create: { branchId: sale.branchId, productId: item.productId, quantity: item.qty },
              update: { quantity: { increment: item.qty } },
            });

            // Atualizar cache Product.stockQty
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockQty: {
                  increment: item.qty,
                },
              },
            });
          }

          // Q4.2: Reverter consumo FIFO — devolve quantidade aos InventoryLots
          // de origem e apaga o registro de consumo (SaleItemLot). Mantém o
          // custo histórico íntegro; a próxima venda volta a consumir o lote
          // mais antigo (acquiredAt ASC).
          const lotConsumptions = await tx.saleItemLot.findMany({
            where: { saleItemId: item.id },
          });
          for (const c of lotConsumptions) {
            await tx.inventoryLot.update({
              where: { id: c.inventoryLotId },
              data: { qtyRemaining: { increment: c.qtyConsumed } },
            });
          }
          if (lotConsumptions.length > 0) {
            await tx.saleItemLot.deleteMany({
              where: { saleItemId: item.id },
            });
          }

          // Registrar movimentação de estorno (só para item controlado: produto
          // sem controle não teve saída física registrada na venda, então não
          // há entrada a estornar — o StockMovement seguiria a mesma simetria).
          if (isStockControlled) {
            await tx.stockMovement.create({
              data: {
                companyId: sale.companyId,
                branchId: sale.branchId,
                productId: item.productId,
                type: "CUSTOMER_RETURN",
                quantity: item.qty, // Positivo = entrada de estoque
                notes: `Estorno por cancelamento de venda #${id.substring(0, 8)}${reason ? ` - ${reason}` : ""}`,
              },
            });
          }
        }
      }

      // 3. Deletar CardReceivable da venda (cartão de crédito)
      await tx.cardReceivable.deleteMany({
        where: { saleId: id },
      });

      // 3a. Marcar pagamentos como cancelados e criar REFUND apenas para pagamentos à vista
      const methodsComCaixa: readonly string[] = METHODS_IN_CASH;
      for (const payment of sale.payments) {
        await tx.salePayment.update({
          where: { id: payment.id },
          data: { status: "VOIDED" },
        });

        // CashMovement REFUND apenas para métodos que geraram entrada no caixa
        if (openShift && methodsComCaixa.includes(payment.method)) {
          await tx.cashMovement.create({
            data: {
              cashShiftId: openShift.id,
              branchId: sale.branchId,
              type: "REFUND",
              direction: "OUT",
              method: payment.method,
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

      // 4. Cancelar parcelas em Contas a Receber (crediário / saldo a receber)
      await tx.accountReceivable.updateMany({
        where: {
          saleId: id,
          status: { in: ["PENDING", "OVERDUE"] },
        },
        data: {
          status: "CANCELED",
        },
      });

      // 5. Q4.1: Reverter comissões — PENDING/APPROVED viram CANCELED;
      // PAID gera lançamento negativo no período atual (vendedor já recebeu).
      const commissionResult = await reverseCommissionForSaleInTx(tx, {
        saleId: id,
        companyId: sale.companyId,
      });
      if (commissionResult.compensated > 0) {
        log.warn("Comissões PAID estornadas via lançamento negativo", {
          saleId: id,
          compensated: commissionResult.compensated,
          reversed: commissionResult.reversed,
        });
      }

      // 6. Reverter lançamentos financeiros (FinanceEntry)
      // Deleta todos os lançamentos vinculados a esta venda e seus pagamentos
      await tx.financeEntry.deleteMany({
        where: {
          companyId: sale.companyId,
          OR: [
            { sourceType: "Sale", sourceId: id },
            { sourceType: "SalePayment", sourceId: { in: sale.payments.map((p: any) => p.id) } },
            { sourceType: "SaleItem", sourceId: { in: sale.items.map((i: any) => i.id) } },
          ],
        },
      });

      // 7. Reverter saldo das contas financeiras (FinanceAccount)
      for (const payment of sale.payments) {
        if (methodsComCaixa.includes(payment.method) || payment.method === "CREDIT_CARD") {
          // Buscar a FinanceEntry que incrementou o saldo
          // Para pagamentos à vista: decrementar o saldo que foi incrementado
          const faType = payment.method === "CASH" ? "CASH" : payment.method === "PIX" ? "PIX" : "CARD_ACQUIRER";
          const fa = await tx.financeAccount.findFirst({
            where: { companyId: sale.companyId, type: faType as any, active: true },
          });
          if (fa) {
            await tx.financeAccount.update({
              where: { id: fa.id },
              data: { balance: { decrement: Number(payment.amount) } },
            });
          }
        }
      }

      // 8. B2/B3: Reverter TODO o cashback (ganho + usado) DENTRO da transação,
      // de forma idempotente. Antes só o ganho era estornado, fora da tx e sem
      // guard (cancel→reativar→cancel duplicava; o usado nunca voltava).
      if (sale.customerId) {
        await reverseCashbackForSaleInTx(tx, {
          saleId: id,
          cashbackUsed: Number(sale.cashbackUsed ?? 0),
        });
      }

      // 8b. B5: Cancelar a OS auto-criada vinculada — não deve seguir no
      // laboratório (produziria óculos de venda cancelada).
      if (sale.serviceOrderId) {
        await tx.serviceOrder.updateMany({
          where: { id: sale.serviceOrderId, companyId, status: { notIn: ["DELIVERED", "CANCELED"] } },
          data: { status: "CANCELED", canceledAt: new Date() },
        });
      }
    }, { timeout: 30_000 });

    // 9. Cancelar lembrete pós-venda (se existir)
    //
    // BUG (caso Andrea, 2026-05-30): o lembrete ficava na tela após cancelar a
    // venda. Causa: o cleanup só cancelava PENDING/SCHEDULED, mas a CRIAÇÃO
    // considera "ativo" também IN_PROGRESS (sale-side-effects:649). Se um
    // atendente já tinha "pego" o lembrete (→ IN_PROGRESS), ele ficava órfão.
    // Agora cobrimos os 3 status e logamos falhas em vez de engolir.
    if (sale.customerId) {
      try {
        const result = await prisma.customerReminder.updateMany({
          where: {
            companyId,
            customerId: sale.customerId,
            segment: "POST_SALE_30_DAYS",
            status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] },
          },
          data: { status: "CANCELLED" },
        });
        if (result.count > 0) {
          log.info("Lembrete pós-venda cancelado", { saleId: id, customerId: sale.customerId, count: result.count });
        }
      } catch (reminderError) {
        log.error("Erro ao cancelar lembrete pós-venda", { saleId: id, err: String(reminderError) });
      }
    }

    // 10. Reverter bônus de campanhas (se aplicável)
    try {
      await reverseBonusForSale(id, companyId);
    } catch (campaignError) {
      log.error("Erro ao reverter bônus de campanhas", { saleId: id, err: String(campaignError) });
    }

    return this.getById(id, companyId, true);
  }

  /**
   * Devolução TOTAL de uma venda (refund).
   *
   * Reusa toda a reversão robusta do cancel (estoque+FIFO, CardReceivable,
   * AccountReceivable, CashMovement OUT, comissão, FinanceEntry, FinanceAccount,
   * cashback ganho, lembrete, bônus de campanha) e ADICIONA o que faltava:
   *  - status REFUNDED (não CANCELED)
   *  - registro Refund + RefundItem (rastreabilidade + método de reembolso)
   *  - estorno do cashback USADO pelo cliente (devolve saldo)
   *  - cancelamento da OS vinculada (não vai pro laboratório)
   *
   * Decisão (Matheus 2026-05-30): a devolução é sempre TOTAL; troca = venda nova
   * + entrada manual de estoque. Por isso reusamos o cancel.
   */
  async refundFull(
    id: string,
    companyId: string,
    opts: { reason?: string; refundMethod?: string } = {}
  ) {
    const sale = await this.getById(id, companyId);

    if (sale.status === "REFUNDED" || sale.status === "CANCELED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Esta venda já foi devolvida ou cancelada.",
        400
      );
    }

    // Custo via FIFO (lotConsumptions) com fallback p/ costPrice. getById não
    // traz lotConsumptions, então buscamos aqui.
    const lots = await prisma.saleItemLot.findMany({
      where: { saleItem: { saleId: id } },
      select: { saleItemId: true, totalCost: true },
    });
    const costBySaleItem = new Map<string, number>();
    for (const l of lots) {
      costBySaleItem.set(l.saleItemId, (costBySaleItem.get(l.saleItemId) ?? 0) + Number(l.totalCost));
    }

    // Itens da devolução (total). discount é o total da linha → discount/qty = por unidade.
    const refundItemsData = sale.items.map((it: any) => {
      const unit = Number(it.unitPrice) - Number(it.discount || 0) / it.qty;
      const refundAmount = Math.round(unit * it.qty * 100) / 100;
      const costAmount = costBySaleItem.get(it.id) ?? Number(it.costPrice || 0) * it.qty;
      return { saleItemId: it.id, qtyReturned: it.qty, refundAmount, costAmount };
    });
    const totalRefund = refundItemsData.reduce((s, r) => s + r.refundAmount, 0);
    const totalCost = refundItemsData.reduce((s, r) => s + r.costAmount, 0);

    // 1. Cria o registro Refund (PENDING) ANTES de reverter — garante rastro
    // mesmo se algo falhar no meio (não há split-brain "revertido sem Refund").
    const refund = await prisma.refund.create({
      data: {
        companyId,
        branchId: sale.branchId,
        saleId: id,
        customerId: sale.customerId,
        status: "PENDING",
        reason: opts.reason || "Devolução",
        totalRefund,
        totalCost,
        refundMethod: opts.refundMethod || "CASH",
        items: { create: refundItemsData },
      },
    });

    // 2. Reversão pesada: reusa o cancel (robustez já testada em produção).
    await this.cancel(id, companyId, opts.reason || "Devolução");

    // 3. Marca venda REFUNDED + Refund COMPLETED atomicamente.
    // Obs: a devolução do cashback USADO e o cancelamento da OS vinculada
    // já são feitos DENTRO do cancel() (B2/B5, idempotentes) — não repetir aqui.
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({ where: { id }, data: { status: "REFUNDED" } });
      await tx.refund.update({
        where: { id: refund.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }, { timeout: 30_000 });

    return this.getById(id, companyId, true);
  }

  /**
   * Reativa venda cancelada
   *
   * Reverte o cancelamento:
   * - Retira estoque novamente
   * - Reativa pagamentos no caixa
   * - Muda status para COMPLETED
   * - Valida estoque disponível
   */
  async reactivate(id: string, companyId: string, userId: string) {
    // 1. Buscar venda cancelada
    const sale = await this.getById(id, companyId, true);

    if (sale.status !== "CANCELED" && sale.status !== "REFUNDED") {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Apenas vendas canceladas podem ser reativadas",
        400
      );
    }

    // B1 (Grupo B): só reativa venda 100% à vista. O cancel() DELETA
    // fisicamente CardReceivable e FinanceEntry e zera o AccountReceivable —
    // a reativação não reconstrói esse estado, então uma venda a prazo
    // (crediário, saldo a receber, cartão, boleto, cheque, convênio) reativada
    // perderia as cobranças. Nesses casos, orienta-se refazer a venda.
    //
    // Allowlist (não blocklist): só CASH/PIX/DEBIT_CARD passam. Qualquer outro
    // método (CREDIT_CARD, BOLETO, STORE_CREDIT, BALANCE_DUE, CHEQUE,
    // AGREEMENT, OTHER) bloqueia — mais seguro contra métodos novos.
    const methodsInCash: readonly string[] = METHODS_IN_CASH;
    const hasReceivable = await prisma.accountReceivable.findFirst({
      where: { saleId: id },
      select: { id: true },
    });
    const hasNonCashMethod = sale.payments.some(
      (p: any) => !methodsInCash.includes(p.method)
    );
    if (hasReceivable || hasNonCashMethod) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Não é possível reativar uma venda a prazo (crediário, cartão, boleto, etc.), pois as parcelas e cobranças não são reconstruídas. Refaça a venda.",
        400
      );
    }

    // 2. Validar estoque disponível para todos os itens
    for (const item of sale.items) {
      if (item.product && item.product.type !== "SERVICE" && item.product.type !== "LENS_SERVICE") {
        const product = await prisma.product.findUnique({
          where: { id: item.product.id },
          select: { stockQty: true, stockControlled: true, name: true },
        });

        if (product?.stockControlled && product.stockQty < item.qty) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            `Estoque insuficiente para ${product.name}. Disponível: ${product.stockQty}, Necessário: ${item.qty}`,
            400
          );
        }
      }
    }

    // 3. Verificar se há caixa aberto (necessário para registrar pagamentos)
    const openShift = await prisma.cashShift.findFirst({
      where: {
        branchId: sale.branchId,
        status: "OPEN",
      },
    });

    if (!openShift) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "É necessário ter um caixa aberto para reativar a venda",
        400
      );
    }

    // 4. Realizar reativação em transação
    await prisma.$transaction(async (tx) => {
      // 4.1. Retirar estoque novamente
      for (const item of sale.items) {
        if (item.product && item.product.type !== "SERVICE" && item.product.type !== "LENS_SERVICE") {
          const product = await tx.product.findUnique({
            where: { id: item.product.id },
            select: { stockControlled: true },
          });

          if (product?.stockControlled) {
            const reactivateResult = await atomicStockDebit(item.product.id, item.qty, sale.companyId, tx, sale.branchId);
            if (!reactivateResult.success) {
              throw new AppError(
                ERROR_CODES.VALIDATION_ERROR,
                reactivateResult.error || "Estoque insuficiente para reativar venda",
                400
              );
            }

            // Registrar movimentação de estoque
            await tx.stockMovement.create({
              data: {
                companyId: sale.companyId,
                productId: item.product.id,
                sourceBranchId: sale.branchId,
                type: "SALE",
                quantity: -item.qty,
                reason: `Reativação venda #${id.substring(0, 8)}`,
                createdByUserId: userId,
              },
            });
          }
        }
      }

      // 4.2. Reativar status da venda
      await tx.sale.update({
        where: { id },
        data: {
          status: "COMPLETED",
        },
      });

      // 4.3. Criar movimentos de caixa para os pagamentos
      for (const payment of sale.payments) {
        await tx.cashMovement.create({
          data: {
            cashShiftId: openShift.id,
            branchId: sale.branchId,
            type: "SALE_PAYMENT",
            direction: "IN",
            method: payment.method as any,
            amount: payment.amount,
            originType: "SALE_PAYMENT",
            originId: payment.id,
            salePaymentId: payment.id,
            createdByUserId: userId,
            note: `Reativação venda #${id.substring(0, 8)}`,
          },
        });
      }

      // 4.4. Reativar comissões
      await tx.commission.updateMany({
        where: {
          saleId: id,
          status: "CANCELED",
        },
        data: {
          status: "PENDING",
        },
      });
    }, { timeout: 30_000 });

    // 5. B4: Reativar bônus de campanha — reverte o REVERSED→PENDING e
    // re-incrementa o progresso UMA vez. Antes chamava processaSaleForCampaigns,
    // que inflava o totalBonus do vendedor (entry REVERSED + progresso somado
    // de novo → bônus duplicado).
    try {
      await reactivateBonusForSale(id, companyId);
    } catch (campaignError) {
      // Falha em campanhas não deve impedir a reativação da venda
      log.error("Erro ao reativar bônus de campanhas", { saleId: id, err: String(campaignError) });
    }

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
    const startOfDay = startOfLocalDay(date);
    const endOfDay = endOfLocalDay(date);

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
