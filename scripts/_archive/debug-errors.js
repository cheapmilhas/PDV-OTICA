const XLSX = require('xlsx');

// Arquivo 1 original
const wb1 = XLSX.readFile('/Users/matheusreboucas/Downloads/relatorio-vendas-2026-03-17-15-29-ado-pacajus.xlsx');
const data1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: '' });

// Vendas que sabemos que faltam no banco (números conhecidos)
// Vamos simular o parseXLSX do script original e ver quais vendas ele consegue parsear
const sales = [];
let currentSale = null;

for (const row of data1) {
  const saleNumber = row['Nº Venda'];
  if (saleNumber != '' && saleNumber != undefined && saleNumber != null) {
    if (currentSale && currentSale.items.length > 0) {
      sales.push(currentSale);
    }
    currentSale = {
      num: Number(saleNumber),
      totalAmount: parseFloat(row['Valor Total']) || 0,
      netAmount: parseFloat(row['Valor Líquido']) || 0,
      paymentRaw: String(row['Forma de pagamento'] || ''),
      customer: String(row['Cliente'] || ''),
      items: [],
    };
  } else {
    const desc = String(row['Item - Descrição'] || '').trim();
    const ref = String(row['Item - Referência'] || '').trim();
    if ((desc || ref) && currentSale) {
      const originalPrice = parseFloat(row['Item - Valor Original']) || 0;
      const unitPrice = parseFloat(row['Item - Valor Unitário']) || originalPrice;
      currentSale.items.push({ desc, ref, originalPrice, unitPrice });
    }
  }
}
if (currentSale && currentSale.items.length > 0) sales.push(currentSale);

console.log('Vendas parseadas:', sales.length);

// Ver vendas com totalAmount = 0
const zeroTotal = sales.filter(s => s.totalAmount === 0);
console.log('Vendas com total=0:', zeroTotal.length);

// Ver vendas com netAmount = 0
const zeroNet = sales.filter(s => s.netAmount === 0);
console.log('Vendas com netAmount=0:', zeroNet.length);

// Ver vendas sem forma de pagamento
const noPayment = sales.filter(s => !s.paymentRaw || s.paymentRaw.startsWith('---'));
console.log('Vendas sem forma de pagamento:', noPayment.length);

// Ver vendas com valores negativos
const negative = sales.filter(s => s.totalAmount < 0 || s.netAmount < 0);
console.log('Vendas com valor negativo:', negative.length);
if (negative.length > 0) {
  console.log('  Primeiras 5:', negative.slice(0, 5).map(s => ({ num: s.num, total: s.totalAmount, net: s.netAmount })));
}

// Ver se tem vendas com itens todos com preço 0
const allItemsZero = sales.filter(s => s.items.every(i => i.unitPrice === 0));
console.log('Vendas onde todos os itens têm preço 0:', allItemsZero.length);

// Verificar vendas com cliente vazio ou "---"
const noCustomer = sales.filter(s => !s.customer || s.customer.startsWith('---'));
console.log('Vendas sem cliente:', noCustomer.length);

// Check for Forma de pagamento column in file 1
console.log('\n--- Checking payment column ---');
const paymentCol = 'Forma de pagamento';
const hasPayment = data1.filter(r => r[paymentCol] && r[paymentCol] != '').length;
console.log('Linhas com Forma de pagamento:', hasPayment);

// Check if items have the ref column in both formats
console.log('\n--- Sample item from file 1 ---');
for (const row of data1) {
  if (!row['Nº Venda'] && row['Item - Descrição']) {
    console.log(JSON.stringify(row, null, 2));
    break;
  }
}
