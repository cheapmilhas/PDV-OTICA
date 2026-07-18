import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildEntitlementPayload } from "@/lib/vis-domus-publisher";

/**
 * GET /api/internal/domus/entitlements/[clinicId]
 *
 * Pull de reparação: o cron do Domus consulta o estado atual de uma clínica.
 * Autenticado pelo MESMO segredo do canal (Bearer), timing-safe, fail-closed.
 * Sem auth aqui = vazamento de estado contratual (Codex).
 *
 * clinicId = domusClinicId (uuid da clínica no Domus). Resolve a Company por
 * esse vínculo e devolve o DTO completo. 404 se não houver clínica vinculada.
 */

function authorized(req: Request): boolean {
  const secret = process.env.VIS_DOMUS_WEBHOOK_SECRET;
  if (!secret) return false; // fail-closed
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clinicId: string }> },
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { clinicId } = await params;

  const company = await prisma.company.findFirst({
    where: {
      domusClinicId: clinicId,
      platformProduct: "VIS_MEDICAL",
      // Clínica excluída não é reconciliável (soft-delete).
      OR: [{ blockedReason: null }, { blockedReason: { not: "DELETED" } }],
    },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "clinic_not_linked" }, { status: 404 });
  }

  const payload = await buildEntitlementPayload(company.id, new Date());
  if (!payload) {
    return NextResponse.json({ error: "clinic_not_linked" }, { status: 404 });
  }

  return NextResponse.json(payload);
}
