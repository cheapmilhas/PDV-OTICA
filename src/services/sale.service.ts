import { prisma } from "@/lib/prisma";
import { Sale, SaleItem, SalePayment, Prisma } from "@prisma/client";
import { notFoundError, AppError, ERROR_CODES } from "@/lib/error-handler";
import { createPaginationMeta, getPaginationParams } from "@/lib/api-response";
import type { SaleQuery, CreateSaleDTO } from "@/lib/validations/sale.schema";
import { calculateInstallments, validateCreditLimit } from "@/lib/installment-utils";
import { validateStoreCredit } from "@/lib/validations/sale.schema";
import { dateOnlyToUTC } from "@/lib/date-utils";
import { addDays } from "date-fns";
import { cashbackService } from "@/services/cashback.service";
import { atomicStockDebit } from "@/services/stock.service";
import { processaSaleForCampaigns, reverseBonusForSale } from "@/services/product-campaign.service";

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
    const { customerId, branchId, items, payments, discount = 0, cashbackUsed = 0, notes, sellerUserId } = data;
    const effectiveSellerId = sellerUserId || userId;

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

    // Validar crediário e saldo a receber (cliente obrigatório)
    for (const payment of payments) {
      if (payment.method === "STORE_CREDIT") {
        validateStoreCredit(payment, customerId);

        // Validar limite de crédito (se aplicável)
        const creditCheck = await validateCreditLimit(
          customerId!,
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

      // Saldo a Receber: cliente obrigatório (paga ao receber o produto)
      if (payment.method === "BALANCE_DUE") {
        if (!customerId) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            "Saldo a Receber exige um cliente vinculado",
            400
          );
        }
      }
    }

    // Verificar/Criar caixa aberto (auto-abertura se necessário)
    console.log(`🔍 Buscando caixa aberto para branchId: ${branchId}`);
    let openShift = await prisma.cashShift.findFirst({
      where: { branchId, status: "OPEN" },
    });

    // Se não houver caixa aberto, criar automaticamente
    if (!openShift) {
      console.log(`⚠️ Nenhum caixa aberto. Criando automaticamente...`);

      // Buscar companyId da filial
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

      console.log(`✅ Caixa criado automaticamente: ${openShift.id}`);
    } else {
      console.log(`✅ Caixa aberto encontrado: ${openShift.id}`);
    }

    // Criar venda em transação (venda + itens + pagamentos + cashMovement + estoque)
    const sale = await prisma.$transaction(async (tx) => {
      // 1. Criar venda
      const newSale = await tx.sale.create({
        data: {
          companyId,
          customerId,
          branchId,
          sellerUserId: effectiveSellerId,
          subtotal,
          discountTotal: discount,
          cashbackUsed,
          total,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      // 2. Buscar custo dos produtos para gravar no SaleItem
      const productIds = items.map((i) => i.productId).filter(Boolean);
      const productsWithCost = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, costPrice: true },
      });
      const costMap = new Map(productsWithCost.map((p) => [p.id, Number(p.costPrice)]));

      // 3. Criar itens
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

        // 3. Atualizar estoque de forma atômica (race condition safe)
        const stockResult = await atomicStockDebit(item.productId, item.qty, companyId, tx, branchId);
        if (!stockResult.success) {
          throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            stockResult.error || "Estoque insuficiente",
            400
          );
        }

        // 3.1. Criar registro de movimentação de estoque (auditoria)
        await tx.stockMovement.create({
          data: {
            companyId,
            branchId,
            productId: item.productId,
            type: "SALE",
            quantity: -item.qty, // Negativo = saída de estoque
            createdByUserId: userId,
            notes: `Saída por venda #${newSale.id.substring(0, 8)}`,
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
            installments: payment.installmentConfig?.count || payment.installments || 1,
            status: "RECEIVED",
            receivedAt: new Date(),
            receivedByUserId: userId,
            ...(payment.cardBrand && { cardBrand: payment.cardBrand }),
            ...(payment.cardLastDigits && { cardLastDigits: payment.cardLastDigits }),
            ...(payment.nsu && { nsu: payment.nsu }),
            ...(payment.authorizationCode && { authorizationCode: payment.authorizationCode }),
            ...(payment.acquirer && { acquirer: payment.acquirer }),
          },
        });

        // 4.1. Auto-calcular taxas de cartão se não informadas
        if (
          (payment.method === "CREDIT_CARD" || payment.method === "DEBIT_CARD") &&
          !salePayment.feeAmount
        ) {
          try {
            const { calculateCardFee } = await import("@/services/card-fee.service");
            const feeResult = await calculateCardFee(
              companyId,
              payment.cardBrand || "VISA",
              payment.method === "CREDIT_CARD" ? "CREDIT" : "DEBIT",
              payment.installmentConfig?.count || payment.installments || 1,
              Number(payment.amount)
            );
            if (feeResult) {
              await tx.salePayment.update({
                where: { id: salePayment.id },
                data: {
                  feePercent: feeResult.feePercent,
                  feeAmount: feeResult.feeAmount,
                  netAmount: feeResult.netAmount,
                  settlementDate: feeResult.settlementDate,
                },
              });
            }
          } catch {
            // Falha no cálculo de fee não deve impedir a venda
          }
        }

        // 5. Criar CashMovement apenas para pagamentos à vista
        // STORE_CREDIT (crediário) NÃO entra no caixa — será recebido depois via parcelas
        // CREDIT_CARD NÃO entra no caixa físico — operadora repassa depois
        const methodsInCash = ["CASH", "PIX", "DEBIT_CARD"];
        if (methodsInCash.includes(payment.method)) {
          console.log(`💰 Criando CashMovement para pagamento:`, {
            cashShiftId: openShift.id,
            branchId,
            method: payment.method,
            amount: payment.amount,
            salePaymentId: salePayment.id,
          });

          try {
            const cashMovement = await tx.cashMovement.create({
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
                note: `Venda #${newSale.id.substring(0, 8)}`,
              },
            });

            console.log(`✅ CashMovement criado com sucesso! ID: ${cashMovement.id}`);
          } catch (cashMovementError: any) {
            console.error(`❌ ERRO ao criar CashMovement:`, cashMovementError);
            throw cashMovementError;
          }
        } else {
          console.log(`ℹ️ Pagamento ${payment.method} não gera CashMovement (não é à vista)`);
        }

        // 6. Se for crediário, criar parcelas em AccountReceivable
        if (payment.method === "STORE_CREDIT" && payment.installmentConfig) {
          const installments = calculateInstallments(
            payment.amount,
            payment.installmentConfig.count,
            dateOnlyToUTC(payment.installmentConfig.firstDueDate),
            payment.installmentConfig.interval
          );

          for (const inst of installments) {
            await tx.accountReceivable.create({
              data: {
                companyId,
                customerId: customerId!,
                saleId: newSale.id,
                description: `Parcela ${inst.installmentNumber}/${installments.length} - Venda #${newSale.id.substring(0, 8)}`,
                amount: inst.amount,
                dueDate: inst.dueDate,
                installmentNumber: inst.installmentNumber,
                totalInstallments: installments.length,
                status: "PENDING",
                createdByUserId: userId,
              },
            });
          }

          console.log(`✅ Criadas ${installments.length} parcelas em AccountReceivable para venda ${newSale.id}`);
        }

        // 6b. Se for Saldo a Receber, criar 1 parcela em AccountReceivable
        if (payment.method === "BALANCE_DUE") {
          // Vencimento: +30 dias (pagamento na entrega do produto)
          const dueDate = addDays(new Date(), 30);

          await tx.accountReceivable.create({
            data: {
              companyId,
              customerId: customerId!,
              saleId: newSale.id,
              description: `Saldo a Receber - Venda #${newSale.id.substring(0, 8)} - Pagamento na entrega`,
              amount: payment.amount,
              dueDate,
              installmentNumber: 1,
              totalInstallments: 1,
              status: "PENDING",
              createdByUserId: userId,
            },
          });

          console.log(`✅ Saldo a Receber criado em AccountReceivable para venda ${newSale.id}`);
        }
      }

      // 6. Debitar cashback se foi usado
      if (cashbackUsed > 0 && customerId) {
        console.log(`💸 Debitando cashback: R$ ${cashbackUsed.toFixed(2)} do cliente ${customerId}`);

        // Atualizar CustomerCashback (já validamos que existe antes da transação)
        const customerCashback = await tx.customerCashback.update({
          where: {
            customerId_branchId: {
              customerId,
              branchId,
            },
          },
          data: {
            balance: {
              decrement: cashbackUsed,
            },
            totalUsed: {
              increment: cashbackUsed,
            },
          },
        });

        // Criar movimento de DEBIT
        await tx.cashbackMovement.create({
          data: {
            customerCashbackId: customerCashback.id,
            type: "DEBIT",
            amount: cashbackUsed, // POSITIVO! O type "DEBIT" já indica que é saída
            saleId: newSale.id,
            description: `Cashback usado na venda #${newSale.id.substring(0, 8)}`,
            createdByUserId: userId,
          },
        });

        console.log(`✅ Cashback debitado com sucesso!`);
      }

      // 7. Calcular e criar comissão do vendedor (usa vendedor selecionado, não quem logou)
      const seller = await tx.user.findUnique({
        where: { id: effectiveSellerId },
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
          userId: effectiveSellerId,
          baseAmount,
          percentage: commissionPercent,
          commissionAmount,
          status: "PENDING",
          periodMonth: new Date().getMonth() + 1,
          periodYear: new Date().getFullYear(),
        },
      });

      // 8. Gerar lançamentos financeiros (ledger)
      try {
        const { generateSaleEntries } = await import("@/services/finance-entry.service");
        await generateSaleEntries(tx, newSale.id, companyId);
      } catch (financeError) {
        console.error("[FINANCE] Erro ao gerar lançamentos:", financeError);
        // NÃO throw — venda já completada, finance é secundário
      }

      return newSale;
    });

    // 9. Gerar cashback (se aplicável - fora da transação principal)
    if (customerId) {
      try {
        console.log(`💰 Gerando cashback para venda ${sale.id}, cliente ${customerId}`);
        await cashbackService.earnCashback(
          customerId,
          sale.id,
          total,
          branchId,
          companyId
        );
        console.log(`✅ Cashback gerado com sucesso para venda ${sale.id}`);
      } catch (cashbackError) {
        // Log mas não falha a venda se cashback der erro
        console.error(`❌ Erro ao gerar cashback (venda criada com sucesso):`, cashbackError);
      }
    }

    // 9. Processar campanhas de bonificação (se aplicável - fora da transação principal)
    try {
      console.log(`🎯 Processando campanhas para venda ${sale.id}`);
      const campaignResult = await processaSaleForCampaigns(sale.id, companyId);
      console.log(`✅ Campanhas processadas: ${campaignResult.processed} bônus gerados (R$ ${campaignResult.bonusTotal.toFixed(2)})`);
    } catch (campaignError) {
      // Log mas não falha a venda se campanhas derem erro
      console.error(`❌ Erro ao processar campanhas (venda criada com sucesso):`, campaignError);
    }

    // 10. Gerar lembrete pós-venda automaticamente (se cliente identificado)
    if (customerId) {
      try {
        const saleItems = await prisma.saleItem.findMany({
          where: { saleId: sale.id },
          include: { product: { select: { name: true } } },
          take: 1,
        });

        const productName = saleItems[0]?.product?.name || undefined;

        // Verificar se já existe lembrete pós-venda pendente para este cliente
        const existingReminder = await prisma.customerReminder.findFirst({
          where: {
            companyId,
            customerId,
            segment: "POST_SALE_30_DAYS",
            status: { in: ["PENDING", "IN_PROGRESS", "SCHEDULED"] },
          },
        });

        if (!existingReminder) {
          await prisma.customerReminder.create({
            data: {
              companyId,
              customerId,
              segment: "POST_SALE_30_DAYS",
              priority: 80,
              lastPurchaseDate: new Date(),
              lastPurchaseAmount: total,
              lastPurchaseProduct: productName,
              daysSinceLastPurchase: 0,
              totalPurchases: 1,
              totalSpent: total,
              status: "PENDING",
              scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
          console.log(`📋 Lembrete pós-venda criado para cliente ${customerId}`);
        }
      } catch (reminderError) {
        console.error(`❌ Erro ao criar lembrete pós-venda (venda OK):`, reminderError);
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

      // 3. Marcar pagamentos como cancelados e criar REFUND apenas para pagamentos à vista
      const methodsComCaixa = ["CASH", "PIX", "DEBIT_CARD"];
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
          console.log(`💸 Cashback estornado: R$ ${Number(cashbackMovement.amount)}`);
        }
      } catch (cashbackError) {
        console.error(`❌ Erro ao estornar cashback (venda cancelada):`, cashbackError);
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
      console.log(`🎯 Revertendo bônus de campanhas para venda ${id}`);
      const reversalResult = await reverseBonusForSale(id, companyId);
      console.log(`✅ Bônus revertidos: ${reversalResult.reversed} entradas`);
    } catch (campaignError) {
      console.error(`❌ Erro ao reverter bônus de campanhas:`, campaignError);
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
      console.log(`🎯 Reprocessando campanhas para venda reativada ${id}`);
      const campaignResult = await processaSaleForCampaigns(id, companyId);
      console.log(`✅ Campanhas reprocessadas: ${campaignResult.processed} bônus gerados (R$ ${campaignResult.bonusTotal.toFixed(2)})`);
    } catch (campaignError) {
      // Log mas não falha a reativação se campanhas derem erro
      console.error(`❌ Erro ao reprocessar campanhas (venda reativada com sucesso):`, campaignError);
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
