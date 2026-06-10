import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";

export const POST = withPlanFeatureGuard(async (request: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json().catch(() => ({}));
    const targetDate = body.targetDate ? new Date(body.targetDate) : new Date();
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-indexed

    const actives = await prisma.recurringExpense.findMany({
      where: { companyId, active: true },
    });

    let generated = 0;
    let skipped = 0;

    for (const exp of actives) {
      const dueDate = new Date(year, month, exp.dayOfMonth);

      // Idempotency check: already generated for this month?
      const existing = await prisma.accountPayable.findFirst({
        where: {
          companyId,
          recurringExpenseId: exp.id,
          dueDate: {
            gte: new Date(year, month, 1),
            lte: new Date(year, month + 1, 0),
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // RACE-02: o findFirst acima é o caminho feliz, mas dois disparos
      // concorrentes podem passar os dois. O índice único parcial
      // (recurringExpenseId, mês de dueDate) garante no banco que só um cria; o
      // P2002 do perdedor é tratado como "já existe" (skip), não como erro.
      try {
        await prisma.accountPayable.create({
          data: {
            companyId,
            branchId: exp.branchId ?? null,
            supplierId: exp.supplierId ?? null,
            description: exp.description,
            category: exp.category,
            amount: exp.amount,
            dueDate,
            status: "PENDING",
            recurringExpenseId: exp.id,
            notes: exp.notes ?? null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          skipped++;
          continue;
        }
        throw err;
      }

      await prisma.recurringExpense.update({
        where: { id: exp.id },
        data: {
          lastGeneratedAt: new Date(),
          nextDueDate: new Date(year, month + 1, exp.dayOfMonth),
        },
      });

      generated++;
    }

    const monthName = targetDate.toLocaleString("pt-BR", { month: "long", year: "numeric" });

    return NextResponse.json({
      generated,
      skipped,
      message:
        generated > 0
          ? `${generated} conta(s) gerada(s) para ${monthName}`
          : `Nenhuma conta nova para gerar — ${skipped} já existem`,
    });
  } catch (error) {
    return handleApiError(error);
  }
});
