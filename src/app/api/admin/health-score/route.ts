import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { saveHealthScore } from "@/lib/health-score";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/health-score
 * Recalcula health score de uma ou todas as empresas
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { companyId } = body;

    if (companyId) {
      // Recalcular para uma empresa específica
      await saveHealthScore(companyId);

      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          companyId,
          action: "HEALTH_SCORE_RECALCULATED",
          metadata: { companyId },
        },
      });

      return NextResponse.json({
        success: true,
        message: "Health score recalculado",
      });
    } else {
      // Recalcular para todas as empresas ativas
      const companies = await prisma.company.findMany({
        where: {
          isBlocked: false,
          subscriptions: {
            some: {
              status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
            },
          },
        },
        select: { id: true },
      });

      let successCount = 0;
      let errorCount = 0;

      for (const company of companies) {
        try {
          await saveHealthScore(company.id);
          successCount++;
        } catch (error) {
          console.error(`[HEALTH SCORE] Erro ao calcular para ${company.id}:`, error);
          errorCount++;
        }
      }

      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          action: "HEALTH_SCORE_BATCH_RECALCULATED",
          metadata: { total: companies.length, successCount, errorCount },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Health scores recalculados: ${successCount} sucesso, ${errorCount} erros`,
        total: companies.length,
        successCount,
        errorCount,
      });
    }
  } catch (error) {
    console.error("[HEALTH SCORE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao recalcular health score" },
      { status: 500 }
    );
  }
}
