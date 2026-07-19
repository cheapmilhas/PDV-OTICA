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
  | "FAILED";

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

  // Qualquer estado não-terminal (inclusive FAILED) → RETOMA. Nunca "duplicate"
  // de op incompleta: isso mascararia uma operação que não terminou.
  return { kind: "resume", from: existing.state as SagaState };
}
