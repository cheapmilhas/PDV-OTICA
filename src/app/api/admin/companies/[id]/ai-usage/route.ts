import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { getAiConfig } from "@/services/ai-config.service";
import { getMonthlyUsage, getDailyUsage } from "@/services/ai-usage.service";
import { getEffectiveMarkup } from "@/services/ai-margin.service";
import { usdToBrl, priceForCompany } from "@/lib/ai-pricing";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/companies/[id]/ai-usage
 * Retorna uso mensal + diário + os 4 números do super-admin:
 * custo real em R$, margem efetiva por empresa, preço que a ótica paga e lucro/subsídio.
 * Rota exclusiva do super-admin (acesso scoped) — vê TUDO.
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

  const [cfg, usage, daily, markup] = await Promise.all([
    getAiConfig(),
    getMonthlyUsage(companyId),
    getDailyUsage(companyId),
    getEffectiveMarkup(companyId),
  ]);

  // Custo real em R$ (sem margem) — o que o Vis paga ao provedor.
  const costBrlReal = usdToBrl(usage.totalCostUsd, cfg.usdBrlRate);
  // Preço que a ótica paga = custo × câmbio × (1 + margem efetiva%). Margem por empresa (override ?? global).
  const priceBrl = priceForCompany(usage.totalCostUsd, cfg.usdBrlRate, markup);
  // Lucro (ou subsídio, se negativo). round6 evita ruído de float.
  const lucroBrl = Math.round((priceBrl - costBrlReal) * 1e6) / 1e6;

  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true },
  });

  return NextResponse.json({
    data: {
      usage,
      daily,
      costBrlReal,
      markupPercent: markup,
      priceBrl,
      lucroBrl,
      creditTokenFactor: cfg.creditTokenFactor,
      settings,
    },
  });
}
