import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";
import { logger } from "@/lib/logger";
import { AppError, ERROR_CODES } from "@/lib/error-handler";

const log = logger.child({ module: "subscription" });

export interface SubscriptionCheckResult {
  allowed: boolean;
  status: SubscriptionStatus | "NO_SUBSCRIPTION";
  readOnly: boolean;
  message: string;
  daysLeft?: number;
  daysOverdue?: number;
  planName?: string;
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
}

/**
 * Verifica o status da assinatura de uma empresa.
 * Retorna se o acesso é permitido e em qual modo.
 */
export async function checkSubscription(companyId: string): Promise<SubscriptionCheckResult> {
  log.debug("Verificando companyId", { companyId });

  // Verificar se empresa tem acesso habilitado (bypass para dev/teste)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accessEnabled: true, name: true, isBlocked: true },
  });

  log.debug("Empresa encontrada", { company });

  // Se empresa não existe no banco (JWT com companyId antigo após reset)
  if (!company) {
    log.error("Empresa não encontrada", {
      companyId,
      hint: "Usuário precisa fazer logout/login.",
    });
    return {
      allowed: false,
      status: "NO_SUBSCRIPTION",
      readOnly: true,
      message: "EMPRESA_NAO_ENCONTRADA",
    };
  }

  // Se empresa foi bloqueada pelo admin, negar acesso imediatamente
  if (company.isBlocked) {
    return {
      allowed: false,
      status: "SUSPENDED" as SubscriptionStatus,
      readOnly: false,
      message: "Esta empresa foi bloqueada pelo administrador. Entre em contato com o suporte.",
    };
  }

  // Se accessEnabled = true, permitir acesso sem verificar assinatura
  if (company.accessEnabled) {
    log.debug("accessEnabled=true, permitindo acesso");
    return {
      allowed: true,
      status: "ACTIVE",
      readOnly: false,
      message: "Acesso habilitado.",
    };
  }

  log.debug("accessEnabled=false, verificando assinatura");

  const subscription = await prisma.subscription.findFirst({
    where: {
      companyId,
      status: {
        in: ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "TRIAL_EXPIRED"],
      },
    },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });

  if (!subscription) {
    return {
      allowed: false,
      status: "NO_SUBSCRIPTION",
      readOnly: false,
      message: "Sua empresa não possui uma assinatura ativa. Entre em contato com o suporte.",
    };
  }

  const now = new Date();
  const planName = subscription.plan.name;

  // TRIAL
  if (subscription.status === "TRIAL") {
    if (!subscription.trialEndsAt) {
      return {
        allowed: true,
        status: "TRIAL",
        readOnly: false,
        message: "Período de teste ativo.",
        planName,
      };
    }

    const daysLeft = Math.ceil(
      (subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft <= 0) {
      // updateMany c/ status no where: idempotente sob concorrência (2 requests
      // no mesmo instante não dão P2025; o 2º atualiza 0 linhas).
      await prisma.subscription.updateMany({
        where: { id: subscription.id, status: "TRIAL" },
        data: { status: "TRIAL_EXPIRED" },
      });
      return {
        allowed: false,
        status: "TRIAL_EXPIRED",
        readOnly: false,
        message: "Seu período de teste expirou. Assine um plano para continuar usando o sistema.",
        planName,
      };
    }

    return {
      allowed: true,
      status: "TRIAL",
      readOnly: false,
      message:
        daysLeft <= 3
          ? `Seu teste expira em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}! Assine agora para não perder o acesso.`
          : `Você está no período de teste. Restam ${daysLeft} dia${daysLeft > 1 ? "s" : ""}.`,
      daysLeft,
      trialEndsAt: subscription.trialEndsAt,
      planName,
    };
  }

  // ACTIVE
  if (subscription.status === "ACTIVE") {
    return {
      allowed: true,
      status: "ACTIVE",
      readOnly: false,
      message: `Plano ${planName} ativo.`,
      planName,
      currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
    };
  }

  // PAST_DUE
  if (subscription.status === "PAST_DUE") {
    const pastDueSince = subscription.pastDueSince ?? subscription.currentPeriodEnd ?? now;
    const daysOverdue = Math.ceil(
      (now.getTime() - pastDueSince.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysOverdue <= 7) {
      return {
        allowed: true,
        status: "PAST_DUE",
        readOnly: true,
        message: `Pagamento pendente há ${daysOverdue} dia${daysOverdue > 1 ? "s" : ""}. Regularize para continuar usando todas as funções.`,
        daysOverdue,
        planName,
      };
    }

    // Grace period expirado → suspender (updateMany idempotente sob concorrência)
    await prisma.subscription.updateMany({
      where: { id: subscription.id, status: "PAST_DUE" },
      data: { status: "SUSPENDED" },
    });
    return {
      allowed: false,
      status: "SUSPENDED",
      readOnly: false,
      message: "Sua assinatura foi suspensa por falta de pagamento. Regularize para voltar a usar o sistema.",
      daysOverdue,
      planName,
    };
  }

  // SUSPENDED
  if (subscription.status === "SUSPENDED") {
    return {
      allowed: false,
      status: "SUSPENDED",
      readOnly: false,
      message: "Sua assinatura está suspensa. Regularize o pagamento para voltar a usar o sistema.",
      planName,
    };
  }

  // CANCELED
  if (subscription.status === "CANCELED") {
    return {
      allowed: false,
      status: "CANCELED",
      readOnly: false,
      message: "Sua assinatura foi cancelada. Entre em contato com o suporte para reativar.",
      planName,
    };
  }

  // TRIAL_EXPIRED
  if (subscription.status === "TRIAL_EXPIRED") {
    return {
      allowed: false,
      status: "TRIAL_EXPIRED",
      readOnly: false,
      message: "Seu período de teste expirou. Assine um plano para continuar usando o sistema.",
      planName,
    };
  }

  return {
    allowed: false,
    status: subscription.status,
    readOnly: false,
    message: "Status de assinatura desconhecido. Entre em contato com o suporte.",
  };
}

/**
 * F1/F2 (Grupo F): guard de ESCRITA. Bloqueia operações que criam dinheiro/dados
 * (venda, OS, recebimento, cliente, produto) quando a assinatura não permite:
 *  - !allowed → SUSPENDED / CANCELED / TRIAL_EXPIRED / empresa bloqueada / sem sub.
 *  - readOnly → PAST_DUE no grace period (pode LER, não ESCREVER).
 *
 * Antes, o gating só existia no layout (frontend) — qualquer POST direto na API
 * passava. Leitura (GET) NÃO usa este guard; só escrita.
 *
 * @throws AppError 403 SUBSCRIPTION_BLOCKED
 */
export async function requireWriteAccess(companyId: string): Promise<void> {
  // Kill switch global coerente com o feature gating.
  if (process.env.DISABLE_PLAN_FEATURE_GATING === "true") return;

  const check = await checkSubscription(companyId);

  if (!check.allowed || check.readOnly) {
    throw new AppError(
      ERROR_CODES.SUBSCRIPTION_BLOCKED,
      check.message ||
        "Sua assinatura não permite esta operação. Regularize o pagamento para continuar.",
      403
    );
  }
}

/**
 * Retorna informações resumidas da assinatura para exibição.
 */
export async function getSubscriptionInfo(companyId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { plan: { include: { features: true } } },
  });

  if (!subscription) return null;

  // F3 (Grupo F): só expõe as features pagas se a assinatura está VIVA. Em
  // CANCELED/SUSPENDED/TRIAL_EXPIRED as features somem (antes continuavam
  // liberadas — empresa cancelada mantinha recursos do plano). Empresas em
  // modo accessEnabled passam pelo bypass de checkSubscription/layout, não por
  // aqui; o feature gating real é o requirePlanFeature.
  const LIVE_STATUSES: SubscriptionStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE"];
  const isLive = LIVE_STATUSES.includes(subscription.status);
  const features = isLive
    ? subscription.plan.features.reduce(
        (acc, f) => ({ ...acc, [f.key]: f.value }),
        {} as Record<string, string>
      )
    : {};

  return {
    id: subscription.id,
    status: subscription.status,
    planName: subscription.plan.name,
    planSlug: subscription.plan.slug,
    billingCycle: subscription.billingCycle,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    features,
    limits: {
      maxUsers: subscription.plan.maxUsers,
      maxBranches: subscription.plan.maxBranches,
      maxProducts: subscription.plan.maxProducts,
      maxStorageMB: subscription.plan.maxStorageMB,
    },
  };
}
