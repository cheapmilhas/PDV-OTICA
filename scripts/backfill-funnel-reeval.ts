/**
 * Backfill do bug "card preso em Novo": leads cuja ÓTICA JÁ RESPONDEU mas ficaram
 * presos porque o outbound não re-armava a régua (fix: campo needsFunnelEval).
 *
 * PORQUÊ: antes do fix, quando a ótica respondia (outbound) DEPOIS de o lead
 * nascer, o sinal shopReplied virava true mas nada re-avaliava a régua — o cron
 * pula conversas já analisadas (analyzedAt && !needsAnalysis). Resultado: o card
 * fica em "Novo" apesar de atendido. Daqui p/ frente o outbound arma needsFunnelEval;
 * este script ACENDE o flag no backlog p/ o cron reavaliar (SEM IA).
 *
 * O QUE FAZ (conservador): marca needsFunnelEval=true nas conversas que são lead,
 * já analisadas, sem re-análise pendente, e ainda sem o flag. NÃO move o card aqui
 * — quem move é o cron, passando pela régua + kill-switch + trava humana. Assim o
 * backfill não decide estágio; só re-enfileira p/ a régua (a mesma que roda em prod).
 *
 * SEGURANÇA:
 *  - Idempotente: só toca needsFunnelEval=false.
 *  - Multi-tenant: opera por linha; companyId da própria conversa (sem filtro global).
 *  - Não destrutivo: só liga um flag booleano; reversível (basta desligar).
 *  - NÃO chama IA (o cron re-avalia sem Claude).
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta.
 *   apply            — escreve (após snapshot).
 *
 * Uso:
 *   npx tsx scripts/backfill-funnel-reeval.ts            # dry-run
 *   npx tsx scripts/backfill-funnel-reeval.ts --apply    # aplica
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n=== BACKFILL re-avaliação de funil — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  // Candidatas: conversa É lead, JÁ analisada, sem re-análise pendente e sem o
  // flag ainda. Não filtra por estágio aqui — a régua decide (hold se não couber).
  const candidates = await prisma.whatsappConversation.findMany({
    where: {
      leadId: { not: null },
      analyzedAt: { not: null },
      needsAnalysis: false,
      needsFunnelEval: false,
      isGroup: false,
    },
    select: { id: true, companyId: true, leadId: true },
  });

  console.log(`Conversas-lead analisadas candidatas: ${candidates.length}`);

  // Só faz sentido re-avaliar as que estão num estágio NÃO-terminal (Novo/atend/
  // orçamento). Um card Ganho/Perdido não deve voltar. Filtra pelo estágio do lead.
  let willFlag = 0, skippedTerminal = 0, skippedNoLead = 0;
  const perCompany: Record<string, number> = {};

  for (const c of candidates) {
    const lead = await prisma.lead.findFirst({
      where: { id: c.leadId!, companyId: c.companyId, deletedAt: null },
      select: { stage: { select: { isWon: true, isLost: true, name: true } }, intent: true },
    });
    if (!lead) { skippedNoLead++; continue; }
    if (lead.stage.isWon || lead.stage.isLost) { skippedTerminal++; continue; }

    willFlag++;
    perCompany[c.companyId] = (perCompany[c.companyId] ?? 0) + 1;
    if (APPLY) {
      await prisma.whatsappConversation.update({
        where: { id: c.id },
        data: { needsFunnelEval: true },
      });
    } else {
      console.log(`  [flag] conv ${c.id.slice(0, 8)} (co ${c.companyId.slice(0, 8)}) estágio="${lead.stage.name}" intent=${lead.intent ?? "—"}`);
    }
  }

  console.log(`\nResumo:`);
  console.log(`  ACENDER needsFunnelEval = ${willFlag}`);
  console.log(`  pular (card terminal Ganho/Perdido) = ${skippedTerminal}`);
  console.log(`  pular (lead ausente) = ${skippedNoLead}`);
  console.log(`  por empresa:`, perCompany);
  console.log(APPLY
    ? "\nAPLICADO. O cron re-avaliará essas conversas (só régua, sem IA) no próximo ciclo."
    : "\nDRY-RUN — nada escrito. Rode com --apply após snapshot.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
