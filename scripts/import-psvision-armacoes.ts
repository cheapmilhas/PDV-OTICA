/**
 * IMPORT — Armações da Óticas P.S Vision (lote 2026-06-11, fotos do sistema legado Mentora).
 *
 * Fonte: 10 prints da tela "Alteração de Estoque" (paginação 1..10) enviados pelo dono.
 * Regra acordada com o dono:
 *   - Cadastrar TODOS os modelos únicos (catálogo completo).
 *   - Estoque = coluna "Qtd. Estoque Atual" da ÚLTIMA ocorrência do modelo, com piso 0
 *     (nunca negativo). Itens já vendidos ficam com 0.
 *   - Preço de venda e custo = 0 (dono define depois).
 *   - type = FRAME (são armações). stockControlled = true (igual aos PSV-* existentes).
 *   - name = nome completo da foto (preserva gênero/material p/ ficar fiel e sem ambiguidade).
 *   - sku = PSV-ARM-<n> (prefixo distinto p/ não colidir com os PSV-<n> já existentes).
 *
 * Idempotente: usa upsert por (companyId, sku). Rodar de novo não duplica.
 *
 * Uso:
 *   npx tsx scripts/import-psvision-armacoes.ts            # DRY-RUN (só mostra o que faria)
 *   npx tsx scripts/import-psvision-armacoes.ts --commit   # grava no banco
 */
import { prisma } from "../src/lib/prisma";

const COMPANY_NAME = "Óticas P.S Vision";
const SKU_PREFIX = "PSV-ARM-";
const COMMIT = process.argv.includes("--commit");

// nome = texto completo da foto; stock = "Qtd. Estoque Atual" da última linha, piso 0 aplicado abaixo.
type Item = { name: string; stock: number };

const ITEMS: Item[] = [
  // ---- Página 1 ----
  { name: "ARMACAO ACETATO MASC- GC5033 55-17-145", stock: 0 },
  { name: "ARMACAO ACETATO FEM- GC2433 52 16-140 C1", stock: 0 },
  { name: "ARMACAO ACETATO MASC INFANT- BA595 46 19-126", stock: 1 },
  { name: "ARMACAO ACETATO T9- BR98183 C5 54 17-140", stock: 1 },
  { name: "ARMACAO FEM ACETATO- 123 LQ", stock: 1 },
  { name: "ARMACAO FEM ACETATO- 1838 45 19-132 C-9", stock: 1 },
  { name: "ARMACAO FEM ACETATO- 5205 C2 48 16-128", stock: 1 },
  // ---- Página 2 ----
  { name: "ARMACAO FEM ACETATO- 760 54 19 147", stock: 0 },
  { name: "ARMACAO FEM ACETATO - AG8033 55 19-146 C2", stock: 1 },
  { name: "ARMACAO FEM ACETATO- BA812 49 17-135", stock: 1 },
  { name: "ARMACAO FEM ACETATO- BR2011 C3 48 16-130", stock: 1 },
  { name: "ARMACAO FEM ACETATO BR22123C1 ROSE 5417143", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO FEM ACETATO- BR5646 55 18-140", stock: 1 },
  { name: "ARMACAO FEM ACETATO- DB1733 48-16-130", stock: 1 },
  { name: "ARMACAO FEM ACETATO- FF0271 48 20-140", stock: 1 },
  { name: "ARMACAO FEM ACETATO- FF0280 50 19-140", stock: 1 },
  // ---- Página 3 ----
  { name: "ARMACAO FEM ACETATO- FH0132 52 16-140", stock: 1 },
  { name: "ARMACAO FEM ACETATO- LQ6217 53 16 140", stock: 1 },
  { name: "ARMACAO FEM ACETATO- MR9103 47 15 136 C2", stock: 1 },
  { name: "ARMACAO FEM ACETATO- NT8901 50 22-145", stock: 1 },
  { name: "ARMACAO FEM ACETATO- RHAR-F1013", stock: 1 },
  { name: "ARMACAO FEM ACETATO- SL1619 50 16-140 C1", stock: 0 }, // última linha -1 → piso 0
  { name: "ARMACAO FEM ACETATO- SL 1776 54 17-145 C1", stock: 1 },
  { name: "ARMACAO FEM ACETATO- T702 53 17 140", stock: 1 },
  // ---- Página 4 ----
  { name: "ARMACAO FEM ACETATO T776 4919145 C2 VIRGINIA ANIM PRINT", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO FEM ACETATO T776 4919145 C2 VIRGINIA PRETA", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO FEMENINA BIANCA", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO FEMININA", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO FEM METAL- XZ82103 51 21-143", stock: 1 },
  { name: "ARMACAO FEM T9- 3304", stock: 1 },
  { name: "ARMACAO FEM T9- BR5628 55 17-143", stock: 1 },
  { name: "ARMACAO FEM T9- BR5783 54 19 140", stock: 0 }, // última linha venda → 0
  // ---- Página 5 ----
  { name: "ARMACAO FEM T9- BR98158 53 20-136 C2", stock: 1 },
  { name: "ARMACAO FEM T9- FY204 52 18-138", stock: 1 },
  { name: "ARMACAO FEM T9- LC81522 51 18-140 C6", stock: 1 },
  { name: "ARMACAO FEM T9- LQ0075 53 20-140", stock: 1 },
  { name: "ARMACAO FEM T9- NT7012 55 17-142", stock: 1 },
  { name: "ARMACAO FEM T9- SL80559 53 20-140 C3", stock: 1 },
  { name: "ARMACAO FEM TENOVE- 123", stock: 1 },
  { name: "ARMACAO MASC ACETATO- 138 OX 2005 0853", stock: 1 },
  { name: "ARMACAO MASC ACETATO- 5140-xz 56 16-140", stock: 1 },
  { name: "ARMACAO MASC ACETATO- 5815 55 18-140", stock: 1 },
  // ---- Página 6 ----
  { name: "ARMACAO MASC ACETATO- 59285 54 16-143", stock: 1 },
  { name: "ARMACAO MASC ACETATO- 6162 54 15 145", stock: 1 },
  { name: "ARMACAO MASC ACETATO- 7501 51 18-140", stock: 0 }, // última linha venda → 0
  { name: "ARMACAO MASC ACETATO- 88006 55 18-140", stock: 1 },
  { name: "ARMACAO MASC ACETATO- 9172 57 15-141", stock: 1 },
  { name: "ARMACAO MASC ACETATO- D9024 53 18-145", stock: 1 },
  { name: "ARMACAO MASC ACETATO- EA1112 52 17-145 C05", stock: 1 },
  // ---- Página 7 ----
  { name: "ARMACAO MASC ACETATO- FH0140 56 16-140 C5", stock: 1 },
  { name: "ARMACAO MASC ACETATO- FT110 56 18-140 C1", stock: 1 },
  { name: "ARMACAO MASC ACETATO- G81590 53 16-136 C1", stock: 1 },
  { name: "ARMACAO MASC ACETATO INFAN- BR4381 C5 49 16-130", stock: 1 },
  { name: "ARMACAO MASC ACETATO INFANT- ET3604 51 16-146 C5", stock: 1 },
  { name: "ARMACAO MASC ACETATO- J82101 54 17-140", stock: 0 }, // última linha venda → 0
  // ---- Página 8 ----
  { name: "ARMACAO MASC ACETATO- L295 52 17 138 C1", stock: 1 },
  { name: "ARMACAO MASC ACETATO- LQ5041 50 18 140", stock: 1 },
  { name: "ARMACAO MASC ACETATO- MR9046 56 17 149", stock: 1 },
  { name: "ARMACAO MASC ACETATO- MY3451 59 20-150 C1", stock: 1 },
  { name: "ARMACAO MASC ACETATO- MY3452 60-19-150 C4", stock: 1 },
  { name: "ARMACAO MASC ACETATO- NV90645 48 18-135", stock: 1 },
  { name: "ARMACAO MASC ACETATO- R3025 50 21-142", stock: 1 },
  { name: "ARMACAO MASC ACETATO- RAY BAM G15 LENS", stock: 1 },
  { name: "ARMACAO MASC ACETATO- RHTR-J406 COL.03 55 17-140", stock: 1 },
  // ---- Página 9 ----
  { name: "ARMACAO MASC ACETATO- TAG0530 C7 54 19-140", stock: 1 },
  { name: "ARMACAO MASC ACETATO- TR90 8127 53 17-135", stock: 1 },
  { name: "ARMACAO MASC ACETATO- TR90 95001 55 16-145", stock: 1 },
  { name: "ARMACAO MASC ACETATO- VS2430 62 18-155 C4 CE", stock: 0 }, // última linha venda → 0
  { name: "ARMACAO MASC ACETATO- xz-58899-2 52 20-145 CE", stock: 1 },
  { name: "ARMACAO MASC ACETATO- ZY5205 52 18 142", stock: 1 },
  { name: "ARMACAO MASC INFANT- BR4381 C2 49 16-130", stock: 1 },
  { name: "ARMACAO MASC METAL- 8866 51 18-140", stock: 0 }, // última linha venda → 0
  // ---- Página 10 ----
  { name: "ARMACAO MASCULINA", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO MASCULINA CLIPON 1056", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO METAL MASC OX50040153138-01", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO METAL MASC OX50040-153-138-2", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO PARAFUSADA MASCULINA DOURADA SH3052 5316145C1", stock: 0 }, // -1 → piso 0
  { name: "ARMACAO VIRGINIA NUDE", stock: 0 }, // -1 → piso 0
];

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Empresa não encontrada: ${COMPANY_NAME}`);
  const companyId = company.id;

  // Sanidade: detectar nomes duplicados na própria lista (cada modelo deve ser único)
  const seen = new Map<string, number>();
  for (const it of ITEMS) seen.set(it.name, (seen.get(it.name) ?? 0) + 1);
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  if (dups.length) {
    console.error("⚠️  Nomes duplicados na lista de entrada:", dups);
    throw new Error("Lista tem nomes duplicados — revisar antes de gravar.");
  }

  // Não recriar produto que já exista por NOME (evita duplicar import anterior, se houver)
  const existingByName = await prisma.product.findMany({
    where: { companyId, name: { in: ITEMS.map((i) => i.name) } },
    select: { name: true, sku: true },
  });
  const existingNames = new Set(existingByName.map((p) => p.name));
  if (existingNames.size) {
    console.log(`Já existem ${existingNames.size} produtos com nomes desta lista — serão pulados:`);
    existingByName.forEach((p) => console.log(`   - [${p.sku}] ${p.name}`));
  }

  const toCreate = ITEMS.filter((i) => !existingNames.has(i.name));

  console.log(`\nEmpresa: ${company.name} (${companyId})`);
  console.log(`Total na lista: ${ITEMS.length}`);
  console.log(`Já existentes (por nome): ${existingNames.size}`);
  console.log(`A cadastrar: ${toCreate.length}`);
  console.log(`Modo: ${COMMIT ? "COMMIT (grava)" : "DRY-RUN (não grava)"}\n`);

  // Sequência de SKU: continuar a partir do maior PSV-ARM-<n> já existente
  const existingArmSkus = await prisma.product.findMany({
    where: { companyId, sku: { startsWith: SKU_PREFIX } },
    select: { sku: true },
  });
  let nextSeq =
    existingArmSkus.reduce((max, p) => {
      const n = parseInt(p.sku.slice(SKU_PREFIX.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1;

  let created = 0;
  for (const it of toCreate) {
    const sku = `${SKU_PREFIX}${nextSeq}`;
    const stock = Math.max(0, it.stock); // piso 0
    if (COMMIT) {
      await prisma.product.create({
        data: {
          companyId,
          type: "FRAME",
          sku,
          name: it.name,
          costPrice: 0,
          salePrice: 0,
          stockControlled: true,
          stockQty: stock,
          stockMin: 0,
          active: true,
        },
      });
    }
    console.log(`${COMMIT ? "✓" : "•"} ${sku}  stock=${stock}  ${it.name}`);
    nextSeq++;
    created++;
  }

  console.log(`\n${COMMIT ? "Criados" : "Seriam criados"}: ${created}`);
  if (!COMMIT) console.log("\n(DRY-RUN — rode com --commit para gravar)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
