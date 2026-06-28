/**
 * Correção pontual: data de emissão das receitas do Livro (Ajuste 1).
 *
 * O primeiro backfill (`backfill-livro-receitas.ts`, antes do fix) gravou
 * `Prescription.issuedAt = agora` (data da execução do script) em vez da data
 * real da venda/OS de origem. Este script corrige as receitas já gravadas:
 *
 *   issuedAt  = Sale.createdAt        (se a receita tem saleId)
 *             | ServiceOrder.createdAt (senão, se tem serviceOrderId)
 *   expiresAt = issuedAt + 12 meses   (recalcula a validade pela data certa)
 *
 * Receita AVULSA (sem saleId e sem serviceOrderId) é deixada como está — não
 * há origem de onde tirar a data real.
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta o que mudaria. Não escreve nada.
 *   apply            — escreve no banco. SÓ rodar com aprovação + SNAPSHOT.
 *
 * Uso:
 *   npx tsx scripts/fix-livro-receitas-issued-date.ts            # dry-run
 *   npx tsx scripts/fix-livro-receitas-issued-date.ts --apply    # aplica (gated)
 *
 * SEGURANÇA:
 *  - Idempotente: só toca receitas cuja data atual diverge da data real.
 *  - Multi-tenant: opera por todas as empresas de propósito (correção admin),
 *    sempre lendo a origem da própria receita.
 */
import { prisma } from "@/lib/prisma";
import { addMonths } from "date-fns";

const APPLY = process.argv.includes("--apply");

/** Mesma data (ignora milissegundos de diferença de gravação). */
function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

async function main() {
  console.log(
    `\n=== FIX data de emissão (Livro de Receitas) — modo: ${
      APPLY ? "APPLY (ESCREVE)" : "DRY-RUN (só leitura)"
    } ===\n`
  );

  const rxs = await prisma.prescription.findMany({
    select: {
      id: true,
      issuedAt: true,
      expiresAt: true,
      saleId: true,
      serviceOrderId: true,
      originSale: { select: { createdAt: true } },
      originServiceOrder: { select: { createdAt: true } },
    },
  });

  let total = rxs.length;
  let avulsas = 0;
  let jaCorretas = 0;
  let corrigidas = 0;

  for (const rx of rxs) {
    // Origem: venda tem prioridade; senão OS.
    const realDate = rx.originSale?.createdAt ?? rx.originServiceOrder?.createdAt ?? null;

    if (!realDate) {
      avulsas++; // sem origem → nada a fazer
      continue;
    }

    if (sameDay(rx.issuedAt, realDate)) {
      jaCorretas++;
      continue;
    }

    const newExpiresAt = addMonths(realDate, 12);
    const origem = rx.originSale ? "Venda" : "OS";
    console.log(
      `  rx ${rx.id}: ${fmt(rx.issuedAt)} → ${fmt(realDate)} (origem ${origem}); validade ${fmt(
        rx.expiresAt
      )} → ${fmt(newExpiresAt)}`
    );

    if (APPLY) {
      await prisma.prescription.update({
        where: { id: rx.id },
        data: { issuedAt: realDate, expiresAt: newExpiresAt },
      });
    }
    corrigidas++;
  }

  console.log("\nResumo:");
  console.log(`  receitas no total        : ${total}`);
  console.log(`  já com data certa        : ${jaCorretas}`);
  console.log(`  avulsas (sem origem)     : ${avulsas}`);
  console.log(`  ${APPLY ? "CORRIGIDAS" : "a corrigir"}              : ${corrigidas}`);
  console.log("");
  if (!APPLY) console.log("⚠️  DRY-RUN. Rode com --apply (após snapshot) para escrever.\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Erro no fix:", e);
    process.exit(1);
  });
