/**
 * Script de TESTE — cria UMA Invoice de R$5,00 (total=500) para validar o botão
 * "Enviar cobrança" da Fase A.
 *
 * POR QUE EXISTE
 * O `ensureInvoiceCharge` cobra `invoice.total / 100` CEGAMENTE. Para o teste do
 * botão "Enviar cobrança" ser barato e seguro, precisamos de uma Invoice com
 * `total = 500` (R$5,00), SEM `paymentUrl` (para o motor gerar a cobrança),
 * ligada à subscription ativa da empresa indicada.
 *
 * SEGURANÇA FINANCEIRA (decisões hard-coded de propósito):
 *   - `total = 500` é HARD-CODED. NUNCA derivado de `plan.*` — um plano errado
 *     (ex.: R$149,90) cobraria valor real do cartão de teste. Há uma ASSERÇÃO
 *     pós-create que relê a fatura e falha se `total !== 500`.
 *   - PRÉ-CONDIÇÃO: a subscription NÃO pode ter `asaasSubscriptionId`. Se tiver,
 *     o `ensureInvoiceCharge` faria SYNC da recorrente do Asaas e IGNORARIA os
 *     R$5 — o teste seria inválido. A Fase A não cria recorrente, então deve ser
 *     null; o script ABORTA caso contrário.
 *
 * IDEMPOTÊNCIA
 *   Procura por uma fatura de teste já existente (mesma subscription +
 *   description "TESTE R$5 — Fase A"). Se achar, NÃO cria outra — um retry não
 *   pode gerar uma 2ª fatura (→ 2ª cobrança).
 *
 * DRY-RUN POR PADRÃO
 *   Sem `--apply`, só imprime o que criaria e NÃO consome número de fatura
 *   (`nextSaasInvoiceNumber` incrementa um contador global — só é chamado no
 *   `--apply`).
 *
 * USO:
 *   # dry-run (não cria nada):
 *   npx tsx scripts/criar-fatura-teste-r5.ts --company=<companyId>
 *   # aplicar de verdade:
 *   npx tsx scripts/criar-fatura-teste-r5.ts --company=<companyId> --apply
 */
import { PrismaClient } from "@prisma/client";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";

const prisma = new PrismaClient();

const DESCRIPTION = "TESTE R$5 — Fase A";
const TOTAL_CENTAVOS = 500; // R$5,00 — HARD-CODED, nunca de plan.*

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const companyId = getArg("company");
  const apply = process.argv.includes("--apply");

  if (!companyId) {
    console.error("❌ use --company=<companyId>");
    process.exit(1);
  }

  // 1. Resolve a subscription ativa mais recente da empresa
  const sub = await prisma.subscription.findFirst({
    where: { companyId, status: { not: "CANCELED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) {
    console.error("❌ Empresa sem subscription ativa");
    process.exit(1);
  }

  // 2. PRÉ-CONDIÇÃO CRÍTICA — sub não pode ser recorrente no Asaas
  if (sub.asaasSubscriptionId != null) {
    console.error(
      "❌ ABORTADO: sub tem asaasSubscriptionId — ensureInvoiceCharge faria SYNC e ignoraria os R$5. Teste inválido."
    );
    process.exit(1);
  }

  // 3. IDEMPOTÊNCIA — não cria 2ª fatura de teste (→ não gera 2ª cobrança)
  const existing = await prisma.invoice.findFirst({
    where: { subscriptionId: sub.id, description: DESCRIPTION },
  });
  if (existing) {
    console.log(`Fatura de teste já existe: ${existing.id} (total=${existing.total})`);
    return;
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86_400_000);

  // 4. DRY-RUN — NÃO chama nextSaasInvoiceNumber (incrementa contador global!)
  if (!apply) {
    console.log("🔍 DRY-RUN (sem --apply) — nada será criado:");
    console.log(`   subscriptionId: ${sub.id}`);
    console.log(`   total:          ${TOTAL_CENTAVOS}  (R$5,00)`);
    console.log(`   periodStart:    ${now.toISOString()}`);
    console.log(`   periodEnd:      ${periodEnd.toISOString()}`);
    console.log(`   status:         PENDING`);
    console.log(`   billingType:    PIX`);
    console.log(`   description:    ${DESCRIPTION}`);
    console.log("\nRode de novo com --apply para criar de verdade.");
    return;
  }

  // 5. APPLY — só aqui consome um número de fatura
  const number = await nextSaasInvoiceNumber(prisma);

  const inv = await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      number,
      subtotal: TOTAL_CENTAVOS,
      total: TOTAL_CENTAVOS, // R$5,00 — HARD-CODED, nunca de plan.*
      discount: 0,
      periodStart: now,
      periodEnd,
      status: "PENDING",
      billingType: "PIX",
      dueDate: null, // ensureInvoiceCharge calcula hoje+3; null tira do cron invoice-reminders
      description: DESCRIPTION,
      // paymentUrl fica null (default) p/ ensureInvoiceCharge gerar a cobrança
    },
  });

  // ASSERÇÃO — relê e garante que o valor cobrado será R$5,00
  const check = await prisma.invoice.findUnique({
    where: { id: inv.id },
    select: { total: true },
  });
  if (!check || check.total !== TOTAL_CENTAVOS) {
    throw new Error("ASSERÇÃO FALHOU: total != 500");
  }

  console.log(`OK fatura criada: ${inv.id} number=${number} total=${TOTAL_CENTAVOS}`);
}

main()
  .catch((e) => {
    console.error("\n❌ ERRO:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
