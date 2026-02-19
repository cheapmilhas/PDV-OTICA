import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

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
      await prisma.subscription.update({
        where: { id: subscription.id },
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

    // Grace period expirado → suspender
    await prisma.subscription.update({
      where: { id: subscription.id },
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
 * Retorna informações resumidas da assinatura para exibição.
 */
export async function getSubscriptionInfo(companyId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { plan: { include: { features: true } } },
  });

  if (!subscription) return null;

  return {
    id: subscription.id,
    status: subscription.status,
    planName: subscription.plan.name,
    planSlug: subscription.plan.slug,
    billingCycle: subscription.billingCycle,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    features: subscription.plan.features.reduce(
      (acc, f) => ({ ...acc, [f.key]: f.value }),
      {} as Record<string, string>
    ),
    limits: {
      maxUsers: subscription.plan.maxUsers,
      maxBranches: subscription.plan.maxBranches,
      maxProducts: subscription.plan.maxProducts,
      maxStorageMB: subscription.plan.maxStorageMB,
    },
  };
}
