/**
 * Backfill do guardrail de atenção (Item 1) para conversas ANTERIORES ao fix.
 *
 * PORQUÊ: antes do fix, uma reclamação/cobrança finalizava como "Não-lead" SEM
 * acender needsHumanAttention (o flag da régua era código morto). Essas conversas
 * já analisadas não são re-qualificadas (analyzedAt setado, sem needsAnalysis), então
 * o alarme nunca acenderia retroativamente. Este script acende p/ o backlog.
 *
 * LIMITAÇÃO HONESTA (best-effort): a intenção CRUA (enum) NÃO era gravada antes —
 * só o RÓTULO ("Reclamação"/"Financeiro"). Mapeamos rótulo→enum pelo dicionário de
 * labels; rótulos ambíguos/renomeados não recuperam. E `urgent` NÃO era persistido
 * na conversa: uma reclamação que a IA classificou como OUTRO/venda mas marcou
 * urgent=true é IRRECUPERÁVEL no histórico (não há sinal salvo). Portanto o backfill
 * cobre só o caso do rótulo ser Reclamação/Financeiro. Daqui p/ frente o fix cobre tudo.
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta. Não escreve.
 *   apply            — escreve. SÓ com aprovação + snapshot.
 *
 * Uso:
 *   npx tsx scripts/backfill-conversation-attention.ts            # dry-run
 *   npx tsx scripts/backfill-conversation-attention.ts --apply    # aplica (gated)
 *
 * SEGURANÇA:
 *  - Idempotente: só toca linhas needsHumanAttention=false e ainda não resolvidas.
 *  - Multi-tenant: opera por linha, companyId da própria conversa (sem filtro global perigoso).
 *  - Monotônico: só ACENDE (nunca apaga).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { intentLabel } from "../src/lib/contact-intent-label";
import { CONTACT_INTENTS, type ContactIntent } from "../src/lib/ai/lead-qualifier";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Rótulos das intenções que ACENDEM (reclamação/cobrança). Deriva do MAP p/ não
// hardcodar strings: passa cada enum pelo intentLabel e guarda o rótulo → enum.
const RED_ENUMS: ContactIntent[] = ["RECLAMACAO", "COBRANCA_FINANCEIRO"];
const LABEL_TO_ENUM = new Map<string, ContactIntent>();
for (const e of CONTACT_INTENTS) {
  const lbl = intentLabel(e)?.label;
  if (lbl) LABEL_TO_ENUM.set(lbl, e);
}

async function main() {
  console.log(`\n=== BACKFILL atenção da conversa — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  // Candidatas: analisadas, não-lead, ainda sem alarme, com rótulo de intenção salvo.
  const candidates = await prisma.whatsappConversation.findMany({
    where: {
      needsHumanAttention: false,
      attentionResolvedAt: null,
      analysisIntent: { not: null },
    },
    select: { id: true, companyId: true, analysisIntent: true, analysisIntentCode: true },
  });

  let willFlag = 0, skipped = 0;
  for (const c of candidates) {
    // Prefere a intenção CRUA se já existir (conversas pós-fix); senão mapeia do rótulo.
    const enumFromCode = c.analysisIntentCode as ContactIntent | null;
    const enumFromLabel = c.analysisIntent ? LABEL_TO_ENUM.get(c.analysisIntent) ?? null : null;
    const intent = enumFromCode ?? enumFromLabel;
    if (!intent || !RED_ENUMS.includes(intent)) { skipped++; continue; }

    willFlag++;
    if (APPLY) {
      await prisma.whatsappConversation.update({
        where: { id: c.id },
        data: {
          needsHumanAttention: true,
          // aproveita p/ preencher a intenção CRUA se faltava (recupera o enum).
          ...(enumFromCode ? {} : { analysisIntentCode: intent }),
        },
      });
    } else {
      console.log(`  [flag] conv ${c.id} (${c.companyId}) rótulo="${c.analysisIntent}" → ${intent}`);
    }
  }

  console.log(`\nResumo: ${candidates.length} candidatas | ACENDER=${willFlag} | pular=${skipped}`);
  console.log(APPLY ? "APLICADO." : "DRY-RUN — nada foi escrito. Rode com --apply p/ aplicar (após snapshot).\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
