import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { generateAccountPayableExpenseEntry } from "@/services/finance-entry.service";
import { AccountPayableStatus } from "@prisma/client";

/**
 * POST /api/finance/backfill-expense-entries
 * Cria FinanceEntry (EXPENSE) para contas a pagar já pagas que ainda não têm lançamento.
 * Idempotente — pula contas que já possuem lançamento.
 *
 * Requer permissão: finance.manage
 */
export async function POST() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("finance.manage");

    // Buscar contas a pagar PAGAS que ainda não têm lançamento
    const paidAccounts = await prisma.accountPayable.findMany({
      where: {
        companyId,
        status: AccountPayableStatus.PAID,
        NOT: {
          id: {
            in: await prisma.financeEntry
              .findMany({
                where: {
                  companyId,
                  sourceType: "AccountPayable",
                  type: "EXPENSE",
                },
                select: { sourceId: true },
              })
              .then((entries) =>
                entries
                  .map((e) => e.sourceId)
                  .filter((id): id is string => id !== null)
              ),
          },
        },
      },
      select: {
        id: true,
        category: true,
        amount: true,
        paidAmount: true,
        paidDate: true,
        description: true,
        branchId: true,
      },
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const account of paidAccounts) {
      try {
        const paidAmount = Number(account.paidAmount ?? account.amount);
        const paidDate = account.paidDate ?? new Date();

        await prisma.$transaction(async (tx) => {
          await generateAccountPayableExpenseEntry(
            tx,
            account.id,
            companyId,
            account.category,
            paidAmount,
            `Pagamento: ${account.description}`,
            paidDate,
            account.branchId
          );
        });

        created++;
      } catch (err) {
        skipped++;
        errors.push(
          `${account.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
