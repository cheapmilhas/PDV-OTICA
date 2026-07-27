import { NextResponse } from "next/server";

import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { deriveMedicalOnboarding } from "@/lib/medical-onboarding";
import { getClinicUsageFromDomus } from "@/lib/vis-usage-client";

const log = logger.child({ route: "admin/companies/[id]/clinic-usage" });

/**
 * GET /api/admin/companies/[id]/clinic-usage — uso agregado da clínica (N6).
 *
 * Responde "esta clínica começou a usar o produto?" para o operador. O dado
 * vive no Domus; aqui ele é lido sob demanda e DERIVADO em checklist. Nada é
 * persistido deste lado.
 *
 * 🚨 ESTE É O ÚNICO PONTO DE AUTORIZAÇÃO DO CANAL. O endpoint do Domus é
 * autenticado mas NÃO autorizado: quem tem o segredo assina qualquer clinicId.
 * Isso foi aceito como propriedade deliberada porque a fronteira de tenant vive
 * AQUI — e o docblock daquela rota afirma a dependência explicitamente.
 *
 * ⚠️ O gate é `requireCompanyScope`, o mesmo do N7 e pela mesma razão: o gate
 * irmão de escopo-de-suporte NÃO checa papel (de propósito — a equipe de
 * suporte precisa ver a ficha), mas `AdminUser.role` tem default SUPPORT com
 * `scopeAllCompanies` default true. Herdá-lo abriria o perfil de uso de TODAS
 * as clínicas para SUPPORT e BILLING.
 *
 * 🔑 O `clinicId` sai de `Company.domusClinicId`, NUNCA de input do operador.
 * Aceitar id do cliente aqui tornaria o gate de escopo decorativo: bastaria
 * pedir a clínica de outro tenant.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Escopo ANTES de ler a empresa: a URL é adivinhável, e sem isto um admin
  // restrito descobriria o perfil de uso de clínica fora do seu escopo.
  const scoped = await requireCompanyScope(admin.id, id);
  if (!scoped) {
    // 404 e não 403: não confirma a existência do id para quem não pode vê-lo.
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: { platformProduct: true, domusClinicId: true },
  });

  if (!company || company.platformProduct !== "VIS_MEDICAL") {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  // Sem clínica provisionada não há o que perguntar. Estado PRÓPRIO, distinto
  // de falha: a tela diz "ainda não provisionada", que é informação útil, e não
  // "não foi possível consultar", que sugeriria incidente.
  if (!company.domusClinicId) {
    return NextResponse.json({ data: { state: "nao_provisionada" } });
  }

  const result = await getClinicUsageFromDomus(company.domusClinicId);

  if (result.kind === "unavailable") {
    // O `reason` fica no LOG, não na resposta: é diagnóstico de operação, e a
    // tela só precisa saber que não deu. Vazá-lo daria a um admin restrito
    // pistas sobre a configuração do canal.
    log.warn("Uso da clínica indisponível", { companyId: id, reason: result.reason });
    // 200 com estado explícito, não 5xx: indisponibilidade do canal é um
    // ESTADO PREVISTO desta tela (canal desligado, Domus lento), não erro da
    // requisição do operador. A tela renderiza o aviso e um botão de tentar de
    // novo; um 5xx faria o cliente tratá-lo como falha da própria rota.
    return NextResponse.json({ data: { state: "indisponivel" } });
  }

  return NextResponse.json({
    data: {
      state: "ok",
      usage: result.usage,
      onboarding: deriveMedicalOnboarding(result.usage),
    },
  });
}
