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
  /**
   * Tentativas DO ESTADO ATUAL (Fase D), lido no claim. beginAttempt incrementa
   * ANTES de cada passo; o avanço reseta a 0. NÃO é o nº de aquisições de lease.
   */
  attemptCount: number;
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
   * CAS para um estado TERMINAL SEGURO (sem alerta): WHERE state=from AND
   * leaseToken vigente. Usado para FAILED_BEFORE_BILLING (RECEIVED expirado/
   * esgotado — nada foi cobrado). NÃO usar para terminais financeiros.
   */
  markTerminal: (op: ClaimedSagaOp, from: SagaState, terminal: SagaState, lastError: string) => Promise<CasResult>;
  /**
   * FASE D — promove a um terminal FINANCEIRO (CHARGED_NOT_APPLIED / MANUAL_REVIEW)
   * E cria o SystemEvent de alerta na MESMA transação (achado Codex): terminal
   * implica evento; se o evento falhar, a promoção reverte e a op segue retomável;
   * o dedupeKey único barra duplicata concorrente. CAS por state+leaseToken.
   */
  markFinancialTerminalAndAlert: (
    op: ClaimedSagaOp,
    from: SagaState,
    terminal: "CHARGED_NOT_APPLIED" | "MANUAL_REVIEW",
    lastError: string,
  ) => Promise<CasResult>;
  /**
   * FASE D — CONTADOR POR ESTADO (não por claim): incrementa attemptCount SÓ se a
   * op ainda está em `state` E com o leaseToken vigente. Chamado ANTES de cada
   * passo falível. O avanço de estado reseta attemptCount=0 (na transition/apply),
   * então o contador reflete tentativas DO ESTADO ATUAL — não aquisições de lease
   * (achado Codex: claim conta posse, não tentativa financeira). Retorna o novo
   * valor (0 se perdemos o lease/estado mudou).
   */
  beginAttempt: (op: ClaimedSagaOp, state: SagaState) => Promise<{ attemptCount: number }>;
}

// Estados retomáveis onde a saga ainda progride (não-terminais).
export type RetryableState = "RECEIVED" | "BILLING_REQUESTED" | "BILLING_CONFIRMED" | "LOCAL_APPLIED";
export type HumanTerminalState = "FAILED" | "FAILED_BEFORE_BILLING" | "CHARGED_NOT_APPLIED" | "MANUAL_REVIEW";

/**
 * Resultado do runSaga como UNIÃO DISCRIMINADA (achado Codex Fase D): a rota
 * decide o HTTP pelo `kind`, sem combinar flags frágeis (o `failed` antigo virava
 * 502 mesmo quando o estado era um terminal financeiro que devia ser 409).
 *  - completed: sucesso (COMPLETED). → 200
 *  - terminal: parou num terminal humano/financeiro (esgotou/expirou). → 409
 *  - retryable_failure: falhou mas retomável (checkpoint preservado). → 502
 *  - lost_lease: perdemos a posse (outro executor conduz). → 202
 */
export type SagaResult =
  | { kind: "completed"; state: "COMPLETED"; asaasRef: string | null }
  | { kind: "terminal"; state: HumanTerminalState; asaasRef: string | null; lastError?: string | null }
  | { kind: "retryable_failure"; state: RetryableState; asaasRef: string | null; lastError: string }
  | { kind: "lost_lease"; state: SagaState; asaasRef: string | null };

// Nº máximo de tentativas POR ESTADO antes de promover a terminal. Conservador:
// falhas determinísticas (preflight, validação) esgotam rápido; transitórias
// (rede) têm algumas chances. O worker (Fase E) aplica o backoff entre elas.
const MAX_ATTEMPTS_PER_STATE = 5;

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

  // Op que JÁ ENTRA terminal (COMPLETED ou humano): não processa, classifica já.
  // Na Fase C o claimOp nem reclama terminais, mas o executor é reusado (e testado)
  // com ops terminais — não pode retornar "completed" para um MANUAL_REVIEW.
  if (isTerminal(current.state)) {
    return current.state === "COMPLETED"
      ? { kind: "completed", state: "COMPLETED", asaasRef: current.asaasRef }
      : { kind: "terminal", state: current.state as HumanTerminalState, asaasRef: current.asaasRef };
  }

  while (!isTerminal(current.state)) {
    const from = current.state as RetryableState;

    // TUDO num try (achado Codex Fase D): beginAttempt/classifyAndPromote/upsert do
    // alerta podem lançar (erro de banco). Sem esta fronteira, a exceção escaparia
    // do runSaga e viraria 500 genérico em vez de retryable estruturado. (Se o
    // banco estiver TOTALMENTE fora, o recordError do catch também lança e o 500 é
    // inevitável — mas aí não há estado a preservar mesmo.)
    try {
      // EXHAUSTÃO por estado: registra a tentativa. Se este estado já esgotou o
      // limite, NÃO tenta de novo — promove pela MATRIZ. EXCEÇÃO: LOCAL_APPLIED
      // NÃO é cortado (achado Codex): o plano JÁ foi aplicado, só falta publish/
      // →COMPLETED (idempotente); cortá-lo prenderia a op no índice de ativa pra
      // sempre e estouraria o Int. Ele sempre segue tentando concluir.
      const attempt = await deps.beginAttempt(current, from);
      if (attempt.attemptCount === 0) {
        // beginAttempt não pegou (estado mudou / perdemos o lease) → resync.
        const decided = await resyncOnLostCas(current, deps);
        if (decided.kind === "adopt") { current = decided.op; continue; }
        return decided.result;
      }
      if (from !== "LOCAL_APPLIED" && attempt.attemptCount > MAX_ATTEMPTS_PER_STATE) {
        return await classifyAndPromote(current, from, deps,
          `Esgotou ${MAX_ATTEMPTS_PER_STATE} tentativas em ${from}.`);
      }

      switch (from) {
        case "RECEIVED": {
          // EXPIRAÇÃO antes de cobrar: preço/identidade congelados no fresh; se a
          // op passou de expiresAt, expira em FAILED_BEFORE_BILLING (SEGURO: nada
          // cobrado). Só ANTES de BILLING_REQUESTED — depois é ambíguo (dinheiro).
          if (current.expiresAt.getTime() <= now.getTime()) {
            const cas = await deps.markTerminal(
              current, "RECEIVED", "FAILED_BEFORE_BILLING",
              "Op expirada antes da cobrança (congelamento de preço vencido).",
            );
            if (cas.applied) {
              return { kind: "terminal", state: "FAILED_BEFORE_BILLING", asaasRef: current.asaasRef };
            }
            const decided = await resyncOnLostCas(current, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          const cas = await deps.transition(current, "RECEIVED", "BILLING_REQUESTED");
          if (!cas.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          current = { ...current, state: "BILLING_REQUESTED" };
          break;
        }
        case "BILLING_REQUESTED": {
          // FENCE antes do Asaas: valida/renova a posse. Sem posse → não cobra.
          const owns = await deps.renewLease(current);
          if (!owns.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          // confirmBilling cobra (timeout < TTL). Depois o CAS →BILLING_CONFIRMED.
          const { asaasRef } = await deps.confirmBilling(current);
          const cas = await deps.transition({ ...current, asaasRef }, "BILLING_REQUESTED", "BILLING_CONFIRMED");
          if (!cas.applied) {
            const decided = await resyncOnLostCas({ ...current, asaasRef }, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          current = { ...current, state: "BILLING_CONFIRMED", asaasRef };
          break;
        }
        case "BILLING_CONFIRMED": {
          // ATÔMICO: CAS (com token) + efeitos no mesmo commit.
          const cas = await deps.applyLocal(current);
          if (!cas.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          current = { ...current, state: "LOCAL_APPLIED" };
          break;
        }
        case "LOCAL_APPLIED": {
          // FENCE antes do publish; sem posse → não republica (o dono o fará).
          const owns = await deps.renewLease(current);
          if (!owns.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          await deps.publish(current);
          const cas = await deps.transition(current, "LOCAL_APPLIED", "COMPLETED");
          if (!cas.applied) {
            const decided = await resyncOnLostCas(current, deps);
            if (decided.kind === "adopt") { current = decided.op; continue; }
            return decided.result;
          }
          current = { ...current, state: "COMPLETED" };
          break;
        }
        default: {
          // Defensivo (achado Codex Fase D): `from` é RetryableState por tipo, mas
          // `as RetryableState` mente em runtime. Estado corrompido / futuro estado
          // do enum → falha explícita em vez de girar o loop sem avançar (laço).
          const _never: never = from;
          throw new Error(`Estado de saga não-retomável no loop: "${_never}"`);
        }
      }
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      // Preserva o CHECKPOINT: grava o erro com CAS no estado atual (não
      // sobrescreve um estado mais avançado gravado por outro executor). O
      // resultado é RETRYABLE — a promoção a terminal só ocorre ao ESGOTAR as
      // tentativas (topo do loop), nunca no 1º erro. O worker (Fase E) retoma.
      const rec = await deps.recordError(current, from, lastError);
      if (!rec.applied) {
        // recordError não pegou → perdemos o lease/estado mudou. Não é nossa
        // falha a reportar; relê e decide.
        const decided = await resyncOnLostCas(current, deps);
        if (decided.kind === "adopt") { current = decided.op; continue; }
        return decided.result;
      }
      return { kind: "retryable_failure", state: from, asaasRef: current.asaasRef, lastError };
    }
  }

  // Saiu do loop = COMPLETED (único não-terminal-humano que encerra o while).
  return { kind: "completed", state: "COMPLETED", asaasRef: current.asaasRef };
}

/**
 * MATRIZ de classificação ao ESGOTAR as tentativas de um estado (achado Codex
 * Fase D). `from` = o checkpoint onde travou. NUNCA declara seguro o que pode ter
 * cobrado, nem "cobrado sem plano" o que já aplicou:
 *  - RECEIVED           → FAILED_BEFORE_BILLING (nada tocou o Asaas). Sem alerta.
 *  - BILLING_REQUESTED  → MANUAL_REVIEW + alerta. AMBÍGUO: pode ter cobrado e a
 *                         confirmação se perdido — humano checa o Asaas. NUNCA
 *                         FAILED_BEFORE_BILLING (esconderia cobrança).
 *  - BILLING_CONFIRMED  → CHARGED_NOT_APPLIED + alerta. Cobrado, plano não aplicado.
 *  - LOCAL_APPLIED      → NÃO promove: o plano JÁ foi aplicado (subscription+company
 *                         +history no commit). Falta só publish (idempotente, o pull
 *                         do Domus cobre). Fica RETRYABLE — não é dívida ao cliente.
 */
async function classifyAndPromote(
  op: ClaimedSagaOp, from: RetryableState, deps: SagaDeps, reason: string,
): Promise<SagaResult> {
  if (from === "LOCAL_APPLIED") {
    // Não é terminal: o plano está aplicado; só o eco pendente. Retryable — o
    // worker/pull conclui. Não alerta (não há dívida).
    return { kind: "retryable_failure", state: "LOCAL_APPLIED", asaasRef: op.asaasRef, lastError: reason };
  }
  if (from === "RECEIVED") {
    const cas = await deps.markTerminal(op, "RECEIVED", "FAILED_BEFORE_BILLING", reason);
    if (cas.applied) return { kind: "terminal", state: "FAILED_BEFORE_BILLING", asaasRef: op.asaasRef, lastError: reason };
    // CAS não pegou → perdemos o lease / estado mudou. O resync classifica pelo
    // estado REAL (lost_lease / terminal / retryable). Não inventamos um resultado
    // com o estado antigo (achado Codex): um `adopt` aqui é quase inalcançável
    // (avanço por outro executor = token diferente = lost_lease), então tratamos
    // `adopt` como retryable no estado REAL adotado, não no `from` velho.
    return promoteResync(op, deps);
  }
  // BILLING_REQUESTED (ambíguo) e BILLING_CONFIRMED (cobrado) → terminal FINANCEIRO
  // com alerta atômico (D2). MANUAL_REVIEW p/ o ambíguo, CHARGED_NOT_APPLIED p/ o cobrado.
  const terminal = from === "BILLING_REQUESTED" ? "MANUAL_REVIEW" : "CHARGED_NOT_APPLIED";
  const cas = await deps.markFinancialTerminalAndAlert(op, from, terminal, reason);
  if (cas.applied) return { kind: "terminal", state: terminal, asaasRef: op.asaasRef, lastError: reason };
  return promoteResync(op, deps);
}

/** Resync após um CAS de promoção que não pegou: classifica pelo estado REAL. */
async function promoteResync(op: ClaimedSagaOp, deps: SagaDeps): Promise<SagaResult> {
  const decided = await resyncOnLostCas(op, deps);
  if (decided.kind === "adopt") {
    // Estado real avançou com o nosso token (raro): reporta retryable no estado
    // REAL adotado — não no checkpoint velho. O worker retoma dali.
    return { kind: "retryable_failure", state: decided.op.state as RetryableState, asaasRef: decided.op.asaasRef, lastError: "Estado avançou durante a promoção." };
  }
  return decided.result;
}

type ResyncDecision =
  | { kind: "adopt"; op: ClaimedSagaOp }
  | { kind: "stop"; result: SagaResult };

/**
 * Um CAS não pegou → outro executor avançou, a op mudou, OU perdemos o lease.
 * Relê e decide (regra ESTRITA):
 *  - PERDEMOS A POSSE (token real ≠ nosso) → stop lost_lease (quem tem o lease
 *    conduz; não adotamos estado nem executamos outro efeito).
 *  - avançou (rank estritamente maior) com o nosso token → adota e continua.
 *  - virou terminal → stop terminal (o loop encerraria de qualquer forma).
 *  - mesmo estado / regressão / desconhecido → stop retryable (anti-laço).
 * Nunca adota regressão (reexecutaria confirmBilling = dupla cobrança).
 */
async function resyncOnLostCas(op: ClaimedSagaOp, deps: SagaDeps): Promise<ResyncDecision> {
  const real = await deps.reloadOp(op);
  if (!real) {
    return { kind: "stop", result: { kind: "retryable_failure", state: op.state as RetryableState, asaasRef: op.asaasRef, lastError: "Op sumiu durante resync." } };
  }

  // Perdemos a posse: um novo claim substituiu nosso token.
  if (real.leaseToken !== op.leaseToken) {
    return { kind: "stop", result: { kind: "lost_lease", state: real.state, asaasRef: real.asaasRef } };
  }

  const currentRank = progressRank(op.state);
  const realRank = progressRank(real.state);

  // Avanço estrito com o nosso token → adota (state + asaasRef reais).
  if (realRank > currentRank && realRank !== -1) {
    return { kind: "adopt", op: { ...op, state: real.state, asaasRef: real.asaasRef } };
  }
  // Virou terminal humano → stop terminal.
  if (isHumanTerminal(real.state)) {
    return { kind: "stop", result: { kind: "terminal", state: real.state as HumanTerminalState, asaasRef: real.asaasRef } };
  }
  // Mesmo estado / regressão / desconhecido → stop retryable (anti-laço).
  return { kind: "stop", result: { kind: "retryable_failure", state: real.state as RetryableState, asaasRef: real.asaasRef, lastError: "Estado inesperado no resync." } };
}

/** Reexportado por conveniência (executor + saga são o mesmo domínio). */
export { nextState };
