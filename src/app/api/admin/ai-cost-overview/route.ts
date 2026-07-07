import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getAiCostOverview, getAiCostTrend } from "@/services/ai-cost-overview.service";

/**
 * GET /api/admin/ai-cost-overview
 * Dashboard de custo da Central de IA (aba "Visão Geral"): cards do mês
 * (custo real / preço / lucro + tendência), adoção, consumo interno, custo por
 * feature, e a série de 6 meses (custo × lucro). Exclusiva do super admin.
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const now = new Date();
  const [overview, trend] = await Promise.all([
    getAiCostOverview(now),
    getAiCostTrend(now, 6),
  ]);

  return NextResponse.json({ data: { overview, trend } });
}
