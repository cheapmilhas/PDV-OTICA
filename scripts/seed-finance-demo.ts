/**
 * Seed de dados financeiros demo para o PDV Ótica.
 * Cria InventoryLots, FinanceEntries e DailyAggs para os últimos 90 dias.
 *
 * Uso:
 *   npx tsx scripts/seed-finance-demo.ts
 *   npx tsx scripts/seed-finance-demo.ts --force   # recriar se já existir
 */

import { PrismaClient } from "@prisma/client";
import { format, subDays, addDays, isWeekend, getDay } from "date-fns";

const prisma = new PrismaClient();

// ============================================================
// Helpers
// ============================================================

function rand(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Seasonality multiplier by month (1-indexed)
function seasonality(month: number): number {
  const map: Record<number, number> = {
    1: 0.85, // janeiro - férias
    2: 0.95,
    3: 1.0,
    4: 1.0,
    5: 1.05,
    6: 1.0,
    7: 0.95,
    8: 1.0,
    9: 1.05,
    10: 1.0,
    11: 1.1,
    12: 1.2, // natal
  };
  return map[month] || 1.0;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("=== Seed de dados financeiros demo ===\n");

  // Find first company
  const company = await prisma.company.findFirst({
    include: { branches: { take: 1 } },
  });

  if (!company) {
    console.error("❌ Nenhuma empresa encontrada. Execute o seed principal primeiro.");
    process.exit(1);
  }

  const companyId = company.id;
  const branch = company.branches[0];
  if (!branch) {
    console.error("❌ Nenhuma filial encontrada.");
    process.exit(1);
  }
  const branchId = branch.id;

  console.log(`📍 Empresa: ${company.name} (${companyId})`);
  console.log(`📍 Filial: ${branch.name} (${branchId})\n`);

  // Check idempotency
  const existingEntries = await prisma.financeEntry.count({
    where: { companyId, sourceId: { startsWith: "demo-" } },
  });

  if (existingEntries > 0) {
    if (!process.argv.includes("--force")) {
      console.log(`⚠️  ${existingEntries} entradas demo já existem. Use --force para recriar.`);
      process.exit(0);
    }
    console.log("🗑️  Removendo dados demo existentes...");
    await prisma.financeEntry.deleteMany({ where: { companyId, sourceId: { startsWith: "demo-" } } });
    await prisma.dailyAgg.deleteMany({ where: { companyId } });
    await prisma.inventoryLot.deleteMany({ where: { companyId, invoiceNumber: { startsWith: "NF-DEMO-" } } });
    console.log("✅ Dados demo removidos.\n");
  }

  // Load chart of accounts
  const chartAccounts = await prisma.chartOfAccounts.findMany({
    where: { companyId },
    select: { id: true, code: true, name: true },
  });

  if (chartAccounts.length === 0) {
    console.error("❌ Plano de contas não encontrado. Execute setupCompanyFinance primeiro.");
    process.exit(1);
  }

  const accountByCode: Record<string, string> = {};
  chartAccounts.forEach((a) => {
    accountByCode[a.code] = a.id;
  });

  console.log(`📊 ${chartAccounts.length} contas contábeis carregadas.`);

  // Load finance accounts
  const financeAccounts = await prisma.financeAccount.findMany({
    where: { companyId },
    select: { id: true, name: true, type: true },
  });

  const finAccByType: Record<string, string> = {};
  financeAccounts.forEach((a) => {
    finAccByType[a.type] = a.id;
  });

  console.log(`🏦 ${financeAccounts.length} contas financeiras carregadas.`);

  // Load products
  const products = await prisma.product.findMany({
    where: { companyId },
    take: 20,
    select: { id: true, name: true, type: true, costPrice: true, salePrice: true },
  });

  console.log(`📦 ${products.length} produtos carregados.`);

  // Load suppliers
  const suppliers = await prisma.supplier.findMany({
    where: { companyId },
    take: 5,
    select: { id: true, name: true },
  });

  console.log(`🚚 ${suppliers.length} fornecedores carregados.\n`);

  // ============================================================
  // Create data inside a transaction with high timeout (Neon)
  // ============================================================

  await prisma.$transaction(
    async (tx) => {
      // ========================================
      // 2.1 InventoryLots
      // ========================================
      console.log("📦 Criando lotes de estoque (InventoryLots)...");

      const lotsToCreate: any[] = [];
      let lotIndex = 0;

      for (const product of products) {
        const numLots = randInt(2, 3);
        const costBase = Number(product.costPrice) || rand(30, 150);

        for (let l = 0; l < numLots; l++) {
          const qtyIn = randInt(20, 100);
          const qtyRemaining = randInt(Math.floor(qtyIn * 0.3), qtyIn);
          const unitCost = costBase * rand(0.85, 1.15); // small variation
          const daysAgo = randInt(5, 90);

          lotsToCreate.push({
            companyId,
            branchId,
            productId: product.id,
            supplierId: suppliers.length > 0 ? pick(suppliers).id : null,
            qtyIn,
            qtyRemaining,
            unitCost,
            totalCost: unitCost * qtyIn,
            invoiceNumber: `NF-DEMO-${String(++lotIndex).padStart(3, "0")}`,
            acquiredAt: subDays(new Date(), daysAgo),
          });
        }
      }

      await tx.inventoryLot.createMany({ data: lotsToCreate });
      console.log(`   ✅ ${lotsToCreate.length} lotes criados.`);

      // ========================================
      // 2.2 FinanceEntries + 2.3 DailyAgg
      // ========================================
      console.log("📒 Criando lançamentos financeiros (90 dias)...");

      const DAYS = 90;
      const today = new Date();
      let totalEntries = 0;
      let totalAggs = 0;

      const entriesToCreate: any[] = [];
      const aggsToCreate: any[] = [];

      // Payment method distribution
      const paymentMethods = [
        { name: "CREDIT_CARD", weight: 0.30, feeRate: 0.035 },
        { name: "DEBIT_CARD", weight: 0.10, feeRate: 0.02 },
        { name: "PIX", weight: 0.30, feeRate: 0 },
        { name: "CASH", weight: 0.20, feeRate: 0 },
        { name: "BOLETO", weight: 0.10, feeRate: 0 },
      ];

      // Monthly expenses
      const monthlyExpenses = [
        { desc: "Aluguel do ponto comercial", code: "5.1.03", amount: 3000 },
        { desc: "Energia elétrica", code: "5.1.04", amount: rand(500, 800) },
        { desc: "Telefone e Internet", code: "5.1.05", amount: 300 },
        { desc: "Material de escritório", code: "5.1.06", amount: rand(100, 200) },
        { desc: "Marketing e propaganda", code: "5.1.07", amount: rand(500, 1500) },
      ];

      for (let d = DAYS - 1; d >= 0; d--) {
        const date = subDays(today, d);
        const dayOfWeek = getDay(date);
        const month = date.getMonth() + 1;
        const seasonMult = seasonality(month);

        // Sales per day based on day of week
        let salesPerDay: number;
        if (dayOfWeek === 0) {
          salesPerDay = randInt(0, 2); // domingo
        } else if (dayOfWeek === 6) {
          salesPerDay = randInt(5, 12); // sábado
        } else {
          salesPerDay = randInt(3, 8); // dia útil
        }

        salesPerDay = Math.round(salesPerDay * seasonMult);

        // Daily aggregates
        let daySalesCount = 0;
        let dayGrossRevenue = 0;
        let dayDiscounts = 0;
        let dayCogs = 0;
        let dayCardFees = 0;
        let dayCommissions = 0;
        let dayExpenses = 0;
        let dayCash = 0;
        let dayPix = 0;
        let dayDebit = 0;
        let dayCredit = 0;
        let dayBoleto = 0;
        let dayItemsSold = 0;

        for (let s = 0; s < salesPerDay; s++) {
          const saleIndex = `${format(date, "yyyyMMdd")}-${s}`;
          const ticket = rand(250, 500) * seasonMult;
          const discount = Math.random() < 0.3 ? rand(10, ticket * 0.1) : 0;
          const saleTotal = ticket - discount;
          const cogsPercent = rand(0.35, 0.50);
          const cogsCost = saleTotal * cogsPercent;
          const commissionPercent = rand(0.05, 0.10);
          const commission = saleTotal * commissionPercent;

          // Pick payment method weighted
          const r = Math.random();
          let cumWeight = 0;
          let method = paymentMethods[0];
          for (const pm of paymentMethods) {
            cumWeight += pm.weight;
            if (r <= cumWeight) {
              method = pm;
              break;
            }
          }

          const cardFee = saleTotal * method.feeRate;

          // Accumulate daily totals
          daySalesCount++;
          dayGrossRevenue += ticket;
          dayDiscounts += discount;
          dayCogs += cogsCost;
          dayCardFees += cardFee;
          dayCommissions += commission;
          dayItemsSold += randInt(1, 4);

          switch (method.name) {
            case "CASH": dayCash += saleTotal; break;
            case "PIX": dayPix += saleTotal; break;
            case "DEBIT_CARD": dayDebit += saleTotal; break;
            case "CREDIT_CARD": dayCredit += saleTotal; break;
            case "BOLETO": dayBoleto += saleTotal; break;
          }

          // ---- Finance entries for this sale ----

          // 1. SALE_REVENUE
          entriesToCreate.push({
            companyId,
            branchId,
            type: "SALE_REVENUE",
            side: "DEBIT",
            amount: saleTotal,
            description: `Venda demo #${saleIndex}`,
            entryDate: date,
            debitAccountId: accountByCode["1.1.03"], // Contas a Receber
            creditAccountId: accountByCode["3.1.01"], // Receita de Vendas
            sourceType: "SALE",
            sourceId: `demo-sale-${saleIndex}`,
          });

          // 2. COGS
          const cmvCode = pick(["4.1.01", "4.1.02", "4.1.03"]);
          entriesToCreate.push({
            companyId,
            branchId,
            type: "COGS",
            side: "DEBIT",
            amount: cogsCost,
            description: `CMV - Venda demo #${saleIndex}`,
            entryDate: date,
            debitAccountId: accountByCode[cmvCode],
            creditAccountId: accountByCode["1.1.04"], // Estoque
            sourceType: "SALE",
            sourceId: `demo-cogs-${saleIndex}`,
          });

          // 3. Discount entry (if applicable)
          if (discount > 0) {
            entriesToCreate.push({
              companyId,
              branchId,
              type: "SALE_REVENUE",
              side: "DEBIT",
              amount: discount,
              description: `Desconto - Venda demo #${saleIndex}`,
              entryDate: date,
              debitAccountId: accountByCode["3.2.02"], // Descontos Concedidos
              creditAccountId: accountByCode["1.1.03"], // Contas a Receber
              sourceType: "SALE",
              sourceId: `demo-discount-${saleIndex}`,
            });
          }

          // 4. PAYMENT_RECEIVED
          let payAccountCode: string;
          let finAccType: string;
          switch (method.name) {
            case "CASH": payAccountCode = "1.1.01"; finAccType = "CASH"; break;
            case "PIX": payAccountCode = "1.1.02"; finAccType = "PIX"; break;
            case "DEBIT_CARD":
            case "CREDIT_CARD": payAccountCode = "1.1.05"; finAccType = "CARD_ACQUIRER"; break;
            default: payAccountCode = "1.1.02"; finAccType = "BANK"; break;
          }

          entriesToCreate.push({
            companyId,
            branchId,
            type: "PAYMENT_RECEIVED",
            side: "DEBIT",
            amount: saleTotal,
            description: `Pagamento ${method.name} - Venda demo #${saleIndex}`,
            entryDate: date,
            debitAccountId: accountByCode[payAccountCode],
            creditAccountId: accountByCode["1.1.03"], // Contas a Receber
            financeAccountId: finAccByType[finAccType] || undefined,
            sourceType: "SALE",
            sourceId: `demo-payment-${saleIndex}`,
          });

          // 5. CARD_FEE (if card)
          if (cardFee > 0) {
            entriesToCreate.push({
              companyId,
              branchId,
              type: "CARD_FEE",
              side: "DEBIT",
              amount: cardFee,
              description: `Taxa cartão ${method.name} - Venda demo #${saleIndex}`,
              entryDate: date,
              debitAccountId: accountByCode["5.1.01"], // Taxas de Cartão
              creditAccountId: accountByCode["1.1.05"], // Adquirente Cartão
              sourceType: "SALE",
              sourceId: `demo-fee-${saleIndex}`,
            });
          }

          // 6. COMMISSION_EXPENSE
          entriesToCreate.push({
            companyId,
            branchId,
            type: "COMMISSION_EXPENSE",
            side: "DEBIT",
            amount: commission,
            description: `Comissão vendedor - Venda demo #${saleIndex}`,
            entryDate: date,
            debitAccountId: accountByCode["5.1.02"], // Comissões de Vendedores
            creditAccountId: accountByCode["2.1.02"], // Comissões a Pagar
            sourceType: "SALE",
            sourceId: `demo-commission-${saleIndex}`,
          });
        }

        // Monthly expenses (one entry per expense on the 1st or 15th)
        const dayOfMonth = date.getDate();
        if (dayOfMonth === 1 || dayOfMonth === 15) {
          const expenseSubset = dayOfMonth === 1
            ? monthlyExpenses.slice(0, 3) // rent, energy, tel on 1st
            : monthlyExpenses.slice(3); // office supplies, marketing on 15th

          for (const exp of expenseSubset) {
            const expAmount = exp.amount * seasonMult * rand(0.9, 1.1);
            dayExpenses += expAmount;

            entriesToCreate.push({
              companyId,
              branchId,
              type: "EXPENSE",
              side: "DEBIT",
              amount: expAmount,
              description: exp.desc,
              entryDate: date,
              cashDate: date,
              debitAccountId: accountByCode[exp.code],
              creditAccountId: accountByCode["1.1.01"], // Caixa
              financeAccountId: finAccByType["CASH"] || undefined,
              sourceType: "MANUAL",
              sourceId: `demo-expense-${format(date, "yyyyMMdd")}-${exp.code}`,
            });
          }
        }

        // Create DailyAgg
        const netRevenue = dayGrossRevenue - dayDiscounts;
        const grossMargin = netRevenue - dayCogs;
        const netProfit = netRevenue - dayCogs - dayCardFees - dayCommissions - dayExpenses;

        if (daySalesCount > 0 || dayExpenses > 0) {
          aggsToCreate.push({
            companyId,
            branchId,
            date,
            salesCount: daySalesCount,
            grossRevenue: dayGrossRevenue,
            discountTotal: dayDiscounts,
            netRevenue,
            cogs: dayCogs,
            grossMargin,
            cardFees: dayCardFees,
            commissions: dayCommissions,
            netProfit,
            avgTicket: daySalesCount > 0 ? netRevenue / daySalesCount : 0,
            itemsSold: dayItemsSold,
            cashTotal: dayCash,
            pixTotal: dayPix,
            debitCardTotal: dayDebit,
            creditCardTotal: dayCredit,
            boletoTotal: dayBoleto,
            otherTotal: 0,
          });
        }
      }

      // Batch insert entries
      console.log(`   Inserindo ${entriesToCreate.length} lançamentos...`);
      // Insert in batches of 500 to avoid query size limits
      for (let i = 0; i < entriesToCreate.length; i += 500) {
        const batch = entriesToCreate.slice(i, i + 500);
        await tx.financeEntry.createMany({ data: batch });
      }
      totalEntries = entriesToCreate.length;
      console.log(`   ✅ ${totalEntries} lançamentos criados.`);

      // Batch insert DailyAgg
      console.log(`   Inserindo ${aggsToCreate.length} agregações diárias...`);
      await tx.dailyAgg.createMany({ data: aggsToCreate });
      totalAggs = aggsToCreate.length;
      console.log(`   ✅ ${totalAggs} agregações diárias criadas.`);

      console.log("\n=== Resumo ===");
      console.log(`📦 Lotes de estoque: ${lotsToCreate.length}`);
      console.log(`📒 Lançamentos financeiros: ${totalEntries}`);
      console.log(`📊 Agregações diárias: ${totalAggs}`);
    },
    { maxWait: 60000, timeout: 120000 }
  );

  console.log("\n✅ Seed financeiro demo concluído com sucesso!");
}

main()
  .catch((error) => {
    console.error("❌ Erro:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
