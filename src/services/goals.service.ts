import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  CommissionConfigDTO,
  SalesGoalDTO,
  SellerGoalDTO,
  CloseMonthDTO,
  GoalsQueryDTO,
} from "@/lib/validations/goals.schema";
import { startOfMonth, endOfMonth } from "date-fns";

export const goalsService = {
  // =====================
  // CONFIGURAÇÃO DE COMISSÕES
  // =====================

  async getCommissionConfig(branchId: string) {
    let config = await prisma.commissionConfig.findUnique({
      where: { branchId },
    });

    if (!config) {
      config = await prisma.commissionConfig.create({
        data: {
          branchId,
          baseCommissionPercent: new Decimal(5),
          goalBonusPercent: new Decimal(2),
        },
      });
    }

    return {
      ...config,
      baseCommissionPercent: Number(config.baseCommissionPercent),
      goalBonusPercent: Number(config.goalBonusPercent),
    };
  },

  async updateCommissionConfig(branchId: string, data: CommissionConfigDTO) {
    return prisma.commissionConfig.upsert({
      where: { branchId },
      update: {
        baseCommissionPercent: new Decimal(data.baseCommissionPercent),
        goalBonusPercent: new Decimal(data.goalBonusPercent),
        categoryCommissions: data.categoryCommissions || undefined,
      },
      create: {
        branchId,
        baseCommissionPercent: new Decimal(data.baseCommissionPercent),
        goalBonusPercent: new Decimal(data.goalBonusPercent),
        categoryCommissions: data.categoryCommissions || undefined,
      },
    });
  },

  // =====================
  // METAS MENSAIS
  // =====================

  async createOrUpdateGoal(branchId: string, data: SalesGoalDTO) {
    const { year, month, branchGoal, sellerGoals } = data;

    // Verificar se já existe meta para este mês
    let salesGoal = await prisma.salesGoal.findFirst({
      where: { branchId, year, month },
    });

    if (salesGoal) {
      // Atualizar meta existente
      salesGoal = await prisma.salesGoal.update({
        where: { id: salesGoal.id },
        data: { branchGoal: new Decimal(branchGoal) },
      });
    } else {
      // Criar nova meta
      salesGoal = await prisma.salesGoal.create({
        data: {
          branchId,
          year,
          month,
          branchGoal: new Decimal(branchGoal),
          status: "ACTIVE",
        },
      });
    }

    // Atualizar metas individuais dos vendedores
    if (sellerGoals && sellerGoals.length > 0) {
      for (const sg of sellerGoals) {
        await prisma.sellerGoal.upsert({
          where: {
            salesGoalId_userId: {
              salesGoalId: salesGoal.id,
              userId: sg.userId,
            },
          },
          update: {
            goalAmount: new Decimal(sg.goalAmount),
          },
          create: {
            salesGoalId: salesGoal.id,
            userId: sg.userId,
            goalAmount: new Decimal(sg.goalAmount),
          },
        });
      }
    }

    return this.getGoalWithDetails(salesGoal.id);
  },

  async getGoalWithDetails(goalId: string) {
    const goal = await prisma.salesGoal.findUnique({
      where: { id: goalId },
      include: {
        sellerGoals: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!goal) return null;

    return {
      ...goal,
      branchGoal: Number(goal.branchGoal),
      sellerGoals: goal.sellerGoals.map((sg) => ({
        ...sg,
        goalAmount: Number(sg.goalAmount),
      })),
    };
  },

  async getCurrentMonthGoal(branchId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const goal = await prisma.salesGoal.findFirst({
      where: { branchId, year, month },
      include: {
        sellerGoals: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!goal) return null;

    return {
      ...goal,
      branchGoal: Number(goal.branchGoal),
      sellerGoals: goal.sellerGoals.map((sg) => ({
        ...sg,
        goalAmount: Number(sg.goalAmount),
      })),
    };
  },

  async listGoals(branchId: string, query: GoalsQueryDTO) {
    const where: any = { branchId };

    if (query.year) where.year = query.year;
    if (query.month) where.month = query.month;
    if (query.status) where.status = query.status;

    const goals = await prisma.salesGoal.findMany({
      where,
      include: {
        sellerGoals: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    return goals.map((goal) => ({
      ...goal,
      branchGoal: Number(goal.branchGoal),
      sellerGoals: goal.sellerGoals.map((sg) => ({
        ...sg,
        goalAmount: Number(sg.goalAmount),
      })),
    }));
  },

  // =====================
  // DASHBOARD DE VENDAS
  // =====================

  async getDashboard(branchId: string, year?: number, month?: number) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;

    const startDate = startOfMonth(new Date(targetYear, targetMonth - 1));
    const endDate = endOfMonth(new Date(targetYear, targetMonth - 1));

    // Buscar meta do mês
    const goal = await prisma.salesGoal.findFirst({
      where: { branchId, year: targetYear, month: targetMonth },
      include: {
        sellerGoals: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    // Buscar vendas do mês por vendedor
    const salesByUser = await prisma.sale.groupBy({
      by: ["sellerUserId"],
      where: {
        branchId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: { in: ["COMPLETED"] },
      },
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
    });

    // Buscar informações dos vendedores
    const userIds = salesByUser.map((s) => s.sellerUserId).filter(Boolean) as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });

    // Total de vendas da filial
    const totalSales = salesByUser.reduce(
      (sum, s) => sum + Number(s._sum?.total || 0),
      0
    );

    // Montar ranking de vendedores
    const ranking = salesByUser
      .map((sale) => {
        const user = users.find((u) => u.id === sale.sellerUserId);
        const sellerGoal = goal?.sellerGoals.find((sg) => sg.userId === sale.sellerUserId);
        const totalSold = Number(sale._sum?.total || 0);
        const goalAmount = sellerGoal ? Number(sellerGoal.goalAmount) : 0;
        const progress = goalAmount > 0 ? (totalSold / goalAmount) * 100 : 0;

        return {
          userId: sale.sellerUserId,
          userName: user?.name || "Desconhecido",
          userEmail: user?.email,
          totalSales: totalSold,
          salesCount: sale._count?.id || 0,
          goalAmount,
          progress: Math.min(progress, 100),
          goalAchieved: totalSold >= goalAmount && goalAmount > 0,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);

    // Progresso da filial
    const branchGoal = goal ? Number(goal.branchGoal) : 0;
    const branchProgress = branchGoal > 0 ? (totalSales / branchGoal) * 100 : 0;

    return {
      year: targetYear,
      month: targetMonth,
      goal: goal
        ? {
            id: goal.id,
            branchGoal: Number(goal.branchGoal),
            status: goal.status,
          }
        : null,
      branch: {
        totalSales,
        goalAmount: branchGoal,
        progress: Math.min(branchProgress, 100),
        goalAchieved: totalSales >= branchGoal && branchGoal > 0,
      },
      ranking,
      sellersCount: ranking.length,
      sellersOnGoal: ranking.filter((r) => r.goalAchieved).length,
    };
  },

  // =====================
  // CÁLCULO DE COMISSÕES
  // =====================

  async calculateCommissions(branchId: string, year: number, month: number) {
    const config = await this.getCommissionConfig(branchId);
    const dashboard = await this.getDashboard(branchId, year, month);

    if (!dashboard.goal) {
      throw new Error("Não há meta definida para este mês");
    }

    const commissions = [];

    for (const seller of dashboard.ranking) {
      if (!seller.userId) continue;

      // Comissão base
      const baseCommission =
        seller.totalSales * (config.baseCommissionPercent / 100);

      // Bônus por atingir meta
      const bonusCommission = seller.goalAchieved
        ? seller.totalSales * (config.goalBonusPercent / 100)
        : 0;

      const totalCommission = baseCommission + bonusCommission;

      // Verificar se já existe registro de comissão
      let commission = await prisma.sellerCommission.findFirst({
        where: {
          branchId,
          userId: seller.userId,
          year,
          month,
        },
      });

      if (commission) {
        // Atualizar
        commission = await prisma.sellerCommission.update({
          where: { id: commission.id },
          data: {
            totalSales: new Decimal(seller.totalSales),
            goalAmount: new Decimal(seller.goalAmount),
            goalAchieved: seller.goalAchieved,
            baseCommission: new Decimal(baseCommission),
            bonusCommission: new Decimal(bonusCommission),
            totalCommission: new Decimal(totalCommission),
            status: "PENDING",
          },
        });
      } else {
        // Criar
        commission = await prisma.sellerCommission.create({
          data: {
            branchId,
            userId: seller.userId,
            year,
            month,
            totalSales: new Decimal(seller.totalSales),
            goalAmount: new Decimal(seller.goalAmount),
            goalAchieved: seller.goalAchieved,
            baseCommission: new Decimal(baseCommission),
            bonusCommission: new Decimal(bonusCommission),
            totalCommission: new Decimal(totalCommission),
            status: "PENDING",
          },
        });
      }

      commissions.push({
        ...commission,
        userName: seller.userName,
        totalSales: Number(commission.totalSales),
        goalAmount: Number(commission.goalAmount),
        baseCommission: Number(commission.baseCommission),
        bonusCommission: Number(commission.bonusCommission),
        totalCommission: Number(commission.totalCommission),
      });
    }

    return commissions;
  },

  async closeMonth(branchId: string, data: CloseMonthDTO) {
    const { year, month } = data;

    // Calcular comissões
    const commissions = await this.calculateCommissions(branchId, year, month);

    // Fechar a meta
    await prisma.salesGoal.updateMany({
      where: { branchId, year, month },
      data: { status: "CLOSED" },
    });

    return {
      commissions,
      message: `Mês ${month}/${year} fechado com sucesso`,
    };
  },

  // =====================
  // COMISSÕES
  // =====================

  async getCommissions(branchId: string, year?: number, month?: number) {
    const where: any = { branchId };

    if (year) where.year = year;
    if (month) where.month = month;

    const commissions = await prisma.sellerCommission.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { totalCommission: "desc" }],
    });

    return commissions.map((c) => ({
      ...c,
      totalSales: Number(c.totalSales),
      goalAmount: Number(c.goalAmount),
      baseCommission: Number(c.baseCommission),
      bonusCommission: Number(c.bonusCommission),
      totalCommission: Number(c.totalCommission),
    }));
  },

  async markCommissionAsPaid(commissionId: string) {
    return prisma.sellerCommission.update({
      where: { id: commissionId },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });
  },

  // =====================
  // VENDEDORES DA FILIAL
  // =====================

  async getBranchSellers(branchId: string) {
    const users = await prisma.user.findMany({
      where: {
        branches: {
          some: {
            branchId: branchId,
          },
        },
        role: { in: ["ADMIN", "GERENTE", "VENDEDOR"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    return users;
  },

  // =====================
  // RELATÓRIOS
  // =====================

  async getSellerReport(userId: string, branchId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();

    const commissions = await prisma.sellerCommission.findMany({
      where: {
        userId,
        branchId,
        year: targetYear,
      },
      orderBy: { month: "asc" },
    });

    const totalEarned = commissions.reduce(
      (sum, c) => sum + Number(c.totalCommission),
      0
    );
    const totalPaid = commissions
      .filter((c) => c.status === "PAID")
      .reduce((sum, c) => sum + Number(c.totalCommission), 0);
    const totalPending = totalEarned - totalPaid;

    return {
      year: targetYear,
      commissions: commissions.map((c) => ({
        ...c,
        totalSales: Number(c.totalSales),
        goalAmount: Number(c.goalAmount),
        baseCommission: Number(c.baseCommission),
        bonusCommission: Number(c.bonusCommission),
        totalCommission: Number(c.totalCommission),
      })),
      summary: {
        totalEarned,
        totalPaid,
        totalPending,
        monthsWorked: commissions.length,
        goalsAchieved: commissions.filter((c) => c.goalAchieved).length,
      },
    };
  },
};
