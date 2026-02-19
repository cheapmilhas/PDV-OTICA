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
  const { action } = await request.json();

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
