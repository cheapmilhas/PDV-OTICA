/**
 * Backfill de Customer.phoneNormalized / phone2Normalized (Fase 1 — IA contexto cliente).
 *
 * Deriva a chave canônica (phoneMatchKey: DDD+8díg) do telefone CRU já gravado,
 * para o reconhecimento de cliente funcionar sobre o acervo legado (telefones
 * mascarados não casariam de outra forma).
 *
 * MODOS:
 *   dry-run (padrão) — só LÊ e reporta o que faria. Não escreve nada.
 *   apply            — escreve no banco. SÓ rodar com aprovação + snapshot Neon.
 *
 * Uso:
 *   npx tsx scripts/backfill-customer-phone-normalized.ts            # dry-run
 *   npx tsx scripts/backfill-customer-phone-normalized.ts --apply    # aplica (gated)
 *
 * SEGURANÇA / LGPD:
 *  - PULA fichas anonimizadas/deletadas (anonymizedAt/deletedAt) — não re-derivar
 *    telefone de quem pediu esquecimento.
 *  - Idempotente: só atualiza quando a chave derivada difere da gravada.
 *  - Multi-tenant: varre todas as empresas (cada chave fica na própria ficha);
 *    nunca cruza companyId (a coluna é só derivação local do telefone da ficha).
 *  - Processa em páginas p/ não carregar a tabela inteira na memória.
 */
import { prisma } from "@/lib/prisma";
import { phoneMatchKey } from "@/lib/lead-phone-match";

const APPLY = process.argv.includes("--apply");
const PAGE = 500;

async function main() {
  console.log(`\n=== BACKFILL Customer.phoneNormalized — modo: ${APPLY ? "APPLY (ESCREVE)" : "DRY-RUN (só leitura)"} ===\n`);

  let cursor: string | undefined;
  let scanned = 0;
  let toUpdate = 0;
  let written = 0;
  let withKey = 0;

  for (;;) {
    const batch = await prisma.customer.findMany({
      where: { deletedAt: null, anonymizedAt: null },
      select: { id: true, phone: true, phone2: true, phoneNormalized: true, phone2Normalized: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const c of batch) {
      scanned++;
      const k1 = phoneMatchKey(c.phone);
      const k2 = phoneMatchKey(c.phone2);
      if (k1) withKey++;
      const needs = k1 !== c.phoneNormalized || k2 !== c.phone2Normalized;
      if (!needs) continue;
      toUpdate++;
      if (APPLY) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { phoneNormalized: k1, phone2Normalized: k2 },
        });
        written++;
      }
    }
    process.stdout.write(`  ...escaneados ${scanned}\r`);
  }

  console.log(`\n\nResumo:`);
  console.log(`  clientes escaneados (ativos):     ${scanned}`);
  console.log(`  com telefone derivável (phone):   ${withKey}`);
  console.log(`  precisam atualizar a chave:        ${toUpdate}`);
  console.log(`  ${APPLY ? "ATUALIZADOS" : "atualizaria (dry-run)"}: ${APPLY ? written : toUpdate}`);
  if (!APPLY) console.log(`\n  (dry-run — nada foi escrito. Rode com --apply após snapshot Neon.)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
