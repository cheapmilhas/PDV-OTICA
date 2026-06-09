import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { setupCompanyFinance } from "@/services/finance-setup.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/companies/[id]/resync" });

/**
 * POST /api/admin/companies/[id]/resync
 *
 * Re-aplica os defaults de SETUP de uma empresa JÁ EXISTENTE para alinhá-la ao
 * padrão atual do sistema. Resolve a dor de "correção não chega a todos": parte
 * da configuração (plano de contas, contas financeiras, templates de conciliação)
 * é gravada por empresa no cadastro (snapshot) e não propaga sozinha quando o
 * catálogo de defaults muda. Empresas antigas (ex.: Ótica ULTRA, Atacadão) ficam
 * com a versão velha até rodar este resync.
 *
 * É SEGURO/IDEMPOTENTE: setupCompanyFinance usa upsert por (companyId, code/name),
 * então só cria o que falta e atualiza nome/tipo dos defaults — não apaga dados
 * do usuário, não mexe em saldos (balance só no create), não duplica contas.
 *
 * NÃO cria produtos de exemplo (decisão: produtos de exemplo seguem opcionais e
 * só entram pelo onboarding).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id: companyId } = await params;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // Filial principal (mais antiga) para vincular contas financeiras novas.
    const branch = await prisma.branch.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    // Contagens antes/depois para reportar o que foi alterado.
    const before = {
      chartOfAccounts: await prisma.chartOfAccounts.count({ where: { companyId } }),
      financeAccounts: await prisma.financeAccount.count({ where: { companyId } }),
      reconciliationTemplates: await prisma.reconciliationTemplate.count({ where: { companyId } }),
    };

    await prisma.$transaction(async (tx) => {
      await setupCompanyFinance(tx, companyId, branch?.id);
    });

    const after = {
      chartOfAccounts: await prisma.chartOfAccounts.count({ where: { companyId } }),
      financeAccounts: await prisma.financeAccount.count({ where: { companyId } }),
      reconciliationTemplates: await prisma.reconciliationTemplate.count({ where: { companyId } }),
    };

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId,
        action: "COMPANY_RESYNCED",
        metadata: { before, after, adminEmail: admin.email },
      },
    });

    log.info("Empresa re-sincronizada", { companyId, before, after });

    return NextResponse.json({
      success: true,
      data: {
        companyName: company.name,
        before,
        after,
        created: {
          chartOfAccounts: after.chartOfAccounts - before.chartOfAccounts,
          financeAccounts: after.financeAccounts - before.financeAccounts,
          reconciliationTemplates: after.reconciliationTemplates - before.reconciliationTemplates,
        },
      },
    });
  } catch (error) {
    log.error("Erro ao re-sincronizar empresa", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno ao re-sincronizar" }, { status: 500 });
  }
}
