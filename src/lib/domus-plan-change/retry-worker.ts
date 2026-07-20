import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runSaga } from "./executor";
import { buildSagaDeps, claimOp } from "./deps";

/**
 * FASE E — Worker de RETRY da saga de troca de plano. Fecha a janela em que uma op
 * fica cobrada (BILLING_CONFIRMED) mas não aplicada porque o endpoint que a criou
 * morreu/falhou: sem o worker, só resolveria se o Domus reenviasse o mesmo eventId.
 *
 * PROJETO (síntese meu + Codex, achados incorporados):
 *  - findMany É SÓ UM PRÉ-FILTRO BARATO (só ids). A TRAVA real é o claimOp: um
 *    UPDATE...RETURNING atômico pelo relógio do banco que só um executor vence.
 *    Dois workers (ou worker×endpoint) podem selecionar o mesmo id; apenas um
 *    reclama (Codex confirmou a corrida coberta). Nunca confio no findMany.
 *  - ORDENAÇÃO JUSTA (achado Codex #7): `nextAttemptAt ASC NULLS FIRST, createdAt
 *    ASC`. Sem NULLS FIRST, ops com nextAttemptAt NULL (as recém-criadas/nunca
 *    agendadas) iriam pro fim e uma fila de LOCAL_APPLIED — que nunca é cortada por
 *    tentativas — poderia afamá-las indefinidamente com batch pequeno.
 *  - KILL-SWITCH STATE-AWARE (achado Codex P0, 2ª rodada): o gate NÃO é "tudo ou
 *    nada". Uma op JÁ COBRADA (BILLING_CONFIRMED/LOCAL_APPLIED) TEM que completar
 *    mesmo com VIS_TIER_SELF_SERVICE_ENABLED OFF — senão desligar o switch
 *    abandonaria clientes cobrados sem plano. MAS pré-cobrança (RECEIVED e
 *    BILLING_REQUESTED — este pode nem ter tocado o Asaas) NÃO deve avançar com o
 *    switch OFF: o operador pode tê-lo desligado JUSTAMENTE por um incidente no
 *    Asaas, e o worker cobraria no pior momento. Com OFF, o pré-filtro traz
 *    BILLING_CONFIRMED/LOCAL_APPLIED (completam) + pré-cobrança JÁ VENCIDA (só para
 *    CLASSIFICAR no terminal, SEM tocar o Asaas — uma op cobrada cuja resposta se
 *    perdeu vira MANUAL_REVIEW+alerta mesmo com o switch OFF, senão ficaria invisível
 *    durante o incidente — achado Codex P0 2ª rodada). Pré-cobrança NÃO-vencida fica
 *    parada. O executor decide o efeito por estado×expiração; o worker decide QUAIS
 *    estados sequer entram no batch conforme o switch.
 *  - BACKOFF: em `retryable_failure`, scheduleRetry agenda nextAttemptAt E LIBERA o
 *    lease no MESMO CAS (achados Codex #4/#5). Sem release, o lease preso ~90s seria
 *    o único throttle. `completed`/`terminal`/`lost_lease` NÃO agendam (o filtro de
 *    estado já barra terminais; lost_lease = outro conduz).
 *  - ISOLAMENTO DE ERRO: cada op num try/catch — um erro (ex.: banco intermitente
 *    numa op) não derruba o batch. O erro por-op é logado, não relançado.
 */

// Batch PEQUENO (achado Codex P1 operacional): cada op pode gastar até ASAAS_TIMEOUT
// (30s) no Asaas; 10×30s encostaria no teto de 300s da função. 5 dá folga. O worker
// roda com frequência (cron-job.org), então o resto do backlog cai no próximo tick.
const DEFAULT_BATCH = 5;

function selfServiceEnabled(): boolean {
  return process.env.VIS_TIER_SELF_SERVICE_ENABLED === "true";
}

export interface RetryBatchResult {
  scanned: number; // candidatos que o pré-filtro trouxe
  claimed: number; // quantos o claimOp de fato reclamou
  completed: number;
  terminal: number;
  retried: number; // retryable_failure → reagendado
  lostLease: number;
  errored: number; // exceções isoladas por-op
}

/**
 * Processa um batch de ops de troca de plano elegíveis para retry. Idempotente e
 * seguro para rodar concorrente com o endpoint e com outra instância do worker.
 */
export async function runRetryBatch(batchSize: number = DEFAULT_BATCH): Promise<RetryBatchResult> {
  const result: RetryBatchResult = {
    scanned: 0, claimed: 0, completed: 0, terminal: 0, retried: 0, lostLease: 0, errored: 0,
  };

  // KILL-SWITCH STATE-AWARE (achados Codex, 2 rodadas). Separa "executar cobrança"
  // de "classificar expiração":
  //  - ON  → todos os 4 estados retomáveis (fluxo normal, pode cobrar).
  //  - OFF → pós-cobrança (BILLING_CONFIRMED/LOCAL_APPLIED) SEMPRE (cliente cobrado
  //          TEM que receber) + pré-cobrança JÁ VENCIDA (`expiresAt<=now()`). Uma
  //          RECEIVED/BILLING_REQUESTED vencida NÃO toca o Asaas: o executor a leva
  //          direto ao terminal (RECEIVED→FAILED_BEFORE_BILLING; BILLING_REQUESTED→
  //          MANUAL_REVIEW+alerta). Sem esta lane, uma op cobrada cuja resposta se
  //          perdeu ficaria INVISÍVEL e sem alerta enquanto o switch estivesse OFF
  //          (achado Codex P0 2ª rodada). Pré-cobrança NÃO-vencida fica parada (não
  //          cobra durante um possível incidente no Asaas).
  // Duas cláusulas ESTÁTICAS (não lista parametrizada) para o planner poder casar o
  // índice parcial `retry_idx` (achado Codex: predicado parametrizado atrapalha o
  // match do índice parcial).
  const enabled = selfServiceEnabled();
  const stateClause = enabled
    ? Prisma.sql`"state" IN ('RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED')`
    : Prisma.sql`(
        "state" IN ('BILLING_CONFIRMED', 'LOCAL_APPLIED')
        OR ("state" IN ('RECEIVED', 'BILLING_REQUESTED') AND "expiresAt" <= now())
      )`;

  // PRÉ-FILTRO (só ids). Predicado alinhado ao claimOp: estado elegível, lease livre
  // (nulo/expirado) e backoff cumprido (nextAttemptAt nulo/passado). Relógio do
  // BANCO em tudo. NULLS FIRST para justiça (Codex #7). LIMIT = batch.
  const candidates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "DomusPlanChangeOp"
    WHERE ${stateClause}
      AND ("leaseUntil" IS NULL OR "leaseUntil" <= now())
      AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now())
    ORDER BY "nextAttemptAt" ASC NULLS FIRST, "createdAt" ASC
    LIMIT ${batchSize}
  `);
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  const deps = buildSagaDeps();

  for (const { id } of candidates) {
    let claimed: Awaited<ReturnType<typeof claimOp>> = null;
    try {
      // A TRAVA real: claimOp CAS atômico. null → outro reclamou entre o pré-filtro
      // e agora, ou a op virou terminal/entrou em backoff. Nada a fazer (não é erro).
      claimed = await claimOp(id);
      if (!claimed) continue;
      result.claimed += 1;

      // `now` do runSaga = relógio do banco no claim (coerência lease/backoff/expiração).
      const saga = await runSaga(claimed, deps, claimed.claimedAt);
      switch (saga.kind) {
        case "completed":
          result.completed += 1;
          break;
        case "terminal":
          // Esgotou/expirou/já-terminal. Alerta financeiro (se houve) já saiu no
          // markFinancialTerminalAndAlert dentro do runSaga.
          result.terminal += 1;
          break;
        case "lost_lease":
          // Outro executor reclamou no meio — não agenda (quem tem o lease conduz).
          result.lostLease += 1;
          break;
        case "retryable_failure": {
          // BACKOFF + RELEASE atômicos. CAS por state+leaseToken: se perdemos a
          // posse, scheduleRetry não pega. Só conto `retried` se de fato agendou
          // (achado Codex P2: não mentir a métrica com applied:false).
          const sched = await deps.scheduleRetry(claimed, saga.state);
          if (sched.applied) result.retried += 1;
          else result.lostLease += 1;
          break;
        }
      }
    } catch (err) {
      // ISOLAMENTO: um erro numa op não derruba o batch. Se já tínhamos o lease,
      // LIBERAMOS + agendamos backoff via releaseLease — CAS fenced SÓ pelo token,
      // aceitando QUALQUER estado retomável (achado Codex #catch 2ª rodada): o
      // runSaga pode ter AVANÇADO o estado no banco antes de lançar, então um
      // scheduleRetry por state=claim-time não pegaria e o lease ficaria preso ~90s
      // reaparecendo como "poison NULL" no topo do batch. O próprio release pode
      // falhar (banco fora) — engolimos; o leaseUntil expira sozinho.
      result.errored += 1;
      if (claimed) {
        try {
          await deps.releaseLease(claimed);
        } catch { /* best-effort: leaseUntil expira e o próximo tick repega */ }
      }
      logger.error("plan-change retry: erro isolado numa op", {
        window: "plan-change-retry",
        opId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
