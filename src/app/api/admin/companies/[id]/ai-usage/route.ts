import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { getAiConfig } from "@/services/ai-config.service";
import { getMonthlyUsage, getDailyUsage } from "@/services/ai-usage.service";
import { usdToBrl } from "@/lib/ai-pricing";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/companies/[id]/ai-usage
 * Retorna uso mensal + diário + custo em R$ (com markup) + flags da empresa.
 * Rota exclusiva do super-admin (acesso scoped).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id: companyId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });

  const [cfg, usage, daily] = await Promise.all([
    getAiConfig(),
    getMonthlyUsage(companyId),
    getDailyUsage(companyId),
  ]);

  const costBrl = usdToBrl(usage.totalCostUsd, cfg.usdBrlRate) * (1 + cfg.markupPercent / 100);

  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true },
  });

  return NextResponse.json({
    data: {
      usage,
      daily,
      costBrl,
      creditTokenFactor: cfg.creditTokenFactor,
      settings,
    },
  });
}
