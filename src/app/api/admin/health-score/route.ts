import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { saveHealthScore, recalcAllActiveHealthScores } from "@/lib/health-score";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/health-score" });

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
      // Recalcular para todas as empresas ativas (fonte única compartilhada
      // com o cron diário — recalcAllActiveHealthScores).
      const { total, successCount, errorCount } = await recalcAllActiveHealthScores(
        (companyId, error) =>
          log.error("Erro ao calcular health score", {
            companyId,
            error: error instanceof Error ? error.message : String(error),
          })
      );

      await prisma.globalAudit.create({
        data: {
          actorType: "ADMIN_USER",
          actorId: admin.id,
          action: "HEALTH_SCORE_BATCH_RECALCULATED",
          metadata: { total, successCount, errorCount },
        },
      });

      return NextResponse.json({
        success: true,
        message: `Health scores recalculados: ${successCount} sucesso, ${errorCount} erros`,
        total,
        successCount,
        errorCount,
      });
    }
  } catch (error) {
    log.error("Erro ao recalcular health score", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Erro ao recalcular health score" },
      { status: 500 }
    );
  }
}
