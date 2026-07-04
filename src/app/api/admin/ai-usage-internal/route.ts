import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getInternalMonthlyUsage } from "@/services/ai-usage.service";
import { getAiConfig } from "@/services/ai-config.service";
import { usdToBrl } from "@/lib/ai-pricing";

/**
 * GET /api/admin/ai-usage-internal
 * Uso de IA INTERNO/GLOBAL do mês corrente (companyId=null: playground do super
 * admin + chamadas internas). Esse gasto é real mas não pertence a nenhuma ótica;
 * antes não aparecia em painel nenhum. Só SUPER_ADMIN.
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const usage = await getInternalMonthlyUsage();
  const cfg = await getAiConfig();
  const costBrl = usdToBrl(usage.totalCostUsd, cfg.usdBrlRate);

  return NextResponse.json({
    data: {
      totalTokens: usage.totalTokens,
      totalCostUsd: usage.totalCostUsd,
      costBrl,
      byFeature: usage.byFeature,
    },
  });
}
