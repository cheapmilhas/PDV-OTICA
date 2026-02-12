import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";

/**
 * POST /api/admin/migrate-cash-movements
 * Cria CashMovements retroativos para vendas antigas
 */
export async function POST() {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();

    // Verificar se é admin
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Apenas admins podem executar migração" }, { status: 403 });
    }

    // Buscar SalePayments que NÃO têm CashMovement
    // EXCLUIR STORE_CREDIT (crediário não gera movimento na venda)
    const paymentsWithoutMovement = await prisma.salePayment.findMany({
      where: {
        sale: { companyId },
        cashMovements: { none: {} },
        method: { not: "STORE_CREDIT" }, // Exclui crediário
      },
      include: {
        sale: {
          select: {
            id: true,
            createdAt: true,
            branchId: true,
          },
        },
      },
    });

    console.log(`📊 Encontrados ${paymentsWithoutMovement.length} pagamentos sem CashMovement`);

    if (paymentsWithoutMovement.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhum pagamento pendente de migração",
        migrated: 0,
      });
    }

    // Buscar caixa aberto atual para associar
    const openShift = await prisma.cashShift.findFirst({
      where: { companyId, status: "OPEN" },
    });

    if (!openShift) {
      return NextResponse.json({
        error: "Nenhum caixa aberto. Abra o caixa antes de executar a migração."
      }, { status: 400 });
    }

    let migratedCount = 0;
    const errors: string[] = [];

    for (const payment of paymentsWithoutMovement) {
      try {
        await prisma.cashMovement.create({
          data: {
            cashShiftId: openShift.id,
            branchId: payment.sale.branchId,
            type: "SALE_PAYMENT",
            direction: "IN",
            method: payment.method,
            amount: payment.amount,
            originType: "SalePayment",
            originId: payment.id,
            salePaymentId: payment.id,
            note: `[MIGRADO] Venda #${payment.sale.id.substring(0, 8)}`,
            migrated: true,
            createdAt: payment.sale.createdAt, // USA DATA ORIGINAL
          },
        });
        migratedCount++;
        console.log(`✅ Migrado: ${payment.id} (${payment.method} R$ ${payment.amount})`);
      } catch (err: any) {
        errors.push(`${payment.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migração concluída`,
      total: paymentsWithoutMovement.length,
      migrated: migratedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Erro na migração:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET para verificar status antes de migrar
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const count = await prisma.salePayment.count({
      where: {
        sale: { companyId },
        cashMovements: { none: {} },
        method: { not: "STORE_CREDIT" },
      },
    });

    return NextResponse.json({
      pendingMigration: count,
      message: count > 0
        ? `${count} pagamentos aguardando migração`
        : "Nenhum pagamento pendente",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
