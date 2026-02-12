/**
 * Script de Migração: Corrigir CashMovements Faltantes
 *
 * Problema: Vendas feitas antes da correção não têm CashMovement para
 * métodos diferentes de CASH (PIX, Crédito Loja, Cartão, etc.)
 *
 * Este script:
 * 1. Busca todas as vendas COMPLETED
 * 2. Verifica se seus pagamentos têm CashMovement correspondente
 * 3. Cria CashMovement faltante para vendas que têm CashShift aberto na época
 *
 * USO:
 * npx tsx scripts/fix-missing-cash-movements.ts [--dry-run] [--company-id=xxx]
 */

import { prisma } from "../src/lib/prisma";

interface MissingMovement {
  saleId: string;
  saleDate: Date;
  paymentId: string;
  method: string;
  amount: number;
  branchId: string;
  customerId: string | null;
  customerName: string;
}

async function findMissingCashMovements(
  companyId?: string,
  dryRun = true
): Promise<void> {
  console.log("🔍 Buscando vendas com pagamentos sem CashMovement...\n");

  // 1. Buscar todas as vendas COMPLETED
  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      ...(companyId && { companyId }),
    },
    include: {
      payments: true,
      customer: {
        select: { name: true },
      },
      branch: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`📊 Total de vendas COMPLETED: ${sales.length}\n`);

  const missing: MissingMovement[] = [];

  // 2. Para cada venda, verificar se pagamentos têm CashMovement
  for (const sale of sales) {
    for (const payment of sale.payments) {
      // Verificar se existe CashMovement para este pagamento
      const cashMovement = await prisma.cashMovement.findFirst({
        where: {
          salePaymentId: payment.id,
          type: "SALE_PAYMENT",
        },
      });

      if (!cashMovement) {
        missing.push({
          saleId: sale.id,
          saleDate: sale.createdAt,
          paymentId: payment.id,
          method: payment.method,
          amount: Number(payment.amount),
          branchId: sale.branchId,
          customerId: sale.customerId,
          customerName: sale.customer.name,
        });
      }
    }
  }

  console.log(`❌ Pagamentos sem CashMovement: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log("✅ Nenhum CashMovement faltante encontrado!");
    return;
  }

  // 3. Agrupar por método de pagamento
  const byMethod = missing.reduce(
    (acc, m) => {
      acc[m.method] = (acc[m.method] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log("📈 Distribuição por método:");
  Object.entries(byMethod)
    .sort(([, a], [, b]) => b - a)
    .forEach(([method, count]) => {
      console.log(`   ${method}: ${count}`);
    });

  console.log("\n📋 Detalhes dos pagamentos faltantes:");
  missing.slice(0, 10).forEach((m, i) => {
    console.log(
      `   ${i + 1}. ${m.customerName} - ${m.method} - R$ ${m.amount.toFixed(2)} - ${m.saleDate.toLocaleDateString("pt-BR")}`
    );
  });

  if (missing.length > 10) {
    console.log(`   ... e mais ${missing.length - 10} pagamentos\n`);
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - Nenhuma alteração foi feita");
    console.log(
      "Para aplicar as correções, execute: npx tsx scripts/fix-missing-cash-movements.ts --apply\n"
    );
    return;
  }

  // 4. Criar CashMovements faltantes (somente se não for dry-run)
  console.log("\n🔧 Criando CashMovements faltantes...\n");

  let created = 0;
  let skipped = 0;

  for (const m of missing) {
    // Buscar o CashShift que estava aberto na data da venda
    const cashShift = await prisma.cashShift.findFirst({
      where: {
        branchId: m.branchId,
        openedAt: {
          lte: m.saleDate,
        },
        OR: [
          { closedAt: { gte: m.saleDate } },
          { closedAt: null }, // Ainda aberto
        ],
      },
      orderBy: { openedAt: "desc" },
    });

    if (!cashShift) {
      console.log(
        `   ⏭️  Pulando venda ${m.saleId.substring(0, 8)} - Sem CashShift correspondente`
      );
      skipped++;
      continue;
    }

    // Buscar dados do pagamento para obter userId
    const payment = await prisma.salePayment.findUnique({
      where: { id: m.paymentId },
      include: {
        sale: {
          select: {
            sellerUserId: true,
          },
        },
      },
    });

    if (!payment) {
      console.log(
        `   ⏭️  Pulando pagamento ${m.paymentId.substring(0, 8)} - Não encontrado`
      );
      skipped++;
      continue;
    }

    try {
      await prisma.cashMovement.create({
        data: {
          cashShiftId: cashShift.id,
          branchId: m.branchId,
          type: "SALE_PAYMENT",
          direction: "IN",
          method: m.method as any,
          amount: m.amount,
          originType: "SALE_PAYMENT",
          originId: m.paymentId,
          salePaymentId: m.paymentId,
          createdByUserId: payment.sale.sellerUserId,
          note: `[MIGRAÇÃO] Venda #${m.saleId.substring(0, 8)} - ${m.method}`,
          createdAt: m.saleDate, // Manter data original da venda
        },
      });

      created++;
      console.log(
        `   ✅ Criado CashMovement para venda ${m.saleId.substring(0, 8)} - ${m.method} - R$ ${m.amount.toFixed(2)}`
      );
    } catch (error: any) {
      console.error(
        `   ❌ Erro ao criar CashMovement para venda ${m.saleId.substring(0, 8)}:`,
        error.message
      );
      skipped++;
    }
  }

  console.log(`\n📊 Resultado:`);
  console.log(`   ✅ Criados: ${created}`);
  console.log(`   ⏭️  Pulados: ${skipped}`);
  console.log(`   📝 Total: ${missing.length}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--apply");
  const companyIdArg = args.find((arg) => arg.startsWith("--company-id="));
  const companyId = companyIdArg?.split("=")[1];

  console.log("🚀 Script de Correção de CashMovements Faltantes");
  console.log("================================================\n");

  if (dryRun) {
    console.log("⚠️  Modo DRY RUN - Nenhuma alteração será feita\n");
  } else {
    console.log("🔥 Modo APPLY - Alterações serão aplicadas no banco!\n");
  }

  if (companyId) {
    console.log(`🏢 Filtrando por empresa: ${companyId}\n`);
  }

  try {
    await findMissingCashMovements(companyId, dryRun);
    console.log("\n✅ Script finalizado com sucesso!");
  } catch (error: any) {
    console.error("\n❌ Erro ao executar script:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
