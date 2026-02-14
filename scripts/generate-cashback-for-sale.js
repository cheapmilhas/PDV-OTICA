const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Importar função diretamente
const { addDays } = require('date-fns');
const { Decimal } = require('@prisma/client/runtime/library');

async function generateCashback() {
  const saleId = 'cmllklofc0002cukcbxy2b945';

  // Buscar venda
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { customer: true }
  });

  if (!sale || !sale.customerId) {
    console.log('❌ Venda não encontrada ou sem cliente');
    await prisma.$disconnect();
    return;
  }

  console.log('🔍 Gerando cashback para venda:', {
    id: sale.id.substring(0, 8),
    total: sale.total.toString(),
    customerId: sale.customerId,
    branchId: sale.branchId,
    companyId: sale.companyId
  });

  // Buscar config
  const config = await prisma.cashbackConfig.findFirst({
    where: { branchId: sale.branchId }
  });

  if (!config || !config.enabled) {
    console.log('❌ Cashback desabilitado');
    await prisma.$disconnect();
    return;
  }

  const saleTotal = Number(sale.total);
  const earnPercent = Number(config.earnPercent);
  let cashbackAmount = (saleTotal * earnPercent) / 100;

  console.log('💰 Calculando cashback:', {
    saleTotal,
    earnPercent,
    cashbackAmount
  });

  // Calcular expiração
  const expiresAt = config.expirationDays ? addDays(new Date(), config.expirationDays) : null;

  // Criar cashback
  const result = await prisma.$transaction(async (tx) => {
    // Buscar ou criar CustomerCashback
    let customerCashback = await tx.customerCashback.findFirst({
      where: { customerId: sale.customerId, branchId: sale.branchId }
    });

    if (!customerCashback) {
      customerCashback = await tx.customerCashback.create({
        data: {
          branchId: sale.branchId,
          customerId: sale.customerId,
          balance: new Decimal(0)
        }
      });
    }

    // Criar movimento
    const movement = await tx.cashbackMovement.create({
      data: {
        customerCashbackId: customerCashback.id,
        type: 'CREDIT',
        amount: new Decimal(cashbackAmount),
        saleId: sale.id,
        expiresAt,
        description: `Cashback ganho na venda #${sale.id.slice(-8)}`
      }
    });

    // Atualizar saldo
    await tx.customerCashback.update({
      where: { id: customerCashback.id },
      data: {
        balance: {
          increment: new Decimal(cashbackAmount)
        },
        totalEarned: {
          increment: new Decimal(cashbackAmount)
        }
      }
    });

    return movement;
  });

  console.log('✅ Cashback gerado com sucesso!', {
    id: result.id,
    amount: result.amount.toString(),
    expiresAt: result.expiresAt
  });

  await prisma.$disconnect();
}

generateCashback().catch(console.error);
