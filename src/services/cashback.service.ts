import { prisma } from "@/lib/prisma";
import type {
  CashbackConfigDTO,
  UseCashbackDTO,
  AdjustCashbackDTO,
  CashbackHistoryQueryDTO,
} from "@/lib/validations/cashback.schema";
import { addDays, isBefore, startOfDay, isSameDay } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";

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
    });
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

    // Validar compra mínima para usar
    const minPurchaseToUse =
      amount * Number(config.minPurchaseMultiplier);
    if (saleTotal < minPurchaseToUse) {
      errors.push(
        `Compra mínima para usar R$ ${amount.toFixed(
          2
        )} de cashback: R$ ${minPurchaseToUse.toFixed(2)}`
      );
    }

    // Validar percentual máximo de uso
    const maxUsage = (saleTotal * Number(config.maxUsagePercent)) / 100;
    if (amount > maxUsage) {
      errors.push(
        `Cashback não pode ultrapassar ${Number(
          config.maxUsagePercent
        )}% do valor da venda (R$ ${maxUsage.toFixed(2)})`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      availableBalance: Number(customerCashback.balance),
      maxUsageAllowed: Math.min(maxUsage, Number(customerCashback.balance)),
    };
  },

  /**
   * Usar cashback em uma venda
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

      if (Number(customerCashback.balance) < amount) {
        throw new Error("Saldo insuficiente");
      }

      // Criar movimento de débito
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

      // Atualizar saldo e totais
      await tx.customerCashback.update({
        where: { id: customerCashback.id },
        data: {
          balance: {
            decrement: new Decimal(amount),
          },
          totalUsed: {
            increment: new Decimal(amount),
          },
        },
      });

      return movement;
    });
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

      const newBalance = Number(customerCashback.balance) + amount;

      // Criar movimento
      const movement = await tx.cashbackMovement.create({
        data: {
          customerCashbackId: customerCashback.id,
          type: type === "BONUS" ? "BONUS" : "ADJUSTMENT",
          amount: new Decimal(amount),
          description,
        },
      });

      // Atualizar saldo
      await tx.customerCashback.update({
        where: { id: customerCashback.id },
        data: {
          balance: new Decimal(newBalance),
          ...(amount > 0 && {
            totalEarned: {
              increment: new Decimal(amount),
            },
          }),
        },
      });

      return movement;
    });
  },

  /**
   * Processar cashbacks expirados
   */
  async processExpiredCashbacks(branchId: string) {
    const today = startOfDay(new Date());

    // Buscar movimentos expirados que ainda não foram marcados
    const expiredMovements = await prisma.cashbackMovement.findMany({
      where: {
        type: "CREDIT",
        expiresAt: {
          lte: today,
        },
        expired: false,
      },
      include: {
        customerCashback: true,
      },
    });

    const results = [];

    for (const movement of expiredMovements) {
      try {
        await prisma.$transaction(async (tx) => {
          // Criar movimento de expiração
          await tx.cashbackMovement.create({
            data: {
              customerCashbackId: movement.customerCashbackId,
              type: "EXPIRED",
              amount: new Decimal(-Number(movement.amount)),
              description: `Expiração de cashback ganho em ${movement.createdAt.toLocaleDateString()}`,
            },
          });

          // Marcar movimento original como expirado
          await tx.cashbackMovement.update({
            where: { id: movement.id },
            data: { expired: true },
          });

          // Atualizar saldo
          await tx.customerCashback.update({
            where: { id: movement.customerCashbackId },
            data: {
              balance: {
                decrement: new Decimal(Number(movement.amount)),
              },
              totalExpired: {
                increment: new Decimal(Number(movement.amount)),
              },
            },
          });

          results.push({
            success: true,
            movementId: movement.id,
            customerId: movement.customerCashback.customerId,
            amount: Number(movement.amount),
          });
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
