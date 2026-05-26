#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  try {
    const sales = await prisma.sale.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
      }
    });

    const customers = await prisma.customer.count();
    const products = await prisma.product.count();
    const salesTotalValue = await prisma.sale.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { total: true }
    });

    console.log('\n📊 DADOS REAIS NO BANCO DE DADOS:');
    console.log('==================================');
    console.log(`Total de Vendas: ${sales.length}`);
    console.log(`Total de Clientes: ${customers}`);
    console.log(`Total de Produtos: ${products}`);
    console.log(`Valor Total Vendas: R$ ${salesTotalValue._sum.total || 0}`);
    console.log('\n💰 ÚLTIMAS VENDAS:');

    if (sales.length === 0) {
      console.log('  ❌ NÃO HÁ VENDAS NO BANCO!');
      console.log('  Os dados mostrados no dashboard (R$ 4.499,50) são FICTÍCIOS/MOCK!');
    } else {
      sales.forEach((sale, i) => {
        const customerName = sale.customer ? sale.customer.name : 'N/A';
        console.log(`  ${i + 1}. ${customerName}: R$ ${sale.total} (${sale.status})`);
      });
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Erro:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkData();
