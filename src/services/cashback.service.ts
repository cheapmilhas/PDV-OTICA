import { prisma } from "@/lib/prisma";
import type {
  CashbackConfigDTO,
  UseCashbackDTO,
  AdjustCashbackDTO,
  CashbackHistoryQueryDTO,
} from "@/lib/validations/cashback.schema";
import { addDays, isBefore, startOfDay, isSameDay } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { AppError, ERROR_CODES } from "@/lib/error-handler";
import { applyCashbackAdjustment, expirableAmount, assertCashbackLimits } from "@/lib/cashback-math";

export const cashbackService = {
  /**
   * Buscar configuração do cashback da filial
   */
  async getConfig(branchId: string, companyId: string) {
    const config = await prisma.cashbackConfig.findFirst({
      where: { branchId },
    });

    // Se não existe, criar com valores padrão
    if (!config) {
      return prisma.cashbackConfig.create({
        data: {
          branchId,
          enabled: true,
          earnPercent: new Decimal(5),
          minPurchaseToEarn: new Decimal(0),
          maxCashbackPerSale: null,
          expirationDays: 90,
          minPurchaseMultiplier: new Decimal(2),
          maxUsagePercent: new Decimal(50),
          birthdayMultiplier: new Decimal(2),
        },
      });
    }

    return config;
  },

  /**
   * Atualizar configuração do cashback
   */
  async updateConfig(
    branchId: string,
    companyId: string,
    data: CashbackConfigDTO
  ) {
    // Buscar config existente
    const existing = await this.getConfig(branchId, companyId);

    return prisma.cashbackConfig.update({
      where: { id: existing.id },
      data: {
        enabled: data.isActive,
        earnPercent: new Decimal(data.earnPercent),
        minPurchaseToEarn: new Decimal(data.minPurchaseToEarn),
        maxCashbackPerSale: data.maxCashbackPerSale
          ? new Decimal(data.maxCashbackPerSale)
          : null,
        expirationDays: data.expirationDays || 90,
        minPurchaseMultiplier: new Decimal(data.minPurchaseMultiplier),
        maxUsagePercent: new Decimal(data.maxUsagePercent),
        birthdayMultiplier: new Decimal(data.birthdayMultiplier),
      },
    });
  },

  /**
   * Buscar saldo de cashback do cliente
   */
  async getCustomerCashback(customerId: string, branchId: string) {
    let customerCashback = await prisma.customerCashback.findFirst({
      where: { customerId, branchId },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, birthDate: true },
        },
      },
    });

    // Se não existe, criar com saldo zero
    if (!customerCashback) {
      customerCashback = await prisma.customerCashback.create({
        data: {
          branchId,
          customerId,
          balance: new Decimal(0),
        },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, birthDate: true },
          },
        },
      });
    }

    return customerCashback;
  },

  /**
   * Gerar cashback após venda
   */
  async earnCashback(
    customerId: string,
    saleId: string,
    saleTotal: number,
    branchId: string,
    companyId: string
  ) {
    const config = await this.getConfig(branchId, companyId);

    // Validar se está ativo
    if (!config.enabled) {
      return null;
    }

    // Validar compra mínima
    if (saleTotal < Number(config.minPurchaseToEarn)) {
      return null;
    }

    // Buscar cliente para verificar aniversário
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { birthDate: true },
    });

    // Calcular porcentagem base
    let earnPercent = Number(config.earnPercent);

    // Verificar se é aniversariante (mesmo mês)
    const today = new Date();
    if (customer?.birthDate) {
      const birthDate = new Date(customer.birthDate);

      // Verificar se é o mesmo mês e dia do aniversário
      const isBirthdayMonth = today.getMonth() === birthDate.getMonth();

      if (isBirthdayMonth) {
        earnPercent *= Number(config.birthdayMultiplier);
      }
    }

    // Calcular cashback
    let cashbackAmount = (saleTotal * earnPercent) / 100;

    // Aplicar limite máximo por venda
    if (config.maxCashbackPerSale) {
      cashbackAmount = Math.min(
        cashbackAmount,
        Number(config.maxCashbackPerSale)
      );
    }

    // Calcular data de expiração
    let expiresAt: Date | null = null;
    if (config.expirationDays) {
      expiresAt = addDays(new Date(), config.expirationDays);
    }

    // Usar transação para garantir consistência
    return prisma.$transaction(async (tx) => {
      // Buscar ou criar CustomerCashback
      let customerCashback = await tx.customerCashback.findFirst({
        where: { customerId, branchId },
      });

      if (!customerCashback) {
        customerCashback = await tx.customerCashback.create({
          data: {
            branchId,
            customerId,
            balance: new Decimal(0),
          },
        });
      }

      // Criar movimento de crédito
      const movement = await tx.cashbackMovement.create({
        data: {
          customerCashbackId: customerCashback.id,
          type: "CREDIT",
          amount: new Decimal(cashbackAmount),
          saleId,
          expiresAt,
          description: `Cashback ganho na venda #${saleId.slice(-8)}`,
        },
      });

      // Atualizar saldo e totais do cliente
      await tx.customerCashback.update({
        where: { id: customerCashback.id },
        data: {
          balance: {
            increment: new Decimal(cashbackAmount),
          },
          totalEarned: {
            increment: new Decimal(cashbackAmount),
          },
        },
      });

      return movement;
    }, { timeout: 30_000 });
  },

  /**
   * Validar uso de cashback (sem efetivar)
   */
  async validateUsage(
    customerId: string,
    amount: number,
    saleTotal: number,
    branchId: string,
    companyId: string
  ) {
    const config = await this.getConfig(branchId, companyId);
    const customerCashback = await this.getCustomerCashback(
      customerId,
      branchId
    );

    const errors: string[] = [];

    // Validar se está ativo
    if (!config.enabled) {
      errors.push("Cashback está desativado nesta filial");
    }

    // Validar saldo disponível
    if (amount > Number(customerCashback.balance)) {
      errors.push(
        `Saldo insuficiente. Disponível: R$ ${Number(
          customerCashback.balance
        ).toFixed(2)}`
      );
    }

    // Validar compra mínima para usar + percentual máximo de uso.
    // Regra centralizada em assertCashbackLimits (lógica pura compartilhada com
    // o débito real da venda em applyCashbackUsageInTx). Respeita null/0 = sem limite.
    const limitError = assertCashbackLimits(
      {
        maxUsagePercent: Number(config.maxUsagePercent ?? 0),
        minPurchaseMultiplier: Number(config.minPurchaseMultiplier ?? 0),
      },
      saleTotal,
      amount
    );
    if (limitError) {
      errors.push(limitError);
    }

    // Teto de uso permitido (para a UI): respeita o % máximo só se configurado.
    const maxPercent = Number(config.maxUsagePercent ?? 0);
    const maxUsage = maxPercent > 0 ? (saleTotal * maxPercent) / 100 : saleTotal;

    return {
      isValid: errors.length === 0,
      errors,
      availableBalance: Number(customerCashback.balance),
      maxUsageAllowed: Math.min(maxUsage, Number(customerCashback.balance)),
    };
  },

  /**
   * Usar cashback em uma venda.
   *
   * NOTA (auditoria 2026-07-02): hoje NÃO é chamado em produção — o débito de
   * cashback na venda passa por applyCashbackUsageInTx (sale-side-effects). Foi
   * mantido e blindado (débito condicional atômico) para o caso de resgate
   * avulso futuro; sem essa blindagem, dois usos concorrentes levavam o saldo a
   * NEGATIVO (mesma classe de bug já corrigida em applyCashbackUsageInTx).
   */
  async useCashback(data: UseCashbackDTO, branchId: string, companyId: string) {
    const { customerId, amount, saleId, description } = data;

    // Usar transação
    return prisma.$transaction(async (tx) => {
      const customerCashback = await tx.customerCashback.findFirst({
        where: { customerId, branchId },
      });

      if (!customerCashback) {
        throw new Error("Cliente sem cashback cadastrado");
      }

      // Débito condicional atômico: só decrementa se o saldo AINDA cobre o valor.
      // O WHERE balance >= amount + checagem de count fecha a corrida (dois usos
      // simultâneos não passam ambos). Substitui o read-then-write anterior.
      const debited = await tx.customerCashback.updateMany({
        where: {
          id: customerCashback.id,
          balance: { gte: new Decimal(amount) },
        },
        data: {
          balance: { decrement: new Decimal(amount) },
          totalUsed: { increment: new Decimal(amount) },
        },
      });

      if (debited.count === 0) {
        throw new Error("Saldo insuficiente");
      }

      // Criar movimento de débito (só após o decremento ser confirmado)
      const movement = await tx.cashbackMovement.create({
        data: {
          customerCashbackId: customerCashback.id,
          type: "DEBIT",
          amount: new Decimal(-amount),
          saleId: saleId || undefined,
          description:
            description ||
            `Cashback usado na venda #${saleId?.slice(-8) || "AVULSA"}`,
        },
      });

      return movement;
    }, { timeout: 30_000 });
  },

  /**
   * Ajuste manual de cashback (bônus ou correção)
   */
  async adjustCashback(
    data: AdjustCashbackDTO,
    branchId: string,
    companyId: string
  ) {
    const { customerId, amount, type, description } = data;

    return prisma.$transaction(async (tx) => {
      let customerCashback = await tx.customerCashback.findFirst({
        where: { customerId, branchId },
      });

      if (!customerCashback) {
        customerCashback = await tx.customerCashback.create({
          data: {
            branchId,
            customerId,
            balance: new Decimal(0),
          },
        });
      }

      // H3 (auditoria 2026-07-02): lock pessimista na linha antes de ler o saldo.
      // adjustCashback fazia read-then-write com balance ABSOLUTO — dois ajustes
      // concorrentes do mesmo cliente liam o mesmo saldo e um sobrescrevia o
      // outro (lost update). O FOR UPDATE serializa: o 2º ajuste espera o 1º
      // commitar e relê o saldo já atualizado. Relemos o balance SOB o lock.
      await tx.$queryRaw`SELECT id FROM "CustomerCashback" WHERE id = ${customerCashback.id} FOR UPDATE`;
      const locked = await tx.customerCashback.findUnique({
        where: { id: customerCashback.id },
        select: { balance: true },
      });

      // M9: piso 0. Lógica pura em applyCashbackAdjustment (testada): um ajuste
      // negativo maior que o saldo (ex: -100 sobre 30) deixava o balance
      // NEGATIVO. Limita ao saldo disponível; o movimento registra o valor REAL
      // aplicado (não o solicitado) para o ledger bater com o saldo.
      const currentBalance = Number(locked?.balance ?? customerCashback.balance);
      const { newBalance, appliedAmount } = applyCashbackAdjustment(currentBalance, amount);

      // M9: ajuste sem efeito (débito sobre saldo já zero) → erro informativo
      // em vez de gravar um movimento de R$ 0,00 que poluiria o ledger.
      if (appliedAmount === 0) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Nenhum ajuste aplicado: o saldo de cashback já é zero.",
          400,
        );
      }

      // Criar movimento
      const movement = await tx.cashbackMovement.create({
        data: {
          customerCashbackId: customerCashback.id,
          type: type === "BONUS" ? "BONUS" : "ADJUSTMENT",
          amount: new Decimal(appliedAmount),
          description,
        },
      });

      // Atualizar saldo
      await tx.customerCashback.update({
        where: { id: customerCashback.id },
        data: {
          balance: new Decimal(newBalance),
          ...(appliedAmount > 0 && {
            totalEarned: {
              increment: new Decimal(appliedAmount),
            },
          }),
        },
      });

      return movement;
    }, { timeout: 30_000 });
  },

  /**
   * Processar cashbacks expirados
   */
  async processExpiredCashbacks(branchId: string) {
    const today = startOfDay(new Date());

    // Buscar movimentos expirados que ainda não foram marcados
    // SEGURANÇA: filtrar por branchId via customerCashback — sem isso, expira a base inteira.
    const expiredMovements = await prisma.cashbackMovement.findMany({
      where: {
        type: "CREDIT",
        expiresAt: {
          lte: today,
        },
        expired: false,
        customerCashback: { branchId },
      },
      include: {
        customerCashback: true,
      },
    });

    const results = [];

    for (const movement of expiredMovements) {
      try {
        await prisma.$transaction(async (tx) => {
          // M5: piso 0. Decrementa só o que AINDA RESTA do saldo — se o cliente
          // já usou parte do cashback que agora expira, decrementar o valor
          // cheio do movimento deixaria o balance NEGATIVO. Relê o saldo dentro
          // da tx e limita a expiração ao saldo disponível.
          const cc = await tx.customerCashback.findUnique({
            where: { id: movement.customerCashbackId },
            select: { balance: true },
          });
          const currentBalance = Number(cc?.balance ?? 0);
          const movementAmount = Number(movement.amount);
          // M5: piso 0 via lógica pura testada (expirableAmount).
          const expireAmount = expirableAmount(movementAmount, currentBalance);

          // Criar movimento de expiração (valor REAL expirado)
          await tx.cashbackMovement.create({
            data: {
              customerCashbackId: movement.customerCashbackId,
              type: "EXPIRED",
              amount: new Decimal(-expireAmount),
              description: `Expiração de cashback ganho em ${movement.createdAt.toLocaleDateString()}`,
            },
          });

          // Marcar movimento original como expirado
          await tx.cashbackMovement.update({
            where: { id: movement.id },
            data: { expired: true },
          });

          // Atualizar saldo. M5/race: set ABSOLUTO com piso (não decrement) —
          // grava max(0, balance-expire) calculado do balance relido na MESMA
          // tx SERIALIZABLE. Se uma venda usar cashback concorrentemente entre
          // o read e o write, o isolamento SERIALIZABLE aborta esta tx (o cron
          // reprocessa na próxima rodada) em vez de deixar saldo negativo.
          if (expireAmount > 0) {
            await tx.customerCashback.update({
              where: { id: movement.customerCashbackId },
              data: {
                balance: new Decimal(Math.max(0, currentBalance - expireAmount)),
                totalExpired: { increment: new Decimal(expireAmount) },
              },
            });
          }

          results.push({
            success: true,
            movementId: movement.id,
            customerId: movement.customerCashback.customerId,
            amount: expireAmount,
          });
        }, {
          timeout: 30_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        results.push({
          success: false,
          movementId: movement.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },

  /**
   * Buscar cashbacks que vão expirar em breve
   */
  async getExpiringCashbacks(branchId: string, daysAhead: number) {
    const today = startOfDay(new Date());
    const futureDate = addDays(today, daysAhead);

    return prisma.cashbackMovement.findMany({
      where: {
        type: "CREDIT",
        expired: false,
        expiresAt: {
          gte: today,
          lte: futureDate,
        },
        customerCashback: {
          branchId,
        },
      },
      include: {
        customerCashback: {
          include: {
            customer: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
      },
      orderBy: { expiresAt: "asc" },
    });
  },

  /**
   * Histórico de movimentos do cliente
   */
  async getCustomerHistory(
    customerId: string,
    branchId: string,
    query: CashbackHistoryQueryDTO
  ) {
    const where = {
      customerCashback: {
        customerId,
        branchId,
      },
      ...(query.startDate && {
        createdAt: { gte: query.startDate },
      }),
      ...(query.endDate && {
        createdAt: { lte: query.endDate },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.cashbackMovement.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          sale: {
            select: { id: true, total: true },
          },
        },
      }),
      prisma.cashbackMovement.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },

  /**
   * Listar clientes com cashback
   */
  async listCustomersWithCashback(
    branchId: string,
    page = 1,
    pageSize = 20
  ) {
    const where = {
      branchId,
      balance: {
        gt: new Decimal(0),
      },
    };

    const [data, total] = await Promise.all([
      prisma.customerCashback.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { balance: "desc" },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      }),
      prisma.customerCashback.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  },

  /**
   * Resumo de cashback da filial
   */
  async getBranchSummary(branchId: string, companyId: string) {
    const config = await this.getConfig(branchId, companyId);

    // Total de saldo ativo
    const totalBalance = await prisma.customerCashback.aggregate({
      where: { branchId },
      _sum: { balance: true },
    });

    // Total de clientes com saldo > 0
    const activeCustomers = await prisma.customerCashback.count({
      where: {
        branchId,
        balance: { gt: new Decimal(0) },
      },
    });

    // Total ganho no mês
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const earnedThisMonth = await prisma.cashbackMovement.aggregate({
      where: {
        type: "CREDIT",
        createdAt: { gte: firstDayOfMonth },
        customerCashback: {
          branchId,
        },
      },
      _sum: { amount: true },
    });

    // Total usado no mês
    const usedThisMonth = await prisma.cashbackMovement.aggregate({
      where: {
        type: "DEBIT",
        createdAt: { gte: firstDayOfMonth },
        customerCashback: {
          branchId,
        },
      },
      _sum: { amount: true },
    });

    return {
      config,
      totalBalance: Number(totalBalance._sum.balance || 0),
      activeCustomers,
      earnedThisMonth: Number(earnedThisMonth._sum.amount || 0),
      usedThisMonth: Math.abs(Number(usedThisMonth._sum.amount || 0)),
    };
  },
};
