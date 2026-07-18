import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/internal/domus/entitlements  (sem id)
 *
 * Listagem para o BOOTSTRAP do cron do Domus: o Domus só conhece clínicas que
 * já têm espelho em clinic_entitlements. Se o 1º webhook de uma clínica falhou,
 * o cron não a encontraria — este endpoint dá a lista canônica do Vis para ele
 * varrer. Retorna só o vínculo, não o estado (o pull por-clínica traz o estado).
 *
 * Mesmo segredo/Bearer, timing-safe, fail-closed.
 */

function authorized(req: Request): boolean {
  const secret = process.env.VIS_DOMUS_WEBHOOK_SECRET;
  if (!secret) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const linked = await prisma.company.findMany({
    where: {
      platformProduct: "VIS_MEDICAL",
      domusClinicId: { not: null },
      // Não expor clínicas excluídas ao Domus (soft-delete). NULL != 'DELETED'
      // é NULL em SQL → incluir o null explicitamente.
      OR: [{ blockedReason: null }, { blockedReason: { not: "DELETED" } }],
    },
    select: { id: true, domusClinicId: true },
  });

  return NextResponse.json({
    clinics: linked.map((c) => ({ visCompanyId: c.id, domusClinicId: c.domusClinicId })),
  });
}
