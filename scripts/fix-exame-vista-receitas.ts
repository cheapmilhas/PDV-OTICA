/**
 * Correção: produto "EXAME DE VISTA" não gerava receita no Livro.
 *
 * Causa: os produtos de exame estavam com `isEyeExam = false`, então o gatilho
 * `createPrescriptionFromSale` (lente OU isEyeExam) nunca disparava para eles.
 *
 * Este script:
 *   1) Marca `isEyeExam = true` nos produtos de exame informados → vendas
 *      FUTURAS de exame passam a gerar receita automaticamente.
 *   2) Backfill: para cada venda COMPLETED com esses produtos e SEM receita,
 *      chama o próprio `createPrescriptionFromSale` (idempotente, upsert por
 *      saleId; issuedAt = Sale.createdAt já embutido no service).
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta. Não escreve nada.
 *   apply            — escreve no banco. SÓ rodar com aprovação + SNAPSHOT.
 *
 * Uso:
 *   npx tsx scripts/fix-exame-vista-receitas.ts            # dry-run
 *   npx tsx scripts/fix-exame-vista-receitas.ts --apply    # aplica (gated)
 */
import { prisma } from "@/lib/prisma";
import { createPrescriptionFromSale } from "@/services/prescription-from-sale.service";

const APPLY = process.argv.includes("--apply");

// Produtos de exame de vista (ambas as óticas). Confirmados por SKU EXMVISTA / EX-VISTA.
const EXAM_PRODUCT_IDS = ["cmq6mwjx100018pgugef5nxcz", "cmquz8spw000suihd11o796w1"];

async function main() {
  console.log(
    `\n=== FIX exame de vista → receita — modo: ${
      APPLY ? "APPLY (ESCREVE)" : "DRY-RUN (só leitura)"
    } ===\n`
  );

  // 1) Marcar isEyeExam=true nos produtos de exame.
  const prods = await prisma.product.findMany({
    where: { id: { in: EXAM_PRODUCT_IDS } },
    select: { id: true, name: true, sku: true, isEyeExam: true },
  });
  console.log("Produtos de exame:");
  for (const p of prods) {
    const willChange = !p.isEyeExam;
    console.log(`  ${p.sku} (${p.name}): isEyeExam ${p.isEyeExam} ${willChange ? "→ true" : "(já true)"}`);
  }
  if (APPLY) {
    await prisma.product.updateMany({
      where: { id: { in: EXAM_PRODUCT_IDS } },
      data: { isEyeExam: true },
    });
  }

  // 2) Backfill das vendas COMPLETED com exame e sem receita.
  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      items: { some: { productId: { in: EXAM_PRODUCT_IDS } } },
      originPrescriptions: { none: {} },
    },
    select: {
      id: true,
      companyId: true,
      customerId: true,
      sellerUserId: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nVendas de exame SEM receita: ${sales.length}`);
  let criadas = 0;
  let semCliente = 0;
  for (const s of sales) {
    if (!s.customerId) {
      semCliente++;
      console.log(`  ${s.id} (${s.customer?.name ?? "sem cliente"}): PULA — venda sem cliente`);
      continue;
    }
    console.log(
      `  ${s.id} (${s.customer?.name}, ${s.createdAt.toISOString().slice(0, 10)}) → cria receita`
    );
    if (APPLY) {
      const r = await createPrescriptionFromSale(s.id, s.companyId, s.sellerUserId);
      if (r.created) criadas++;
    }
  }

  console.log("\nResumo:");
  console.log(`  produtos marcados isEyeExam : ${APPLY ? prods.filter((p) => !p.isEyeExam).length : 0}`);
  console.log(`  vendas de exame sem receita : ${sales.length}`);
  console.log(`  pulou (venda sem cliente)   : ${semCliente}`);
  console.log(`  receitas CRIADAS            : ${APPLY ? criadas : 0}${APPLY ? "" : " (dry-run não escreve)"}`);
  console.log("");
  if (!APPLY) console.log("⚠️  DRY-RUN. Rode com --apply (após snapshot) para escrever.\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Erro no fix:", e);
    process.exit(1);
  });
