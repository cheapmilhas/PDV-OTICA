import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;
  const body = await request.json();
  const { action } = body;

  try {
    switch (action) {
      case "block": {
        await prisma.company.update({
          where: { id: companyId },
          data: { isBlocked: true, blockedReason: "ADMIN_ACTION", blockedAt: new Date() },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "COMPANY_BLOCKED", metadata: { adminEmail: admin.email } },
        });
        return NextResponse.json({ success: true, message: "Empresa bloqueada" });
      }

      case "unblock": {
        await prisma.company.update({
          where: { id: companyId },
          data: { isBlocked: false, blockedReason: null, blockedAt: null },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "COMPANY_UNBLOCKED", metadata: { adminEmail: admin.email } },
        });
        return NextResponse.json({ success: true, message: "Empresa desbloqueada" });
      }

      case "reactivate": {
        const subscription = await prisma.subscription.findFirst({ where: { companyId, status: "SUSPENDED" } });
        if (!subscription) return NextResponse.json({ error: "Assinatura suspensa não encontrada" }, { status: 400 });
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: "ACTIVE", pastDueSince: null },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "SUBSCRIPTION_REACTIVATED", metadata: { subscriptionId: subscription.id } },
        });
        return NextResponse.json({ success: true, message: "Assinatura reativada" });
      }

      case "extend_trial": {
        const subscription = await prisma.subscription.findFirst({ where: { companyId, status: "TRIAL" } });
        if (!subscription) return NextResponse.json({ error: "Trial não encontrado" }, { status: 400 });
        const newEnd = new Date(subscription.trialEndsAt ?? new Date());
        newEnd.setDate(newEnd.getDate() + 7);
        await prisma.subscription.update({ where: { id: subscription.id }, data: { trialEndsAt: newEnd } });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "TRIAL_EXTENDED", metadata: { newTrialEnd: newEnd.toISOString() } },
        });
        return NextResponse.json({ success: true, message: `Trial estendido até ${newEnd.toLocaleDateString("pt-BR")}` });
      }

      case "change_plan": {
        const { planId } = body;
        if (!planId) return NextResponse.json({ error: "planId é obrigatório" }, { status: 400 });

        const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!newPlan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 400 });

        const subscription = await prisma.subscription.findFirst({
          where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
          include: { plan: true },
        });
        if (!subscription) return NextResponse.json({ error: "Assinatura ativa não encontrada" }, { status: 400 });

        const oldPlan = subscription.plan;
        const isUpgrade = newPlan.priceMonthly > oldPlan.priceMonthly;

        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId },
          }),
          prisma.company.update({
            where: { id: companyId },
            data: {
              maxUsers: newPlan.maxUsers,
              maxProducts: newPlan.maxProducts,
              maxBranches: newPlan.maxBranches,
            },
          }),
          prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: isUpgrade ? "upgraded" : "downgraded",
              fromPlanId: oldPlan.id,
              toPlanId: newPlan.id,
              fromStatus: subscription.status,
              toStatus: subscription.status,
              reason: `${isUpgrade ? "Upgrade" : "Downgrade"}: ${oldPlan.name} → ${newPlan.name}`,
              adminId: admin.id,
              adminName: admin.name,
            },
          }),
          prisma.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              companyId,
              action: isUpgrade ? "PLAN_UPGRADED" : "PLAN_DOWNGRADED",
              metadata: { fromPlan: oldPlan.name, toPlan: newPlan.name, subscriptionId: subscription.id },
            },
          }),
        ]);

        return NextResponse.json({ success: true, message: `Plano alterado: ${oldPlan.name} → ${newPlan.name}` });
      }

      case "cancel_subscription": {
        const { reason } = body;
        if (!reason) return NextResponse.json({ error: "Motivo é obrigatório" }, { status: 400 });

        const subscription = await prisma.subscription.findFirst({
          where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
        });
        if (!subscription) return NextResponse.json({ error: "Assinatura ativa não encontrada" }, { status: 400 });

        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "CANCELED", canceledAt: new Date(), cancelReason: reason },
          }),
          prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: "canceled",
              fromStatus: subscription.status,
              toStatus: "CANCELED",
              reason,
              adminId: admin.id,
              adminName: admin.name,
            },
          }),
          prisma.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              companyId,
              action: "SUBSCRIPTION_CANCELED",
              metadata: { subscriptionId: subscription.id, reason },
            },
          }),
        ]);

        return NextResponse.json({ success: true, message: "Assinatura cancelada" });
      }

      case "change_billing_cycle": {
        const { cycle } = body;
        if (!cycle || !["MONTHLY", "YEARLY"].includes(cycle)) {
          return NextResponse.json({ error: "Ciclo inválido. Use MONTHLY ou YEARLY" }, { status: 400 });
        }

        const subscription = await prisma.subscription.findFirst({
          where: { companyId, status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
        });
        if (!subscription) return NextResponse.json({ error: "Assinatura ativa não encontrada" }, { status: 400 });

        if (subscription.billingCycle === cycle) {
          return NextResponse.json({ error: `Assinatura já está no ciclo ${cycle === "MONTHLY" ? "Mensal" : "Anual"}` }, { status: 400 });
        }

        const oldCycle = subscription.billingCycle;
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { billingCycle: cycle },
          }),
          prisma.subscriptionHistory.create({
            data: {
              subscriptionId: subscription.id,
              action: "billing_cycle_changed",
              fromStatus: subscription.status,
              toStatus: subscription.status,
              reason: `Ciclo alterado: ${oldCycle === "MONTHLY" ? "Mensal" : "Anual"} → ${cycle === "MONTHLY" ? "Mensal" : "Anual"}`,
              adminId: admin.id,
              adminName: admin.name,
              metadata: { fromCycle: oldCycle, toCycle: cycle },
            },
          }),
          prisma.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              companyId,
              action: "BILLING_CYCLE_CHANGED",
              metadata: { subscriptionId: subscription.id, fromCycle: oldCycle, toCycle: cycle },
            },
          }),
        ]);

        return NextResponse.json({ success: true, message: `Ciclo alterado para ${cycle === "MONTHLY" ? "Mensal" : "Anual"}` });
      }

      case "delete": {
        if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Apenas SUPER_ADMIN pode excluir empresas" }, { status: 403 });
        await prisma.company.update({
          where: { id: companyId },
          data: { isBlocked: true, blockedReason: "DELETED", blockedAt: new Date() },
        });
        await prisma.globalAudit.create({
          data: { actorType: "ADMIN_USER", actorId: admin.id, companyId, action: "COMPANY_DELETED" },
        });
        return NextResponse.json({ success: true, message: "Empresa excluída" });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    console.error("[ADMIN-ACTIONS] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
