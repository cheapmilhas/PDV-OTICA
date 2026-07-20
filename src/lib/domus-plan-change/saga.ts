/**
 * Máquina de estados PURA da saga de troca de plano (Domus → Vis). Sem I/O.
 *
 * Ordem Asaas-first no upgrade: cobra (BILLING_*) ANTES de liberar acesso
 * (LOCAL_APPLIED) — nunca libera tier caro com cobrança pendente. Replay de op
 * incompleta RETOMA pelo estado; nunca retorna sucesso de algo não concluído
 * (achado Codex). Idempotência por eventId (a op é buscada por eventId lá fora).
 */

export type SagaState =
  | "RECEIVED"
  | "BILLING_REQUESTED"
  | "BILLING_CONFIRMED"
  | "LOCAL_APPLIED"
  | "COMPLETED"
  | "FAILED"
  // Terminais que exigem intervenção humana (fase A). NÃO entram no caminho feliz
  // (ORDER) nem são "resume": uma op nestes estados parou de propósito.
  //  - FAILED_BEFORE_BILLING: falhou ANTES de cobrar → seguro, nada a estornar.
  //  - CHARGED_NOT_APPLIED: COBRADO mas não aplicou → dívida ao cliente, alerta.
  //  - MANUAL_REVIEW: ambíguo (ex: billing incerto) → humano decide.
  | "FAILED_BEFORE_BILLING"
  | "CHARGED_NOT_APPLIED"
  | "MANUAL_REVIEW";

/**
 * Estados terminais que NÃO são o sucesso COMPLETED: pararam e exigem humano.
 * `FAILED` (legado) entra aqui: um `FAILED` genérico não guarda ONDE falhou, então
 * retomá-lo às cegas é financeiramente inseguro (achado Codex) — e ele nem está
 * no ORDER (nextState=null). Tratado como terminal humano; as falhas retomáveis
 * de verdade preservam o checkpoint no próprio estado (BILLING_REQUESTED etc.).
 */
export const HUMAN_TERMINAL: SagaState[] = [
  "FAILED",
  "FAILED_BEFORE_BILLING",
  "CHARGED_NOT_APPLIED",
  "MANUAL_REVIEW",
];

const ORDER: SagaState[] = [
  "RECEIVED",
  "BILLING_REQUESTED",
  "BILLING_CONFIRMED",
  "LOCAL_APPLIED",
  "COMPLETED",
];

/** Próximo estado no caminho feliz. COMPLETED é terminal → null. */
export function nextState(state: SagaState): SagaState | null {
  const i = ORDER.indexOf(state);
  if (i === -1 || i === ORDER.length - 1) return null;
  return ORDER[i + 1];
}

export interface ExistingOp {
  state: SagaState | string;
  payloadHash: string;
}

export type SagaDecision =
  | { kind: "fresh" }
  | { kind: "duplicate" }
  | { kind: "conflict" }
  | { kind: "manual_review"; state: SagaState }
  | { kind: "resume"; from: SagaState };

/**
 * Decide o que fazer ao receber um plan-change com um dado eventId.
 * @param existing op já persistida com esse eventId, ou null se nova.
 * @param incomingHash hash do payload recebido agora.
 */
export function decideSagaAction(
  existing: ExistingOp | null,
  incomingHash: string,
): SagaDecision {
  if (!existing) return { kind: "fresh" };

  // Mesmo eventId com corpo diferente = replay corrompido/ambíguo → 409.
  if (existing.payloadHash !== incomingHash) return { kind: "conflict" };

  // Concluída → idempotente (200 sem reaplicar).
  if (existing.state === "COMPLETED") return { kind: "duplicate" };

  // Terminais humanos (FAILED legado, cobrado-sem-plano, revisão manual): NÃO
  // retomar por um replay do endpoint — a op parou de propósito e espera
  // intervenção. Um replay não deve reanimar uma dívida ao cliente sem humano.
  if (HUMAN_TERMINAL.includes(existing.state as SagaState)) {
    return { kind: "manual_review", state: existing.state as SagaState };
  }

  // Estados retomáveis (RECEIVED/BILLING_REQUESTED/BILLING_CONFIRMED/LOCAL_APPLIED):
  // RETOMA do checkpoint. Nunca "duplicate" de op incompleta (mascararia algo
  // que não terminou).
  return { kind: "resume", from: existing.state as SagaState };
}
