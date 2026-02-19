import { prisma } from "@/lib/prisma";
import { HealthCategory } from "@prisma/client";

interface HealthScoreResult {
  score: number;
  category: HealthCategory;
  usageScore: number;
  billingScore: number;
  engagementScore: number;
  supportScore: number;
  riskFactors: string[];
  opportunities: string[];
}

/**
 * Calcula o Health Score de uma empresa
 * Algoritmo:
 * - Usage (30%): login recente, usuários ativos
 * - Billing (35%): faturas pagas, sem atrasos
 * - Engagement (25%): volume de vendas mensais
 * - Support (10%): tickets abertos (placeholder)
 */
export async function calculateHealthScore(companyId: string): Promise<HealthScoreResult> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Buscar dados da empresa
  const [company, users, subscription, invoices, salesThisMonth] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, updatedAt: true }, // Using updatedAt as proxy for last activity
    }),
    prisma.subscription.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.invoice.findMany({
      where: { subscription: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 12, // Últimas 12 faturas
    }),
    prisma.sale.count({
      where: {
        companyId,
        createdAt: { gte: startOfMonth },
      },
    }),
  ]);

  if (!company) {
    throw new Error("Company not found");
  }

  const riskFactors: string[] = [];
  const opportunities: string[] = [];

  // ========================================
  // 1. USAGE SCORE (0-100) - Peso 30%
  // ========================================
  let usageScore = 50; // Base neutra

  // Último acesso de qualquer usuário (usando updatedAt como proxy)
  const lastUpdates = users
    .map((u) => u.updatedAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime());
  const lastUpdate = lastUpdates[0];

  if (lastUpdate) {
    const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000));
    if (daysSinceUpdate === 0) {
      usageScore = 100; // Atividade hoje
    } else if (daysSinceUpdate <= 3) {
      usageScore = 90; // Atividade nos últimos 3 dias
    } else if (daysSinceUpdate <= 7) {
      usageScore = 75; // Atividade na última semana
    } else if (daysSinceUpdate <= 15) {
      usageScore = 60; // Atividade nos últimos 15 dias
    } else if (daysSinceUpdate <= 30) {
      usageScore = 40;
      riskFactors.push(`Sem atividade há ${daysSinceUpdate} dias`);
    } else {
      usageScore = 20;
      riskFactors.push(`Sem atividade há ${daysSinceUpdate} dias (inativo)`);
    }
  } else {
    usageScore = 10;
    riskFactors.push("Nenhuma atividade registrada");
  }

  // Usuários ativos (atividade nos últimos 30 dias)
  const activeUsers = users.filter(
    (u) => u.updatedAt && u.updatedAt.getTime() >= thirtyDaysAgo.getTime()
  ).length;
  const totalUsers = users.length;
  if (totalUsers > 0) {
    const activeRatio = activeUsers / totalUsers;
    if (activeRatio < 0.3) {
      usageScore = Math.max(usageScore - 20, 0);
      riskFactors.push(`Apenas ${Math.round(activeRatio * 100)}% dos usuários ativos`);
    }
  }

  // ========================================
  // 2. BILLING SCORE (0-100) - Peso 35%
  // ========================================
  let billingScore = 50;

  if (subscription) {
    // Status da assinatura
    if (subscription.status === "ACTIVE") {
      billingScore = 100;
    } else if (subscription.status === "TRIAL") {
      billingScore = 80;
      opportunities.push("Converter trial em assinatura paga");
    } else if (subscription.status === "PAST_DUE") {
      billingScore = 30;
      riskFactors.push("Assinatura em atraso");
    } else if (subscription.status === "CANCELED") {
      billingScore = 10;
      riskFactors.push("Assinatura cancelada");
    }

    // Faturas vencidas
    const overdueInvoices = invoices.filter((inv) => inv.status === "OVERDUE");
    if (overdueInvoices.length > 0) {
      billingScore = Math.max(billingScore - overdueInvoices.length * 15, 10);
      riskFactors.push(`${overdueInvoices.length} fatura(s) vencida(s)`);
    }

    // Histórico de pagamento
    const paidInvoices = invoices.filter((inv) => inv.status === "PAID");
    const paymentRate = invoices.length > 0 ? paidInvoices.length / invoices.length : 0;
    if (paymentRate < 0.7 && invoices.length >= 3) {
      billingScore = Math.max(billingScore - 20, 0);
      riskFactors.push(`Taxa de pagamento: ${Math.round(paymentRate * 100)}%`);
    }
  } else {
    billingScore = 20;
    riskFactors.push("Sem assinatura ativa");
  }

  // ========================================
  // 3. ENGAGEMENT SCORE (0-100) - Peso 25%
  // ========================================
  let engagementScore = 50;

  // Volume de vendas no mês
  if (salesThisMonth === 0) {
    engagementScore = 20;
    riskFactors.push("Sem vendas este mês");
  } else if (salesThisMonth >= 100) {
    engagementScore = 100;
  } else if (salesThisMonth >= 50) {
    engagementScore = 90;
  } else if (salesThisMonth >= 20) {
    engagementScore = 75;
  } else if (salesThisMonth >= 10) {
    engagementScore = 60;
  } else {
    engagementScore = 40;
  }

  // Tempo de conta (empresas novas têm tolerância)
  const accountAgeDays = Math.floor((now.getTime() - company.createdAt.getTime()) / (24 * 60 * 60 * 1000));
  if (accountAgeDays <= 30 && salesThisMonth === 0) {
    engagementScore = 60; // Ainda em onboarding
    opportunities.push("Acompanhar onboarding e primeiras vendas");
  }

  // ========================================
  // 4. SUPPORT SCORE (0-100) - Peso 10%
  // ========================================
  let supportScore = 80; // Placeholder - sem sistema de tickets ainda

  // Buscar tickets abertos (quando implementado)
  const openTickets = await prisma.supportTicket.count({
    where: {
      companyId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
  });

  if (openTickets > 0) {
    supportScore = Math.max(80 - openTickets * 10, 30);
    if (openTickets >= 3) {
      riskFactors.push(`${openTickets} ticket(s) aberto(s)`);
    }
  }

  // ========================================
  // CÁLCULO FINAL
  // ========================================
  const finalScore = Math.round(
    usageScore * 0.3 +
    billingScore * 0.35 +
    engagementScore * 0.25 +
    supportScore * 0.1
  );

  // Categoria baseada no score final
  let category: HealthCategory;
  if (finalScore >= 81) {
    category = HealthCategory.THRIVING;
  } else if (finalScore >= 61) {
    category = HealthCategory.HEALTHY;
  } else if (finalScore >= 41) {
    category = HealthCategory.AT_RISK;
  } else {
    category = HealthCategory.CRITICAL;
  }

  // Oportunidades baseadas no score
  if (finalScore < 60 && subscription?.status === "ACTIVE") {
    opportunities.push("Entrar em contato para identificar problemas");
  }
  if (billingScore === 100 && engagementScore >= 80 && subscription?.plan?.name === "Básico") {
    opportunities.push("Cliente qualificado para upgrade de plano");
  }

  return {
    score: finalScore,
    category,
    usageScore,
    billingScore,
    engagementScore,
    supportScore,
    riskFactors,
    opportunities,
  };
}

/**
 * Salva o Health Score calculado no banco
 */
export async function saveHealthScore(companyId: string): Promise<void> {
  const result = await calculateHealthScore(companyId);

  // Criar registro de Health Score
  await prisma.healthScore.create({
    data: {
      companyId,
      score: result.score,
      category: result.category,
      usageScore: result.usageScore,
      billingScore: result.billingScore,
      engagementScore: result.engagementScore,
      supportScore: result.supportScore,
      riskFactors: result.riskFactors,
      opportunities: result.opportunities,
    },
  });

  // Atualizar cache na Company
  await prisma.company.update({
    where: { id: companyId },
    data: {
      healthScore: result.score,
      healthCategory: result.category,
      healthUpdatedAt: new Date(),
    },
  });
}
