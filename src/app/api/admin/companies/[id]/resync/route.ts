import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { resyncCompanySetup } from "@/services/company-resync.service";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isOpticalOnlyActionAllowed, OPTICAL_ONLY_ACTION_MESSAGE } from "@/lib/admin-optical-only";

const log = logger.child({ route: "admin/companies/[id]/resync" });

/**
 * POST /api/admin/companies/[id]/resync
 *
 * Re-aplica os defaults de SETUP de uma empresa JÁ EXISTENTE para alinhá-la ao
 * padrão atual do sistema. Resolve a dor de "correção não chega a todos": parte
 * da configuração (plano de contas, contas financeiras, templates de conciliação,
 * mensagens padrão) é gravada por empresa no cadastro (snapshot) e não propaga
 * sozinha quando o catálogo de defaults muda. Empresas antigas (ex.: Ótica ULTRA,
 * Atacadão) ficam com a versão velha até rodar este resync.
 *
 * A lógica vive em company-resync.service.ts (compartilhada com o auto-sync do
 * cron). É SEGURO/IDEMPOTENTE: só cria o que falta e atualiza defaults intactos —
 * não apaga dados do usuário, não mexe em saldos, não sobrescreve mensagens
 * personalizadas, não duplica contas. Auditoria só é gravada quando algo mudou.
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

  const { id: companyId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  try {
    // Gate de produto (dívida B4). O que este resync reaplica — plano de contas,
    // contas financeiras, templates de conciliação — é a configuração do PDV
    // ótico; uma clínica não tem nenhuma dessas estruturas. A UI já esconde o
    // botão para medical, mas esconder não é gatear: até aqui a chamada direta
    // à API passava.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { platformProduct: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }
    if (!isOpticalOnlyActionAllowed(company.platformProduct)) {
      log.warn("resync bloqueado por produto", { companyId, product: company.platformProduct });
      return NextResponse.json({ error: OPTICAL_ONLY_ACTION_MESSAGE }, { status: 403 });
    }

    const result = await resyncCompanySetup(companyId, {
      actorType: "ADMIN_USER",
      actorId: admin.id,
      actorEmail: admin.email,
    });
    if (!result) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }
    log.info("Empresa re-sincronizada", { companyId, created: result.created });
    return NextResponse.json({
      success: true,
      data: {
        companyName: result.companyName,
        before: result.before,
        after: result.after,
        created: result.created,
        messages: result.messages,
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
