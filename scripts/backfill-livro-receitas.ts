/**
 * Backfill do Livro de Receitas (Fase 2a).
 *
 * Popula a tabela relacional `Prescription` a partir das OSs antigas que têm
 * grau no JSON `prescriptionData`, para o Livro nascer já com histórico.
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta o que faria. Não escreve nada.
 *   apply            — escreve no banco. SÓ rodar com aprovação + snapshot.
 *
 * Uso:
 *   npx tsx scripts/backfill-livro-receitas.ts            # dry-run
 *   npx tsx scripts/backfill-livro-receitas.ts --apply    # aplica (gated)
 *
 * 3 CASOS (idempotente por construção):
 *   (a) OS tem venda e a venda JÁ tem receita  → skip.
 *   (b) OS tem venda, sem receita              → cria por saleId; OS ganha prescriptionId.
 *   (c) OS SEM venda                           → cria por serviceOrderId (origem=OS), saleId=null.
 *
 * SEGURANÇA:
 *  - Re-rodar não duplica (upsert por saleId / findFirst por serviceOrderId).
 *  - Foto: lê prescriptionImageUrl da OS; fallback imageUrl legado.
 *  - Multi-tenant: companyId sempre da própria OS.
 *  - À prova de OS sem cliente: pula (Livro exige customerId).
 */
import { prisma } from "@/lib/prisma";
import { upsertPrescription } from "@/services/livro-receitas.service";

const APPLY = process.argv.includes("--apply");

interface Counters {
  total: number;
  skipNoCustomer: number;
  caseA_alreadyHasRx: number;
  caseB_saleNoRx: number;
  caseC_noSale: number;
  written: number;
}

async function main() {
  console.log(`\n=== BACKFILL Livro de Receitas — modo: ${APPLY ? "APPLY (ESCREVE)" : "DRY-RUN (só leitura)"} ===\n`);

  // Backfill administrativo: varre TODAS as empresas de propósito (cada receita
  // herda o companyId da própria OS). O warn de tenant-guard abaixo é esperado.
  const orders = await prisma.serviceOrder.findMany({
    where: { prescriptionData: { not: undefined }, deletedAt: null },
    select: {
      id: true,
      companyId: true,
      customerId: true,
      branchId: true,
      createdByUserId: true,
      createdAt: true,
      prescriptionData: true,
      prescriptionImageUrl: true,
      sale: { select: { id: true, createdAt: true } },
    },
  });

  const c: Counters = {
    total: orders.length,
    skipNoCustomer: 0,
    caseA_alreadyHasRx: 0,
    caseB_saleNoRx: 0,
    caseC_noSale: 0,
    written: 0,
  };

  for (const os of orders) {
    const data = os.prescriptionData as { od?: unknown; oe?: unknown; adicao?: unknown } | null;
    if (!data) continue; // JSON null (OS sem grau)
    if (!os.customerId) {
      c.skipNoCustomer++;
      continue;
    }

    const saleId = os.sale?.id ?? null;
    const imageUrl = os.prescriptionImageUrl ?? undefined;
    // Data real de emissão: da venda se houver, senão da OS. NÃO usar "agora"
    // (senão toda receita histórica fica com a data do backfill).
    const issuedAt = os.sale?.createdAt ?? os.createdAt;

    if (saleId) {
      const existing = await prisma.prescription.findUnique({ where: { saleId }, select: { id: true } });
      if (existing) {
        c.caseA_alreadyHasRx++;
        continue; // caso (a)
      }
      c.caseB_saleNoRx++; // caso (b)
      if (APPLY) {
        const rx = await upsertPrescription({
          companyId: os.companyId,
          customerId: os.customerId,
          branchId: os.branchId,
          saleId,
          issuedAt,
          createdByUserId: os.createdByUserId,
          prescriptionImageUrl: imageUrl,
          od: data.od as never,
          oe: data.oe as never,
          adicao: data.adicao as never,
        });
        await prisma.serviceOrder.update({ where: { id: os.id }, data: { prescriptionId: rx.id } });
        c.written++;
      }
    } else {
      // caso (c): OS sem venda → origem é a própria OS.
      const existing = await prisma.prescription.findFirst({
        where: { serviceOrderId: os.id, companyId: os.companyId },
        select: { id: true },
      });
      if (existing) {
        c.caseA_alreadyHasRx++;
        continue;
      }
      c.caseC_noSale++;
      if (APPLY) {
        const rx = await upsertPrescription({
          id: undefined,
          companyId: os.companyId,
          customerId: os.customerId,
          branchId: os.branchId,
          serviceOrderId: os.id,
          issuedAt,
          createdByUserId: os.createdByUserId,
          prescriptionImageUrl: imageUrl,
          od: data.od as never,
          oe: data.oe as never,
          adicao: data.adicao as never,
        });
        await prisma.serviceOrder.update({ where: { id: os.id }, data: { prescriptionId: rx.id } });
        c.written++;
      }
    }
  }

  console.log("Resumo:");
  console.log(`  OSs com prescriptionData : ${c.total}`);
  console.log(`  (a) já tinha receita      : ${c.caseA_alreadyHasRx}`);
  console.log(`  (b) venda sem receita     : ${c.caseB_saleNoRx}`);
  console.log(`  (c) OS sem venda          : ${c.caseC_noSale}`);
  console.log(`  pulou (OS sem cliente)    : ${c.skipNoCustomer}`);
  console.log(`  ESCRITAS                  : ${APPLY ? c.written : 0}${APPLY ? "" : " (dry-run não escreve)"}`);
  console.log("");
  if (!APPLY) console.log("⚠️  DRY-RUN. Rode com --apply (após snapshot) para escrever.\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Erro no backfill:", e);
    process.exit(1);
  });
