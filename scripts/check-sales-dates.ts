#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDates() {
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      total: true,
      status: true,
      createdAt: true,
      customer: { select: { name: true } }
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log('\n📅 VENDAS NO BANCO COM DATAS:');
  console.log('============================');
  console.log('Hoje:', today.toISOString().split('T')[0], '\n');

  let todayTotal = 0;
  let monthTotal = 0;

  sales.forEach((sale) => {
    const date = new Date(sale.createdAt);
    const isToday = date >= today;
    const icon = isToday ? '🟢 HOJE' : '🔴 ANTIGO';

    console.log(`${icon} | R$ ${sale.total} | ${date.toISOString()} | ${sale.status}`);

    if (isToday && sale.status === 'COMPLETED') {
      todayTotal += Number(sale.total);
    }
    if (sale.status === 'COMPLETED') {
      monthTotal += Number(sale.total);
    }
  });

  console.log('\n💰 RESUMO:');
  console.log('==========');
  console.log('Vendas de HOJE calculadas:', todayTotal.toFixed(2));
  console.log('Vendas do MÊS calculadas:', monthTotal.toFixed(2));
  console.log('\n⚠️ Dashboard mostra: R$ 4.499,50');

  if (todayTotal === 0) {
    console.log('\n❌ PROBLEMA IDENTIFICADO:');
    console.log('Todas as vendas no banco são ANTIGAS (não são de hoje).');
    console.log('Por isso o dashboard mostra R$ 4.499,50 (valor que não está no banco).');
    console.log('\n💡 SOLUÇÃO: As vendas mostradas são MOCK/FAKE do seed.');
  } else {
    console.log('\n✅ Vendas de hoje:', todayTotal === 4499.50 ? 'CORRETO' : 'INCORRETO');
  }

  await prisma.$disconnect();
}

checkDates();
