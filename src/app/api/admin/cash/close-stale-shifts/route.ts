import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

const bodySchema = z.object({
  companyId: z.string().min(1).optional(),
  thresholdHours: z.number().int().min(1).max(24 * 30).default(24),
  apply: z.boolean().default(false),
  reason: z.string().min(3).default("Fechamento automático por inatividade (turno antigo)"),
});

/**
 * POST /api/admin/cash/close-stale-shifts
 *
 * Fecha turnos de caixa que estão abertos há mais de `thresholdHours` horas.
 * Por padrão roda em DRY-RUN (`apply=false`) — retorna a lista que seria afetada
 * sem alterar o banco.
 *
 * Body:
 *   - companyId?: string         (restringe a uma empresa; sem isso, varre TODAS)
 *   - thresholdHours?: number    (default 24)
 *   - apply?: boolean            (default false — dry-run)
 *   - reason?: string            (vai pra differenceJustification + notes)
 *
 * Resposta:
 *   {
 *     dryRun: boolean,
 *     thresholdHours: number,
 *     candidates: Array<{
 *       id, companyId, companyName, branchId, branchName,
 *       openedAt, hoursOpen, openedByName
 *     }>,
 *     closed?: number
 *   }
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos", details: err.issues }, { status: 400 });
    }
    throw err;
  }

  const cutoff = new Date(Date.now() - body.thresholdHours * 60 * 60 * 1000);

  const candidatesRaw = await prisma.cashShift.findMany({
    where: {
      status: "OPEN",
      openedAt: { lt: cutoff },
      ...(body.companyId && { companyId: body.companyId }),
    },
    include: {
      company: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      openedByUser: { select: { id: true, name: true } },
    },
    orderBy: { openedAt: "asc" },
  });

  const candidates = candidatesRaw.map((s) => {
    const hoursOpen = (Date.now() - s.openedAt.getTime()) / (1000 * 60 * 60);
    return {
      id: s.id,
      companyId: s.companyId,
      companyName: s.company.name,
      branchId: s.branchId,
      branchName: s.branch.name,
      openedAt: s.openedAt.toISOString(),
      hoursOpen: Math.round(hoursOpen * 10) / 10,
      openedByName: s.openedByUser?.name ?? null,
    };
  });

  if (!body.apply) {
    return NextResponse.json({
      dryRun: true,
      thresholdHours: body.thresholdHours,
      candidates,
    });
  }

  // Fechamento de fato — fora de transação para não cancelar tudo se um falhar,
  // mas cada shift fecha atomicamente.
  let closed = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const s of candidatesRaw) {
    try {
      // Calcula esperado de dinheiro: soma CashMovements CASH (IN-OUT)
      const movements = await prisma.cashMovement.findMany({
        where: { cashShiftId: s.id, method: "CASH" },
        select: { amount: true, direction: true },
      });
      const expectedCash = movements.reduce(
        (sum, m) => sum + (m.direction === "IN" ? Number(m.amount) : -Number(m.amount)),
        0,
      );

      await prisma.$transaction(async (tx) => {
        await tx.cashShift.update({
          where: { id: s.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            // Sem operador humano fechando — atribuímos ao admin global em log.
            closingDeclaredCash: expectedCash, // declara = esperado, diferença = 0
            closingExpectedCash: expectedCash,
            differenceCash: 0,
            differenceJustification: body.reason,
            notes: `Auto-fechamento via admin (${admin.email}) · turno aberto há ${
              Math.round(((Date.now() - s.openedAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
            }h`,
          },
        });
        await tx.activityLog.create({
          data: {
            companyId: s.companyId,
            type: "DATA_UPDATED",
            title: "Turno de caixa fechado por admin (stale)",
            detail: {
              kind: "cash_shift_admin_force_closed",
              shiftId: s.id,
              branchId: s.branchId,
              hoursOpen: Math.round(((Date.now() - s.openedAt.getTime()) / (1000 * 60 * 60)) * 10) / 10,
              expectedCash,
              adminEmail: admin.email,
              reason: body.reason,
            },
            actorId: admin.id,
            actorType: "ADMIN",
            actorName: admin.name ?? admin.email,
          },
        });
      });
      closed++;
    } catch (err) {
      failures.push({
        id: s.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    dryRun: false,
    thresholdHours: body.thresholdHours,
    candidates,
    closed,
    failures,
  });
}
