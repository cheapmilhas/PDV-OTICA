import { prisma } from "@/lib/prisma";
import { Sale, SaleItem, SalePayment, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { SaleQuery, CreateSaleDTO } from "@/lib/validations/sale.schema";
import { validateCreditLimit } from "@/lib/installment-utils";
import { validateStoreCredit } from "@/lib/validations/sale.schema";
import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";
import { METHODS_IN_CASH } from "@/lib/payment-methods";
import { validateBranchOwnership } from "@/lib/validate-branch";
import { atomicStockDebit } from "@/services/stock.service";
import { processaSaleForCampaigns, reverseBonusForSale } from "@/services/product-campaign.service";
import {
  applyStockDebitInTx,
  applyPaymentsInTx,
  applyCashbackUsageInTx,
  applyCommissionInTx,
  applyFinanceEntriesInTx,
  applyPostCommitSideEffects,
} from "@/services/sale-side-effects.service";

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
    const { customerId, branchId, items, payments, discount = 0, cashbackUsed = 0, notes, sellerUserId, serviceOrderId } = data;
    const effectiveSellerId = sellerUserId || userId;

    // Validação de segurança: branchId deve pertencer à empresa do usuário
    await validateBranchOwnership(branchId, companyId);

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

    // Validação: desconto não pode ser maior que o subtotal
    if (discount > subtotal) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Desconto (R$ ${discount.toFixed(2)}) não pode ser maior que o subtotal da venda (R$ ${subtotal.toFixed(2)})`,
        400
      );
    }

    const total = subtotal - discount;

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

    const totalAfterCashback = total - cashbackUsed;

    // Validação: soma de pagamentos = total após cashback
    const paymentTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(paymentTotal - totalAfterCashback) > 0.01) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Soma dos pagamentos (R$ ${paymentTotal.toFixed(2)}) deve ser igual ao total da venda após cashback (R$ ${totalAfterCashback.toFixed(2)})`,
        400
      );
    }

    // Verificar estoque para cada item
    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, stockQty: true, companyId: true, stockControlled: true },
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

      // Só valida estoque para produtos com controle de estoque ativo
      if (product.stockControlled && product.stockQty < item.qty) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          `Estoque insuficiente para ${product.name}. Disponível: ${product.stockQty}, Solicitado: ${item.qty}`,
          400
        );
      }
    }

    // Validar crediário e saldo a receber (cliente obrigatório + limite de crédito)
    //
    // Decisão (Matheus, 2026-05-06): BALANCE_DUE também passa por validateCreditLimit.
    // Razão: BALANCE_DUE é venda a prazo igual STORE_CREDIT — cliente inadimplente
    // não deve burlar a validação só trocando o método. Bloqueio por inadimplência
    // (overdue_days_to_block) também se aplica a BALANCE_DUE.
    //
    // Diferença: BALANCE_DUE é parcela única vinculada à entrega da OS, então
    // a checagem é a mesma de STORE_CREDIT (totalOpen + requested > limite).
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

      // Validar limite de crédito para vendas a prazo (STORE_CREDIT + BALANCE_DUE)
      if (
        (payment.method === "STORE_CREDIT" || payment.method === "BALANCE_DUE") &&
        customerId
      ) {
        const creditCheck = await validateCreditLimit(
          customerId,
          payment.amount,
          companyId
        );
        if (!creditCheck.approved) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
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

    // Se não houver caixa aberto, criar automaticamente
    if (!openShift) {
      // Buscar companyId da filial (já validada por validateBranchOwnership acima)
      const branch = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { companyId: true },
      });

      if (!branch) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Filial não encontrada", 400);
      }

      openShift = await prisma.cashShift.create({
        data: {
          companyId: branch.companyId,
          branchId,
          openedByUserId: userId,
          openingFloatAmount: 0,
          status: "OPEN",
          openedAt: new Date(),
        },
      });
    }

    // Buscar configurações de juros/multa padrão para crediário
    const companySettings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { defaultFinePercent: true, defaultInterestPercent: true, defaultGraceDays: true },
    });

    // Criar venda em transação (venda + itens + pagamentos + cashMovement + estoque)
    // Refatorado para usar helpers compartilhados em sale-side-effects.service.ts
    // (mesmos side-effects são reusados em quote.service.ts:convertToSale).
    const sale = await prisma.$transaction(async (tx) => {
      // 1. Criar venda
      const newSale = await tx.sale.create({
        data: {
          companyId,
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
      const costMap = new Map(productsWithCost.map((p) => [p.id, Number(p.costPrice)]));

      // 3. Criar SaleItems
      for (const item of items) {
        const itemTotal = item.qty * item.unitPrice - (item.discount || 0);
        const itemCostPrice = item.productId ? (costMap.get(item.productId) || 0) : 0;
        await tx.saleItem.create({
          data: {
            saleId: newSale.id,
            productId: item.productId,
            qty: item.qty,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            lineTotal: itemTotal,
            costPrice: itemCostPrice,
          },
        });
      }

      // 4. Estoque atomic + StockMovement (helper)
      await applyStockDebitInTx(tx, {
        sale: { id: newSale.id, branchId, companyId },
        items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        userId,
      });

      // 5. SalePayments + auto-fee + CashMovement (filtrado) + AR + CR (helper)
      await applyPaymentsInTx(tx, {
        sale: { id: newSale.id, branchId, companyId },
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

          // Registrar movimentação de estorno
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

      // 5. Cancelar comissões pendentes
      await tx.commission.updateMany({
        where: {
          saleId: id,
          status: "PENDING",
        },
        data: {
          status: "CANCELED",
        },
      });

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
    });

    // 8. Reverter cashback (se cliente ganhou)
    if (sale.customerId) {
      try {
        const cashbackMovement = await prisma.cashbackMovement.findFirst({
          where: { saleId: id, type: "CREDIT" },
          include: { customerCashback: true },
        });
        if (cashbackMovement) {
          // Estornar o cashback ganho
          await prisma.customerCashback.update({
            where: { id: cashbackMovement.customerCashbackId },
            data: {
              balance: { decrement: Number(cashbackMovement.amount) },
              totalEarned: { decrement: Number(cashbackMovement.amount) },
            },
          });
          // Criar movimento de estorno
          await prisma.cashbackMovement.create({
            data: {
              customerCashbackId: cashbackMovement.customerCashbackId,
              type: "DEBIT",
              amount: Number(cashbackMovement.amount),
              saleId: id,
              description: `Estorno cashback - Cancelamento venda #${id.substring(0, 8)}`,
            },
          });
        }
      } catch (cashbackError) {
        console.error(`Erro ao estornar cashback para venda ${id}:`, cashbackError);
      }
    }

    // 9. Cancelar lembrete pós-venda (se existir)
    if (sale.customerId) {
      try {
        await prisma.customerReminder.updateMany({
          where: {
            companyId,
            customerId: sale.customerId,
            segment: "POST_SALE_30_DAYS",
            status: { in: ["PENDING", "SCHEDULED"] },
          },
          data: { status: "CANCELLED" },
        });
      } catch {
        // Sem lembrete — ignora
      }
    }

    // 10. Reverter bônus de campanhas (se aplicável)
    try {
      await reverseBonusForSale(id, companyId);
    } catch (campaignError) {
      console.error(`Erro ao reverter bônus de campanhas para venda ${id}:`, campaignError);
    }

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
    });

    // 5. Reprocessar campanhas de bonificação (se aplicável - fora da transação principal)
    try {
      await processaSaleForCampaigns(id, companyId);
    } catch (campaignError) {
      // Falha em campanhas não deve impedir a reativação da venda
      console.error(`Erro ao reprocessar campanhas para venda reativada ${id}:`, campaignError);
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
