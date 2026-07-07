import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { getAllCompaniesAiOverview } from "@/services/ai-companies-overview.service";

/**
 * GET /api/admin/ai-companies-overview
 * Tabela central da aba "Óticas": todas as óticas com IA disponível/ativa +
 * o gasto do mês agregado por ótica (custo real, margem, preço, lucro) + os
 * controles editáveis (flags, cota, override de margem).
 *
 * Exclusiva do super admin. A edição por linha usa a rota já existente
 * PATCH /api/admin/companies/[id]/ai-settings.
 */
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const rows = await getAllCompaniesAiOverview();
  return NextResponse.json({ data: rows });
}
