const XLSX = require('xlsx');

// Clients
const wb = XLSX.readFile('/Users/matheusreboucas/Downloads/clientes-14-03-2026-10-48-25.xlsx');
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

const stores = {};
data.forEach(r => { const s = r['Cadastrado Em'] || 'null'; stores[s] = (stores[s] || 0) + 1; });
console.log('Client stores:', stores);

const phones = data.filter(r => r.celular).slice(0, 5).map(r => r.celular);
console.log('Phone samples:', phones);

const docs = data.filter(r => r.Documento).slice(0, 5).map(r => r.Documento);
console.log('Doc samples:', docs);

const sexos = [...new Set(data.map(r => r.Sexo).filter(Boolean))];
console.log('Sexo values:', sexos);

const fields = ['celular','telefone','Documento','email','Endereço','Cidade','Estado','Bairro','CEP','Data de Nascimento','Sexo','Apelido / Nome Fantasia','celular1','celular2','celular3','Observação','RG / IE','Codigo Externo'];
fields.forEach(f => {
  const count = data.filter(r => r[f] !== null && r[f] !== undefined && String(r[f]).trim() !== '').length;
  if (count > 0) console.log(`  ${f}: ${count} (${(count/data.length*100).toFixed(1)}%)`);
});

// Products
console.log('\n--- PRODUCTS ---');
const files = [
  '/Users/matheusreboucas/Downloads/exportacao-produtos-2026-03-14_10_47_49/exportacao-produtos-ado_cascavel-2026-03-14_10-47-47.xlsx',
  '/Users/matheusreboucas/Downloads/exportacao-produtos-2026-03-14_10_47_49/exportacao-produtos-ado_eusebio-2026-03-14_10-47-47.xlsx',
  '/Users/matheusreboucas/Downloads/exportacao-produtos-2026-03-14_10_47_49/exportacao-produtos-ado_pacajus-2026-03-14_10-47-48.xlsx',
];

files.forEach(f => {
  const pwb = XLSX.readFile(f);
  const pdata = XLSX.utils.sheet_to_json(pwb.Sheets[pwb.SheetNames[0]], { defval: null });
  console.log(`\n${pwb.SheetNames[0]}: ${pdata.length} products`);

  const cats = {};
  pdata.forEach(r => { cats[r['Grupo']] = (cats[r['Grupo']] || 0) + 1; });
  console.log('  Categories:', cats);

  const sups = {};
  pdata.filter(r => r['Fornecedor']).forEach(r => { sups[r['Fornecedor']] = (sups[r['Fornecedor']] || 0) + 1; });
  console.log('  Suppliers:', sups);

  const units = {};
  pdata.filter(r => r['Unidade']).forEach(r => { units[r['Unidade']] = (units[r['Unidade']] || 0) + 1; });
  console.log('  Units:', units);

  // Stock stats
  const withStock = pdata.filter(r => r['Estoque Atual'] > 0).length;
  console.log(`  With stock > 0: ${withStock}`);
});
