const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

async function test() {
  // Parsear a primeira venda faltando (#6)
  const wb = XLSX.readFile('/Users/matheusreboucas/Downloads/exportacao-vendas-2026-03-22-21-56-ado-pacajus.xlsx');
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

  // Encontrar venda #6
  let saleData = null;
  let items = [];
  for (const row of data) {
    const v = row['Número Venda'];
    if (v === 6) {
      saleData = row;
      items = [];
    } else if (saleData && !v && (row['Item - Descrição'] || row['Item - Referência'])) {
      items.push(row);
    } else if (v && saleData) {
      break; // próxima venda
    }
  }

  console.log('Venda #6:', JSON.stringify(saleData, null, 2));
  console.log('Itens:', items.length);
  items.forEach(i => console.log(' -', i['Item - Descrição'], '|', i['Item - Valor Unitário']));

  // Tentar criar no banco
  const excelEpoch = new Date(1899, 11, 30);
  const date = new Date(excelEpoch.getTime() + saleData['Data'] * 86400000);

  try {
    const result = await prisma.sale.create({
      data: {
        companyId: 'cmlx4fkjt000092bq1n7rm63g',
        branchId: 'cmlx4fkr0000292bqtebe57r1',
        customerId: null,
        sellerUserId: 'cmlx4fl53000492bqrp6gg2w3',
        status: 'COMPLETED',
        subtotal: parseFloat(saleData['Valor Total']) || 0,
        discountTotal: parseFloat(saleData['Desconto/Acréscimo na Venda']) || 0,
        total: parseFloat(saleData['Valor Líquido']) || 0,
        completedAt: date,
        createdAt: date,
        legacyId: 'ADO_PACAJUS_6',
        legacySource: 'ADO_PACAJUS',
      },
    });
    console.log('Venda criada:', result.id);

    // Deletar para limpar teste
    await prisma.sale.delete({ where: { id: result.id } });
    console.log('Venda de teste deletada');
  } catch (err) {
    console.error('ERRO COMPLETO:', err.message);
    console.error('CÓDIGO:', err.code);
    console.error('META:', JSON.stringify(err.meta, null, 2));
  }

  await prisma.$disconnect();
}

test().catch(console.error);
