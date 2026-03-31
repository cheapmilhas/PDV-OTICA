/**
 * Script de importação de clientes e produtos — Óticas Ultra
 * Uso: npx ts-node scripts/import-oticas-ultra.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const COMPANY_ID = 'cmn8ww0mf0002m25sqbd04b5q';

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseCsv(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const values = line.split(';').map(v => v.replace(/"/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  const [day, month, year] = str.split('/');
  if (!day || !month || !year) return null;
  const d = new Date(`${year}-${month}-${day}`);
  return isNaN(d.getTime()) ? null : d;
}

function parseDecimal(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(',', '.')) || 0;
}

function parseIntQty(str: string): number {
  if (!str) return 0;
  const v = parseFloat(str.replace(',', '.'));
  return isNaN(v) ? 0 : Math.max(0, Math.round(v));
}

// ─── Importar Clientes ──────────────────────────────────────────────────────

async function importCustomers() {
  const filePath = path.resolve('/Users/matheusreboucas/Downloads/CADASTRO DE CLIENTES.csv');
  const rows = parseCsv(filePath);

  console.log(`\n📋 Importando ${rows.length} clientes...`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const name = row['Nome/Razão Social']?.trim();
    if (!name) { skipped++; continue; }

    const cpf = row['CPF']?.trim() || null;
    const gender = row['Sexo (M ou F)']?.trim().toUpperCase() || null;
    const birthDate = parseDate(row['Data de nascimento']);
    const phone = row['Telefone']?.trim() || null;
    const phone2 = row['Celular']?.trim() || null;
    const email = row['Email']?.trim() || null;
    const address = row['Endereço']?.trim() || null;
    const number = row['Número']?.trim() || null;
    const complement = row['Complemento']?.trim() || null;
    const neighborhood = row['Bairro']?.trim() || null;
    const city = row['Cidade']?.trim() || null;
    const state = row['Estado']?.trim() || null;
    const zipCode = row['CEP']?.trim() || null;
    const rg = row['RG']?.trim() || null;

    try {
      await prisma.customer.create({
        data: {
          companyId: COMPANY_ID,
          name,
          cpf,
          rg,
          gender,
          birthDate,
          phone,
          phone2,
          email,
          address,
          number,
          complement,
          neighborhood,
          city,
          state,
          zipCode,
        },
      });
      created++;
    } catch (err: any) {
      // CPF duplicado dentro da mesma empresa
      if (err.code === 'P2002') {
        skipped++;
      } else {
        console.error(`  ❌ Erro ao importar cliente "${name}":`, err.message);
        errors++;
      }
    }
  }

  console.log(`  ✅ Criados: ${created}`);
  console.log(`  ⏭️  Pulados (duplicados): ${skipped}`);
  console.log(`  ❌ Erros: ${errors}`);
}

// ─── Mapeamento de categoria CSV → ProductType ──────────────────────────────

function mapProductType(categoria: string): string {
  const c = categoria.toUpperCase();
  if (c.includes('ARMAÇÃO') || c.includes('ARMACAO')) return 'FRAME';
  if (c.includes('CONTATO')) return 'CONTACT_LENS';
  if (c.includes('PROGRESSIV') || c.includes('VISÃO SIMPLES') || c.includes('VISAO SIMPLES') || c.includes('OCUPACIONAL')) return 'OPHTHALMIC_LENS';
  if (c.includes('LENTE')) return 'OPHTHALMIC_LENS';
  if (c.includes('SOLAR') || c.includes('SOL')) return 'SUNGLASSES';
  if (c.includes('LIMPA') || c.includes('SOLUÇÃO') || c.includes('SOLUCAO')) return 'LENS_SOLUTION';
  if (c.includes('ESTOJO') || c.includes('CASE')) return 'CASE';
  if (c.includes('TRATAMENTO') || c.includes('SERVIÇO') || c.includes('SERVICO')) return 'LENS_SERVICE';
  if (c.includes('JOIA') || c.includes('ALIANÇA') || c.includes('ALIANCA')) return 'ACCESSORY';
  return 'OTHER';
}

// ─── Importar Produtos ──────────────────────────────────────────────────────

async function importProducts() {
  const filePath = path.resolve('/Users/matheusreboucas/Downloads/Produtos.csv');
  const rows = parseCsv(filePath);

  console.log(`\n📦 Importando ${rows.length} produtos...`);

  // Cache de categorias por nome
  const categoryCache: Record<string, string> = {};

  async function getOrCreateCategory(name: string): Promise<string | null> {
    if (!name) return null;
    if (categoryCache[name]) return categoryCache[name];

    let cat = await prisma.category.findFirst({
      where: { companyId: COMPANY_ID, name },
      select: { id: true },
    });

    if (!cat) {
      cat = await prisma.category.create({
        data: {
          companyId: COMPANY_ID,
          name,
        },
        select: { id: true },
      });
    }

    categoryCache[name] = cat.id;
    return cat.id;
  }

  // Cache de marcas por nome
  const brandCache: Record<string, string> = {};

  async function getOrCreateBrand(name: string): Promise<string | null> {
    if (!name || name === 'DIVERSOS') return null;
    if (brandCache[name]) return brandCache[name];

    let brand = await prisma.brand.findFirst({
      where: { companyId: COMPANY_ID, name },
      select: { id: true },
    });

    if (!brand) {
      brand = await prisma.brand.create({
        data: {
          companyId: COMPANY_ID,
          name,
          code: name.substring(0, 20).toUpperCase().replace(/\s+/g, '_'),
        },
        select: { id: true },
      });
    }

    brandCache[name] = brand.id;
    return brand.id;
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let skuCounter = 1;

  for (const row of rows) {
    const name = row['Descrição']?.trim();
    if (!name) { skipped++; continue; }

    const barcode = row['Código de Barras']?.trim() || null;
    const internalCode = row['Código Interno']?.trim() || null;
    // SKU: usa código interno se existir, senão gera sequencial
    const sku = internalCode || `IMP-${String(skuCounter++).padStart(4, '0')}`;

    const costPrice = parseDecimal(row['Preço de Custo']);
    const salePrice = parseDecimal(row['Preço Venda Varejo']);
    const stockControlled = row['Movimenta Estoque']?.trim() === 'Sim';
    const stockMin = parseIntQty(row['Estoque mínimo']);
    const stockQty = parseIntQty(row['Quantidade em Estoque']);
    const active = row['Ativo']?.trim() === 'Sim';

    const categoryName = row['Categoria do Produto']?.trim() || '';
    const brandName = row['Marca']?.trim() || '';

    const categoryId = await getOrCreateCategory(categoryName);
    const brandId = await getOrCreateBrand(brandName);

    // Verificar se SKU já existe
    const exists = await prisma.product.findFirst({
      where: { companyId: COMPANY_ID, sku },
      select: { id: true },
    });

    if (exists) { skipped++; continue; }

    try {
      const productType = mapProductType(categoryName) as any;

      await prisma.product.create({
        data: {
          companyId: COMPANY_ID,
          type: productType,
          sku,
          barcode,
          name,
          costPrice,
          salePrice,
          stockControlled,
          stockQty,
          stockMin,
          active,
          categoryId,
          brandId,
        },
      });
      created++;
    } catch (err: any) {
      if (err.code === 'P2002') {
        skipped++;
      } else {
        console.error(`  ❌ Erro ao importar produto "${name}":`, err.message);
        errors++;
      }
    }
  }

  console.log(`  ✅ Criados: ${created}`);
  console.log(`  ⏭️  Pulados (duplicados): ${skipped}`);
  console.log(`  ❌ Erros: ${errors}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Importação Óticas Ultra — iniciando...');
  console.log(`   companyId: ${COMPANY_ID}\n`);

  await importCustomers();
  await importProducts();

  console.log('\n✅ Importação concluída!');
}

main()
  .catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
