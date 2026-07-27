import { NextResponse } from "next/server";

import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getSupportAuditFromDomus } from "@/lib/vis-support-audit-client";
import { mergeSupportTrail } from "@/services/support-trail.service";

const log = logger.child({ route: "admin/companies/[id]/support-trail" });

/**
 * GET /api/admin/companies/[id]/support-trail — trilha de acessos de suporte da
 * clínica, para o OPERADOR (N7).
 *
 * 🚨 ESTE É O ÚNICO PONTO DE AUTORIZAÇÃO DO CANAL. O endpoint do Domus é
 * autenticado mas NÃO autorizado: quem tem o segredo assina qualquer clinicId.
 * Isso foi aceito como propriedade deliberada porque a fronteira de tenant vive
 * AQUI — e o docblock daquela rota já afirma que o Vis gateia por papel.
 *
 * ⚠️ O gate é `requireCompanyScope` — e NÃO o gate irmão de escopo-de-suporte
 * que a página de detalhe do cliente usa. Aquele não checa papel de propósito
 * (a equipe de suporte precisa ver a ficha), mas `AdminUser.role` tem default
 * SUPPORT com scopeAllCompanies default true: herdá-lo abriria a trilha de
 * acesso a PHI para SUPPORT e BILLING em TODAS as empresas.
 * `requireCompanyScope` revalida o papel no banco e só admite SUPER_ADMIN/ADMIN:
 * quem pode CONCEDER o acesso é quem pode AUDITAR o acesso.
 *
 * (O nome do gate rejeitado é deliberadamente NÃO escrito aqui: o teste desta
 * rota proíbe esse identificador no arquivo inteiro, para que nem um import
 * acidental nem um "vou trocar só pra destravar" passem despercebidos.)
 *
 * 📌 Existe um helper `requireAdminAndScope` em `@/lib/admin-session` que
 * empacota sessão+escopo. NÃO é usado aqui de propósito: o modo dele decide o
 * gate por parâmetro, e nesta rota — o único ponto de autorização do canal — a
 * escolha do gate tem que estar VISÍVEL na chamada, não num default. Adotá-lo
 * aqui também esconderia do teste a chamada que ele verifica.
 */

export const dynamic = "force-dynamic";

/** As ações que só o Vis conhece: tentativas que nunca viraram acesso. */
const ACOES_SUPORTE = [
  "SUPPORT_ACCESS_GRANTED",
  "SUPPORT_ACCESS_DENIED",
  "SUPPORT_ACCESS_STUCK",
];

/** Teto local, espelhando o do Domus. */
const LIMITE_VIS = 200;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) {
    return NextResponse.json(
      { error: "Sem permissão para esta empresa" },
      { status: 403 },
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { domusClinicId: true },
  });

  // Metade LOCAL: as tentativas recusadas/travadas, que o Domus não conhece —
  // um resgate rejeitado nunca cria grant lá.
  const visRows = await prisma.globalAudit.findMany({
    where: { companyId, action: { in: ACOES_SUPORTE } },
    orderBy: { createdAt: "desc" },
    take: LIMITE_VIS,
    include: { adminUser: { select: { name: true, email: true } } },
  });

  const vis = visRows.map((r) => {
    // `metadata` é Json?: no runtime pode ser string, número ou ARRAY, não só
    // objeto — e `?? {}` só cobre null/undefined. Num array, `.supportGrantId`
    // devolve undefined em SILÊNCIO: a linha perde a correlação e deixa de casar
    // com a metade do Domus. Numa trilha que existe justamente para correlacionar
    // dois bancos SEM foreign key entre eles, esse é o pior modo de falha.
    const meta =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as { supportGrantId?: unknown; adminEmail?: unknown })
        : {};
    // Os valores vêm de JSON sem tipo: um supportGrantId numérico entraria no
    // `Map<string, string>` da junção como número e nunca casaria com a string
    // do Domus. Coage aqui, na fronteira.
    const adminEmail = typeof meta.adminEmail === "string" ? meta.adminEmail : null;
    return {
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      supportGrantId: typeof meta.supportGrantId === "string" ? meta.supportGrantId : null,
      // Nome real do operador: já está em claro no GlobalAudit. O e-mail
      // congelado no metadata é o fallback para admin removido depois.
      operatorName: r.adminUser?.name ?? r.adminUser?.email ?? adminEmail,
    };
  });

  // Sem clínica provisionada não há metade remota — mas a local ainda vale.
  if (!company?.domusClinicId) {
    return NextResponse.json({
      data: {
        items: mergeSupportTrail({ domus: [], vis }),
        truncated: false,
        medical: "not_provisioned",
      },
    });
  }

  const remoto = await getSupportAuditFromDomus(company.domusClinicId);

  if (remoto.kind === "unavailable") {
    // Destructurado, e não acessado inline pelo caminho `remoto.<reason>`,
    // porque o teste proíbe ESSA expressão literal em qualquer ponto do handler
    // — comentário incluído, então nem aqui ela pode ser escrita por extenso. A
    // proibição existe para a RESPOSTA: o log pode carregar a causa, mas o campo
    // não deve ressuscitar na tela por acidente.
    const { reason: causaDiagnostica } = remoto;
    // Degrada com a metade local + aviso. NUNCA lista vazia: trilha vazia que
    // significa erro de rede leva a concluir que não houve acesso.
    //
    // O `reason` NÃO atravessa para a resposta: é diagnóstico com texto cru de
    // rede (`falha_de_rede: <err.message>`), que não é para a tela. Mas ele vai
    // para o LOG — esta rota é consultada DURANTE incidente, e enterrar a causa
    // deixaria o operador com "indisponível" sem nada para escalar.
    log.error("Trilha do Domus indisponível", {
      companyId,
      reason: causaDiagnostica,
    });
    return NextResponse.json({
      data: {
        items: mergeSupportTrail({ domus: [], vis }),
        truncated: false,
        medical: "unavailable",
      },
    });
  }

  return NextResponse.json({
    data: {
      items: mergeSupportTrail({ domus: remoto.events, vis }),
      truncated: remoto.truncated,
      medical: "ok",
    },
  });
}
