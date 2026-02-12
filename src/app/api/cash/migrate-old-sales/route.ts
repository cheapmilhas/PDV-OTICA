import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * POST /api/cash/migrate-old-sales
 * Migra vendas antigas que não têm CashMovements vinculados
 *
 * REQUER: ADMIN ou GERENTE
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    await requireRole(["ADMIN", "GERENTE"]);
    const companyId = await getCompanyId();

    console.log("🔄 Iniciando migração de vendas antigas...");

    // Buscar todos os pagamentos que não têm CashMovement vinculado
    const paymentsWithoutMovement = await prisma.salePayment.findMany({
      where: {
        sale: { companyId },
        cashMovements: {
          none: {}, // Pagamentos sem nenhum CashMovement
        },
        status: "RECEIVED", // Apenas pagamentos recebidos
      },
      include: {
        sale: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log(`📊 Encontrados ${paymentsWithoutMovement.length} pagamentos sem CashMovement`);

    let created = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const payment of paymentsWithoutMovement) {
      try {
        // Buscar o caixa que estava aberto no momento da venda
        const cashShift = await prisma.cashShift.findFirst({
          where: {
            branchId: payment.sale.branchId,
            openedAt: { lte: payment.createdAt },
            OR: [
              { closedAt: { gte: payment.createdAt } },
              { closedAt: null },
            ],
          },
          orderBy: { openedAt: "desc" },
        });

        if (!cashShift) {
          console.warn(`⚠️ Pagamento ${payment.id}: Nenhum caixa encontrado na data ${payment.createdAt}`);
          skipped++;
          continue;
        }

        // Criar CashMovement para este pagamento
        await prisma.cashMovement.create({
          data: {
            cashShiftId: cashShift.id,
            branchId: payment.sale.branchId,
            type: "SALE_PAYMENT",
            direction: "IN",
            method: payment.method,
            amount: payment.amount,
            originType: "SALE_PAYMENT",
            originId: payment.id,
            salePaymentId: payment.id,
            createdByUserId: payment.receivedByUserId || payment.sale.sellerUserId,
            note: `Venda #${payment.saleId.substring(0, 8)} (migrado)`,
            createdAt: payment.createdAt, // Manter a data original
          },
        });

        created++;
        console.log(`✅ CashMovement criado para pagamento ${payment.id}`);
      } catch (error: any) {
        console.error(`❌ Erro ao migrar pagamento ${payment.id}:`, error.message);
        errors.push({
          paymentId: payment.id,
          saleId: payment.saleId,
          error: error.message,
        });
      }
    }

    const result = {
      success: true,
      message: "Migração concluída",
      summary: {
        total: paymentsWithoutMovement.length,
        created,
        skipped,
        errors: errors.length,
      },
      details: {
        errors,
      },
    };

    console.log("✅ Migração concluída:", result.summary);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("❌ Erro na migração:", error);
    return handleApiError(error);
  }
}
