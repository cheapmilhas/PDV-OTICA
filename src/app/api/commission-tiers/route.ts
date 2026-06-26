import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { requirePlanFeature } from "@/lib/plan-features";
import { commissionTiersSchema } from "@/lib/validations/commission-tier.schema";
import {
  getCommissionTiers,
  saveCommissionTiers,
  listConfiguredOverrides,
} from "@/services/commission-tier.service";

/**
 * Configuração de metas por níveis (mini/meta/mega) — Comissão Fase 2.
 *
 * Mesmo gating da config de comissões existente: feature de plano "goals" +
 * permissão settings.edit para editar. NÃO chama o motor, NÃO toca nos cálculos
 * antigos — só lê/grava SellerCommissionTier.
 *
 * GET  /api/commission-tiers            → metas padrão da loja + lista de overrides
 * GET  /api/commission-tiers?userId=X   → metas de um vendedor (override)
 * PUT  /api/commission-tiers            → salva metas de um escopo (loja ou vendedor)
 */

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");

    const userIdParam = request.nextUrl.searchParams.get("userId");
    const userId = userIdParam && userIdParam.length > 0 ? userIdParam : null;

    const tiers = await getCommissionTiers(companyId, userId);

    // Na consulta do padrão da loja, devolve também quais vendedores já têm override.
    const overrides = userId === null ? await listConfiguredOverrides(companyId) : undefined;

    return NextResponse.json({ success: true, data: { tiers, overrides } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePlanFeature(companyId, "goals");
    await requirePermission("settings.edit");

    const body = await request.json();
    const data = commissionTiersSchema.parse(body);

    const tiers = await saveCommissionTiers(companyId, data);
    return NextResponse.json({ success: true, data: tiers, message: "Metas salvas" });
  } catch (error) {
    return handleApiError(error);
  }
}
