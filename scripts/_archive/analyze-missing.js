const XLSX = require('xlsx');

// Usar arquivo 1 para entender o problema original
const wb1 = XLSX.readFile('/Users/matheusreboucas/Downloads/relatorio-vendas-2026-03-17-15-29-ado-pacajus.xlsx');
const data1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: '' });

// Parsear igual ao script original faz
const sales = [];
let currentSale = null;

for (const row of data1) {
  const saleNumber = row['Nº Venda'];
  if (saleNumber != '' && saleNumber != undefined && saleNumber != null) {
    if (currentSale) sales.push(currentSale);
    currentSale = { num: Number(saleNumber), items: 0 };
  } else {
    const desc = String(row['Item - Descrição'] || '').trim();
    const ref = String(row['Item - Referência'] || '').trim();
    if ((desc || ref) && currentSale) {
      currentSale.items++;
    }
  }
}
if (currentSale) sales.push(currentSale);

console.log('Vendas parseadas do arquivo 1:', sales.length);
const withItems = sales.filter(s => s.items > 0);
const withoutItems = sales.filter(s => s.items === 0);
console.log('Com itens:', withItems.length);
console.log('Sem itens:', withoutItems.length);
console.log('Primeiras 30 sem itens:', withoutItems.slice(0, 30).map(s => s.num));

// Agora comparar com o que está no banco (já sabemos os 5751)
// As 4791 faltando - são vendas SEM ITENS?
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dbSales = await prisma.sale.findMany({
    where: { legacySource: 'ADO_PACAJUS' },
    select: { legacyId: true },
  });
  const dbNums = new Set(dbSales.map(s => {
    const m = s.legacyId.match(/ADO_PACAJUS_(\d+)/);
    return m ? parseInt(m[1]) : null;
  }).filter(Boolean));

  const file1Nums = new Set(sales.map(s => s.num));

  // Vendas faltando
  const missing = sales.filter(s => !dbNums.has(s.num));
  const missingWithItems = missing.filter(s => s.items > 0);
  const missingNoItems = missing.filter(s => s.items === 0);

  console.log('\n=== VENDAS FALTANDO (arquivo 1 vs banco) ===');
  console.log('Total faltando:', missing.length);
  console.log('Com itens (deveriam ter importado):', missingWithItems.length);
  console.log('Sem itens (script ignorou):', missingNoItems.length);

  // Agora verificar o arquivo 2 para vendas sem itens no arquivo 1
  const wb2 = XLSX.readFile('/Users/matheusreboucas/Downloads/exportacao-vendas-2026-03-22-21-56-ado-pacajus.xlsx');
  const data2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: '' });

  const sales2 = [];
  let currentSale2 = null;
  for (const row of data2) {
    const saleNumber = row['Número Venda'];
    if (saleNumber != '' && saleNumber != undefined && saleNumber != null) {
      if (currentSale2) sales2.push(currentSale2);
      currentSale2 = { num: Number(saleNumber), items: 0, status: row['Status'] };
    } else {
      const desc = String(row['Item - Descrição'] || '').trim();
      const ref = String(row['Item - Referência'] || '').trim();
      if ((desc || ref) && currentSale2) {
        currentSale2.items++;
      }
    }
  }
  if (currentSale2) sales2.push(currentSale2);

  // Vendas do arquivo 2 que faltam no banco
  const missing2 = sales2.filter(s => !dbNums.has(s.num));
  const missing2WithItems = missing2.filter(s => s.items > 0);
  const missing2NoItems = missing2.filter(s => s.items === 0);

  console.log('\n=== VENDAS FALTANDO (arquivo 2 vs banco) ===');
  console.log('Total faltando:', missing2.length);
  console.log('Com itens:', missing2WithItems.length);
  console.log('Sem itens:', missing2NoItems.length);
  console.log('Status breakdown:', {
    ATIVA: missing2.filter(s => s.status === 'ATIVA').length,
    CANCELADA: missing2.filter(s => s.status === 'CANCELADA').length,
    OTHER: missing2.filter(s => s.status !== 'ATIVA' && s.status !== 'CANCELADA').length,
  });

  await prisma.$disconnect();
}

main().catch(console.error);
