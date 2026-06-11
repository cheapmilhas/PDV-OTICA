/**
 * RECONCILIAÇÃO dos pagamentos de Conta a Pagar legados (pré-C1) cujo lançamento
 * ficou com financeAccountId NULO — então o saldo da conta nunca foi debitado.
 *
 * Por padrão roda em DRY-RUN (não escreve nada). Para aplicar de verdade:
 *   npx tsx scripts/reconcile-pagamentos-orfaos.ts --apply
 *
 * Dry-run (padrão):
 *   npx tsx scripts/reconcile-pagamentos-orfaos.ts
 *
 * SALVAGUARDAS (combinadas com o dono em 2026-06-11):
 *  - PULA qualquer órfão cujo débito deixaria o saldo NEGATIVO (dado de teste /
 *    dinheiro que nunca esteve no caixa — reconciliar criaria saldo irreal).
 *  - Só reconcilia empresas em ONLY_COMPANIES (allowlist). Vazio = todas as que
 *    não ficam negativas. Use p/ restringir a uma empresa específica.
 *
 * O que faz por órfão (no --apply, dentro de uma transação):
 *   1. Escolhe a conta de saída da empresa: CASH default → CASH → default → 1ª ativa.
 *   2. Debita o saldo dessa conta no valor do pagamento (decrement).
 *   3. Preenche o financeAccountId do lançamento (deixa o dado consistente com o
 *      fluxo atual, que sempre grava a conta de saída).
 *
 * Idempotente: se o lançamento já tiver financeAccountId, é pulado.
 */
import { prisma } from "../src/lib/prisma";
import { Prisma } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

// Allowlist de empresas a reconciliar. Vazio = todas (exceto as que ficariam
// negativas, sempre puladas). O dono decidiu reconciliar SÓ a cmlx4fkjt
// (aluguel R$100); a cmn8ww0mf (saldo R$0, ficaria negativo) fica de fora.
const ONLY_COMPANIES: string[] = ["cmlx4fkjt000092bq1n7rm63g"];

type Orfao = {
  id: string;
  companyId: string;
  amount: Prisma.Decimal;
  entryDate: Date;
  description: string | null;
};

// Escolhe a conta de saída mais provável: caixa físico, depois a default.
async function escolherConta(companyId: string) {
  const contas = await prisma.financeAccount.findMany({
    where: { companyId, active: true },
    select: { id: true, name: true, type: true, isDefault: true, balance: true },
  });
  if (contas.length === 0) return null;
  return (
    contas.find((c) => c.type === "CASH" && c.isDefault) ??
    contas.find((c) => c.type === "CASH") ??
    contas.find((c) => c.isDefault) ??
    contas[0]
  );
}

async function main() {
  console.log(`\n=== RECONCILIAÇÃO DE PAGAMENTOS ÓRFÃOS ===`);
  console.log(APPLY ? "MODO: 🔴 APPLY (vai gravar)\n" : "MODO: 🟢 DRY-RUN (só simula, não grava)\n");

  const orfaos = (await prisma.financeEntry.findMany({
    where: {
      sourceType: "AccountPayable",
      type: "EXPENSE",
      side: "DEBIT",
      financeAccountId: null,
    },
    select: { id: true, companyId: true, amount: true, entryDate: true, description: true },
    orderBy: { entryDate: "asc" },
  })) as Orfao[];

  if (orfaos.length === 0) {
    console.log("✅ Nada a reconciliar.\n");
    return;
  }

  let aplicados = 0;
  let pulados = 0;

  for (const e of orfaos) {
    const valor = Number(e.amount).toFixed(2);

    // Guarda 1: allowlist de empresas.
    if (ONLY_COMPANIES.length > 0 && !ONLY_COMPANIES.includes(e.companyId)) {
      console.log(`⏭️  PULADO (empresa fora da allowlist ${e.companyId}) — ${e.description} R$ ${valor}`);
      pulados++;
      continue;
    }

    const conta = await escolherConta(e.companyId);

    if (!conta) {
      console.log(`⚠️  PULADO (sem conta ativa na empresa ${e.companyId}) — ${e.description} R$ ${valor}`);
      pulados++;
      continue;
    }

    const saldoAtual = Number(conta.balance);
    const saldoNovo = saldoAtual - Number(e.amount);

    console.log(`• ${e.description ?? "Pagamento"}  R$ ${valor}  (${e.entryDate.toISOString().slice(0, 10)})`);
    console.log(`    empresa: ${e.companyId}`);
    console.log(`    conta de saída: "${conta.name}" (${conta.type}${conta.isDefault ? ", default" : ""})`);
    console.log(`    saldo: R$ ${saldoAtual.toFixed(2)} → R$ ${saldoNovo.toFixed(2)}`);

    // Guarda 2: nunca deixar o saldo negativo (dado irreal/teste).
    if (saldoNovo < 0) {
      console.log(`    ⛔ PULADO — débito deixaria o saldo NEGATIVO. Não reconciliado.`);
      pulados++;
      console.log("");
      continue;
    }

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        // Re-checa idempotência dentro da transação (não pisar em correção concorrente).
        const atual = await tx.financeEntry.findUnique({
          where: { id: e.id },
          select: { financeAccountId: true },
        });
        if (atual?.financeAccountId) {
          console.log(`    ↪︎ já reconciliado por outra execução — pulado.`);
          pulados++;
          return;
        }
        await tx.financeAccount.update({
          where: { id: conta.id },
          data: { balance: { decrement: e.amount } },
        });
        await tx.financeEntry.update({
          where: { id: e.id },
          data: { financeAccountId: conta.id },
        });
        console.log(`    ✅ aplicado.`);
        aplicados++;
      });
    }
    console.log("");
  }

  console.log(`────────────────────────────────────────────────────────`);
  if (APPLY) {
    console.log(`Aplicados: ${aplicados} | Pulados: ${pulados} | Total órfãos: ${orfaos.length}`);
    console.log(`Rode novamente o diagnóstico para confirmar zero órfãos:`);
    console.log(`  npx tsx scripts/diag-pagamentos-orfaos.ts\n`);
  } else {
    console.log(`DRY-RUN: ${orfaos.length} pagamento(s) seriam reconciliados.`);
    console.log(`Para aplicar de verdade:`);
    console.log(`  npx tsx scripts/reconcile-pagamentos-orfaos.ts --apply\n`);
  }
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
