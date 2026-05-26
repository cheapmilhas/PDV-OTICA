const XLSX = require('xlsx');

// Arquivo 1 - original usado na importação
const wb1 = XLSX.readFile('/Users/matheusreboucas/Downloads/relatorio-vendas-2026-03-17-15-29-ado-pacajus.xlsx');
const ws1 = wb1.Sheets[wb1.SheetNames[0]];
const data1 = XLSX.utils.sheet_to_json(ws1, { defval: '' });
const sales1 = new Set();
data1.forEach(r => {
  if (r['Nº Venda'] !== '' && r['Nº Venda'] !== undefined && r['Nº Venda'] !== null) {
    sales1.add(Number(r['Nº Venda']));
  }
});
console.log('=== ARQUIVO 1 (relatorio-vendas-17-03) ===');
console.log('Linhas totais:', data1.length);
console.log('Vendas únicas:', sales1.size);

// Arquivo 2 - exportação mais recente
const wb2 = XLSX.readFile('/Users/matheusreboucas/Downloads/exportacao-vendas-2026-03-22-21-56-ado-pacajus.xlsx');
const ws2 = wb2.Sheets[wb2.SheetNames[0]];
const data2 = XLSX.utils.sheet_to_json(ws2, { defval: '' });
const sales2 = new Set();
data2.forEach(r => {
  const v = r['Número Venda'];
  if (v !== '' && v !== undefined && v !== null) {
    sales2.add(Number(v));
  }
});
console.log('\n=== ARQUIVO 2 (exportacao-vendas-22-03) ===');
console.log('Linhas totais:', data2.length);
console.log('Vendas únicas:', sales2.size);
console.log('Colunas:', Object.keys(data2[0] || {}));
console.log('Primeira linha:', JSON.stringify(data2[0], null, 2));

// Diferença
const onlyIn2 = [...sales2].filter(s => !sales1.has(s));
const onlyIn1 = [...sales1].filter(s => !sales2.has(s));
const inBoth = [...sales2].filter(s => sales1.has(s));

console.log('\n=== COMPARAÇÃO ===');
console.log('Vendas só no arquivo 2 (novas):', onlyIn2.length);
console.log('Vendas só no arquivo 1 (não estão no 2):', onlyIn1.length);
console.log('Vendas em ambos:', inBoth.length);

if (onlyIn2.length > 0) {
  const sorted = onlyIn2.sort((a, b) => a - b);
  console.log('\nPrimeiras 20 vendas só no arquivo 2:', sorted.slice(0, 20));
  console.log('Últimas 20 vendas só no arquivo 2:', sorted.slice(-20));
}

// Verificar coluna "Documento" ou "CPF" no arquivo 2
const cols2 = Object.keys(data2[0] || {});
console.log('\n=== COLUNAS ARQUIVO 2 DETALHADAS ===');
cols2.forEach(c => console.log(' -', c));

// Amostra de dados do arquivo 2
console.log('\n=== 3 PRIMEIRAS VENDAS DO ARQUIVO 2 ===');
let count = 0;
for (const r of data2) {
  if (r['Nº Venda'] !== '' && r['Nº Venda'] !== undefined) {
    console.log(JSON.stringify(r, null, 2));
    count++;
    if (count >= 3) break;
  }
}
