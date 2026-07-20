import { nextState, progressRank, isHumanTerminal, type SagaState } from "./saga";

/**
 * Executor da saga de troca de plano. Ordem Asaas-first: cobra (confirmBilling)
 * ANTES de aplicar acesso local (applyLocal) — se a cobrança falha, NÃO libera
 * o tier (invariante: nunca acesso caro sem pagar). Ver saga.ts para a máquina.
 *
 * FASE B — monotonia por CAS (compare-and-set):
 * Nenhuma transição é incondicional. Cada passo faz um CAS `WHERE id AND
 * state=<esperado>`; se afeta 0 linhas, o executor NÃO age às cegas — relê o
 * estado real e decide (já avançou = no-op; COMPLETED = sucesso idempotente;
 * outro = conflito → para). Isso mata a regressão COMPLETED→BILLING_CONFIRMED
 * por um executor atrasado (o `saveState` incondicional antigo permitia isso).
 *
 * applyLocal é ATÔMICO com o próprio checkpoint: o CAS BILLING_CONFIRMED→
 * LOCAL_APPLIED e os efeitos (subscription/company/history/audit) vivem na MESMA
 * transação (ver deps.applyLocal). Crash no meio não deixa efeito pela metade
 * nem duplica history/audit numa retomada.
 *
 * O leaseToken (posse compartilhada endpoint×worker) NÃO entra no CAS ainda —
 * é NULL em toda op hoje, e o claim é a Fase C. A Fase B serializa por
 * (id, estado esperado); a Fase C acrescenta o token ao predicado.
 */

export interface SagaOp {
  id: string;
  eventId: string;
  visCompanyId: string;
  requestedTier: string;
  targetPlanId: string | null;
  state: SagaState;
  asaasRef: string | null;
  /** Validade do congelamento (preço/identidade). Checada ANTES de cobrar. */
  expiresAt: Date;
}

/**
 * Op RECLAMADA (Fase C): tem o `leaseToken` vigente (posse). É o ÚNICO tipo que
 * o executor processa — só `claimOp` produz uma. O token entra no predicado de
 * TODA gravação (fencing): um executor que perdeu o lease (outro re-claimou, novo
 * token) não avança a op nem executa efeitos. Tipo explícito (não `leaseToken?`)
 * força o compilador a exigir posse em toda operação mutante (achado Codex).
 */
export interface ClaimedSagaOp extends SagaOp {
  leaseToken: string;
  /**
   * Instante do RELÓGIO DO BANCO no momento do claim (RETURNING now()). Usado como
   * `now` do runSaga para a comparação de expiração — mesmo relógio do lease/
   * backoff, sem clock-skew entre processo e banco (achado Codex Fase C).
   */
  claimedAt: Date;
}

/** Resultado de um CAS de transição. */
export interface CasResult {
  /** true se o CAS afetou a linha (estava no estado esperado E com o token vigente). */
  applied: boolean;
}

export interface SagaDeps {
  /**
   * VALIDA/renova a posse (lease) da op ANTES de um efeito externo (Asaas/publish):
   * estende leaseUntil SÓ se o leaseToken ainda é o vigente e o estado é retomável.
   * Retorna {applied:false} se perdemos o lease (outro re-claimou) — o executor
   * NÃO deve executar o efeito nesse caso. Fecha a janela entre claim e I/O.
   */
  renewLease: (op: ClaimedSagaOp) => Promise<CasResult>;
  /**
   * Cobra no Asaas usando a IDENTIDADE PERSISTIDA na op (subscriptionId/
   * asaasSubscriptionId fixados no fresh), com preflight de que a assinatura
   * ainda casa. Idempotente por asaas-idempotency-key derivada do eventId.
   * Timeout no fetch (< TTL do lease). Retorna a referência real do Asaas. Lança.
   */
  confirmBilling: (op: ClaimedSagaOp) => Promise<{ asaasRef: string }>;
  /**
   * ATÔMICO: numa única transação, faz o CAS BILLING_CONFIRMED→LOCAL_APPLIED
   * (WHERE id+state+leaseToken) como PRIMEIRA escrita e, só se o CAS pegou,
   * aplica os efeitos no mesmo commit. Retorna {applied:false} se o CAS não pegou
   * (op já avançou/mudou OU perdemos o lease) — nesse caso NENHUM efeito rodou.
   */
  applyLocal: (op: ClaimedSagaOp) => Promise<CasResult>;
  /** Publica o entitlement v2 de volta pro Domus (após commit; fire-and-forget). */
  publish: (op: ClaimedSagaOp) => Promise<void>;
  /**
   * CAS de transição SEM efeito colateral de negócio. Grava o novo estado (+
   * campos) SÓ se a op ainda está em `from` E com o leaseToken vigente. Retorna
   * se pegou. NÃO exige leaseUntil>now: o fencing é a SUBSTITUIÇÃO do token por um
   * novo claim, não o prazo (Codex) — um token não substituído ainda pode concluir.
   */
  transition: (op: ClaimedSagaOp, from: SagaState, to: SagaState) => Promise<CasResult>;
  /**
   * Grava lastError SÓ se a op ainda está em `from` E com o leaseToken vigente;
   * nunca altera state. Retorna applied: distingue "erro registrado" de "perdi o
   * lease" (achado Codex) — se perdi, o erro não sobrescreve o diagnóstico de quem
   * tem a posse.
   */
  recordError: (op: ClaimedSagaOp, from: SagaState, lastError: string) => Promise<CasResult>;
  /**
   * Relê estado + asaasRef + leaseToken atuais da op (para decidir quando um CAS
   * não pega). Traz o leaseToken: no resync, token real ≠ o meu = perdi a posse →
   * paro sem adotar estado nem executar efeito (achado Codex Fase C).
   */
  reloadOp: (op: SagaOp) => Promise<{ state: SagaState; asaasRef: string | null; leaseToken: string | null } | null>;
  /**
   * CAS para um estado TERMINAL (WHERE state=from AND leaseToken vigente). Usado
   * para expiração antes de cobrar (RECEIVED expirada → FAILED_BEFORE_BILLING).
   */
  markTerminal: (op: ClaimedSagaOp, from: SagaState, terminal: SagaState, lastError: string) => Promise<CasResult>;
}

export interface SagaResult {
  /** O CHECKPOINT onde parou. Terminal humano/COMPLETED = fim; senão retomável. */
  state: SagaState;
  asaasRef: string | null;
  /** true se um passo lançou. O checkpoint (`state`) diz onde retomar. */
  failed?: boolean;
  lastError?: string | null;
}

// Estados em que a saga NÃO avança: o sucesso (COMPLETED) e os terminais humanos
// (pararam de propósito, esperam intervenção). runSaga não deve processá-los.
// FAILED (legado) incluído: sem checkpoint recuperável, retomar às cegas é inseguro.
const TERMINAL: SagaState[] = [
  "COMPLETED",
  "FAILED",
  "FAILED_BEFORE_BILLING",
  "CHARGED_NOT_APPLIED",
  "MANUAL_REVIEW",
];

function isTerminal(state: SagaState): boolean {
  return TERMINAL.includes(state);
}

/**
 * Executa (ou retoma) a saga a partir do estado atual da op até COMPLETED.
 *
 * Cada passo é um CAS: só avança se a op ainda está no estado esperado. Quando o
 * CAS NÃO pega (outro executor avançou, ou a op mudou por baixo), o executor relê
 * o estado real e para — nunca reaplica cegamente. Falha real (exceção) preserva
 * o checkpoint via recordError (CAS no estado atual) e retorna failed=true.
 *
 * confirmBilling DEVE ser idempotente no Asaas (asaas-idempotency-key derivada de
 * eventId): a retomada de BILLING_REQUESTED o chama de novo, e sem chave não
 * dobraria a cobrança. applyLocal é atômico (CAS+efeitos no mesmo commit).
 */
export async function runSaga(op: ClaimedSagaOp, deps: SagaDeps, now: Date = new Date()): Promise<SagaResult> {
  let current: ClaimedSagaOp = { ...op };

  while (!isTerminal(current.state)) {
    const from = current.state;
    try {
      switch (from) {
        case "RECEIVED": {
          // EXPIRAÇÃO antes de cobrar (achado Codex #3): o preço/identidade
          // foram congelados no fresh; se a op ficou parada além de expiresAt,
          // o preço pode estar velho. Expira em FAILED_BEFORE_BILLING (SEGURO:
          // nada foi cobrado). Só expira ANTES de BILLING_REQUESTED — depois de
          // tocar o Asaas, expirar às cegas seria ambíguo (dinheiro em jogo).
          if (current.expiresAt.getTime() <= now.getTime()) {
            const cas = await deps.markTerminal(
              current,
              "RECEIVED",
              "FAILED_BEFORE_BILLING",
              "Op expirada antes da cobrança (congelamento de preço vencido).",
            );
            if (cas.applied) return { state: "FAILED_BEFORE_BILLING", asaasRef: current.asaasRef };
            const decided = await resyncOnLostCas(current, deps);
            if (decided) { current = decided; continue; }
            return stopHere(current);
          }
          const cas = await deps.transition(current, "RECEIVED", "BILLING_REQUESTED");
          if (!cas.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided) { current = decided; continue; }
            return stopHere(current);
          }
          current = { ...current, state: "BILLING_REQUESTED" };
          break;
        }
        case "BILLING_REQUESTED": {
          // FENCE antes do Asaas (achado Codex Fase C): valida/renova a posse. Se
          // perdemos o lease (outro re-claimou), NÃO cobra — para. Reduz a janela
          // em que um executor sem posse dispara um PUT no Asaas.
          const owns = await deps.renewLease(current);
          if (!owns.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided) { current = decided; continue; }
            return stopHere(current);
          }
          // confirmBilling cobra (com timeout < TTL). Depois o CAS
          // BILLING_REQUESTED→BILLING_CONFIRMED (fencing por token).
          const { asaasRef } = await deps.confirmBilling(current);
          const cas = await deps.transition(
            { ...current, asaasRef },
            "BILLING_REQUESTED",
            "BILLING_CONFIRMED",
          );
          if (!cas.applied) {
            const decided = await resyncOnLostCas({ ...current, asaasRef }, deps);
            if (decided) { current = decided; continue; }
            return stopHere({ ...current, asaasRef });
          }
          current = { ...current, state: "BILLING_CONFIRMED", asaasRef };
          break;
        }
        case "BILLING_CONFIRMED": {
          // ATÔMICO: CAS (com token) + efeitos no mesmo commit. applied=false → op
          // já avançou/mudou OU perdemos o lease; relê e decide, sem reaplicar.
          const cas = await deps.applyLocal(current);
          if (!cas.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided) { current = decided; continue; }
            return stopHere(current);
          }
          current = { ...current, state: "LOCAL_APPLIED" };
          break;
        }
        case "LOCAL_APPLIED": {
          // FENCE antes do publish: se perdemos o lease, não republica (o dono do
          // lease o fará). publish é fire-and-forget (efeitos já commitados).
          const owns = await deps.renewLease(current);
          if (!owns.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided) { current = decided; continue; }
            return stopHere(current);
          }
          await deps.publish(current);
          const cas = await deps.transition(current, "LOCAL_APPLIED", "COMPLETED");
          if (!cas.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided) { current = decided; continue; }
            return stopHere(current);
          }
          current = { ...current, state: "COMPLETED" };
          break;
        }
        default: {
          // Estado inválido/corrompido (fora do enum) — falha explícita em vez
          // de girar o loop sem avançar (achado Codex: sem isto, loop infinito).
          throw new Error(`Estado de saga inválido: "${from}"`);
        }
      }
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      // Preserva o CHECKPOINT: grava só o erro, com CAS no estado atual (não
      // sobrescreve um estado mais avançado que outro executor tenha gravado).
      await deps.recordError(current, from, lastError);
      return { state: from, asaasRef: current.asaasRef, failed: true, lastError };
    }
  }

  return { state: current.state, asaasRef: current.asaasRef };
}

/**
 * Um CAS não pegou → outro executor avançou a op, mudou por baixo, OU nós perdemos
 * o lease (outro re-claimou, novo token). Relê a op e decide, com regra ESTRITA:
 *  - PERDEMOS A POSSE (token real ≠ o nosso): PARA imediatamente (achado Codex
 *    Fase C) — não adota estado nem deixa o loop executar outro efeito. "Perdi a
 *    autoridade" ≠ "alguém avançou".
 *  - avançou no caminho feliz (rank estritamente maior) COM o nosso token → adota.
 *  - virou terminal humano → adota; o loop encerra.
 *  - MESMO estado, regressão, ou desconhecido → PARA (anti-laço e anti-regressão).
 * Nunca adota regressão (reexecutaria confirmBilling = dupla cobrança). Nunca
 * reexecuta o efeito perdido.
 */
async function resyncOnLostCas(op: ClaimedSagaOp, deps: SagaDeps): Promise<ClaimedSagaOp | null> {
  const real = await deps.reloadOp(op);
  if (!real) return null;

  // Perdemos a posse: um novo claim substituiu nosso token. Paramos AQUI — quem
  // tem o lease conduz. Não adotamos estado nem seguimos pro próximo efeito.
  if (real.leaseToken !== op.leaseToken) return null;

  const currentRank = progressRank(op.state);
  const realRank = progressRank(real.state);

  // Avanço estrito no caminho feliz, ainda com o nosso token → adota.
  if (realRank > currentRank && realRank !== -1) {
    return { ...op, state: real.state, asaasRef: real.asaasRef };
  }
  // Virou terminal humano (não está no ORDER) → adota; o loop encerra em isTerminal.
  if (isHumanTerminal(real.state)) {
    return { ...op, state: real.state, asaasRef: real.asaasRef };
  }
  // Mesmo estado / regressão / desconhecido → PARA (anti-laço e anti-regressão).
  return null;
}

/** Encerra retornando o checkpoint atual sem marcar failed (parada limpa). */
function stopHere(op: ClaimedSagaOp): SagaResult {
  return { state: op.state, asaasRef: op.asaasRef };
}

/** Reexportado por conveniência (executor + saga são o mesmo domínio). */
export { nextState };
