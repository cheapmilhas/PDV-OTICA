/**
 * APLICAR PREÇOS — Óticas P.S Vision (a partir dos "Relatorio Vendas Detalhada" .xls)
 *
 * Cruza o "Valor unitário" das planilhas de venda com os produtos cadastrados e preenche
 * o salePrice. Estratégia de match (em ordem):
 *   1) Por SKU "PSV-<Cod.Interno>"  (produtos do import legado anterior)
 *   2) Por NOME exato (case-insensitive, trim) — pega as PSV-ARM-* e quaisquer outros
 *
 * Preço escolhido = "Valor unitário" da venda MAIS RECENTE do produto (por Data).
 * (Valor unitário = preço cheio do item; ignoramos desconto/subtotal.)
 *
 * Custo: NÃO mexemos. O "Custo" das planilhas é majoritariamente 1,00 (placeholder do
 * sistema legado) — não confiável. Dono ajusta custo manualmente se quiser.
 *
 * Uso:
 *   npx tsx scripts/apply-psvision-precos.ts            # DRY-RUN
 *   npx tsx scripts/apply-psvision-precos.ts --commit   # grava salePrice
 */
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";

const COMMIT = process.argv.includes("--commit");
const COMPANY_NAME = "Óticas P.S Vision";

const FILES = [
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/2397B463-5E5D-47C9-974B-52731031AA78/Relatorio Vendas Detalhada (2).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/D6DA6425-C4F4-44E4-9B50-BC8E7BC94737/Relatorio Vendas Detalhada (3).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/4E9695AC-E2B7-40C0-A6F1-859248DD7B22/Relatorio Vendas Detalhada (4).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/7951F78D-529D-46CE-B921-099D442A0B5F/Relatorio Vendas Detalhada (5).xls",
  "/var/folders/tw/3l26s9zn7sx0m9chwm58dg880000gn/T/net.whatsapp.WhatsApp/documents/FCDD760E-C18D-4EED-8CDE-52A5880F1D9A/Relatorio Vendas Detalhada (6).xls",
];

// "399,00" -> 399.00 ; "1155,66" -> 1155.66
function parseBR(num: string): number {
  if (num == null) return NaN;
  const s = String(num).trim().replace(/\./g, "").replace(",", ".");
  return parseFloat(s);
}
// "06-05-2026" -> Date
function parseBRDate(d: string): number {
  const m = String(d).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return 0;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`).getTime();
}
function norm(s: string): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

type SaleRow = { cod: string; name: string; unit: number; dateMs: number; dateStr: string };

function readSales(): SaleRow[] {
  const out: SaleRow[] = [];
  for (const f of FILES) {
    const wb = XLSX.readFile(f);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const cod = String(r[2] ?? "").trim();
      const name = String(r[3] ?? "").trim();
      const unit = parseBR(r[5]); // Valor unitário
      const dateStr = String(r[10] ?? "").trim();
      if (!name || !Number.isFinite(unit)) continue;
      out.push({ cod, name, unit, dateMs: parseBRDate(dateStr), dateStr });
    }
  }
  return out;
}

async function main() {
  const company = await prisma.company.findFirst({ where: { name: COMPANY_NAME }, select: { id: true } });
  if (!company) throw new Error("Empresa não encontrada");
  const companyId = company.id;

  const sales = readSales();
  console.log(`Linhas de venda lidas: ${sales.length}`);

  // Preço mais recente por Cod.Interno e por NOME
  const byCod = new Map<string, SaleRow>();
  const byName = new Map<string, SaleRow>();
  for (const s of sales) {
    if (s.cod) {
      const cur = byCod.get(s.cod);
      if (!cur || s.dateMs >= cur.dateMs) byCod.set(s.cod, s);
    }
    const k = norm(s.name);
    const cur2 = byName.get(k);
    if (!cur2 || s.dateMs >= cur2.dateMs) byName.set(k, s);
  }
  console.log(`Cod.Interno distintos: ${byCod.size} | Nomes distintos: ${byName.size}`);

  const products = await prisma.product.findMany({
    where: { companyId },
    select: { id: true, sku: true, name: true, salePrice: true },
  });
  console.log(`Produtos da empresa: ${products.length}\n`);

  type Plan = { id: string; sku: string; name: string; old: number; price: number; via: string; src: string };
  const updates: Plan[] = [];
  const noMatch: { sku: string; name: string }[] = [];

  for (const p of products) {
    let match: SaleRow | undefined;
    let via = "";
    // 1) PSV-<cod>
    const m = p.sku.match(/^PSV-(\d+)$/);
    if (m && byCod.has(m[1])) {
      match = byCod.get(m[1]);
      via = `SKU→cod ${m[1]}`;
    }
    // 2) nome exato
    if (!match) {
      const byN = byName.get(norm(p.name));
      if (byN) {
        match = byN;
        via = "nome";
      }
    }
    if (!match) {
      noMatch.push({ sku: p.sku, name: p.name });
      continue;
    }
    updates.push({
      id: p.id,
      sku: p.sku,
      name: p.name,
      old: Number(p.salePrice),
      price: match.unit,
      via,
      src: `${match.name} @ ${match.dateStr}`,
    });
  }

  // Relatório
  console.log("=== PRODUTOS QUE RECEBERÃO PREÇO ===");
  for (const u of updates.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))) {
    const change = u.old !== u.price ? `R$${u.old} → R$${u.price}` : `R$${u.price} (igual)`;
    console.log(`${u.sku.padEnd(12)} ${change.padEnd(22)} [${u.via}]  ${u.name}`);
  }
  console.log(`\nTotal com match: ${updates.length}`);
  const changed = updates.filter((u) => u.old !== u.price);
  console.log(`  Mudam de preço: ${changed.length}`);
  console.log(`  Já iguais: ${updates.length - changed.length}`);
  console.log(`Sem match (sem preço nas planilhas): ${noMatch.length}`);
  console.log("\n=== SEM MATCH (ficam como estão) ===");
  noMatch
    .sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
    .forEach((n) => console.log(`  ${n.sku.padEnd(12)} ${n.name}`));

  console.log(`\nModo: ${COMMIT ? "COMMIT (grava)" : "DRY-RUN (não grava)"}`);

  if (COMMIT) {
    let n = 0;
    for (const u of changed) {
      await prisma.product.update({ where: { id: u.id }, data: { salePrice: u.price } });
      n++;
    }
    console.log(`\n✓ salePrice atualizado em ${n} produtos.`);
  } else {
    console.log("\n(DRY-RUN — rode com --commit para gravar)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
