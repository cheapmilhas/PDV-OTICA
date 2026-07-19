import { nextState, type SagaState } from "./saga";

/**
 * Executor da saga de troca de plano. Ordem Asaas-first: cobra (confirmBilling)
 * ANTES de aplicar acesso local (applyLocal) — se a cobrança falha, NÃO libera
 * o tier (invariante: nunca acesso caro sem pagar). Persiste o estado APÓS cada
 * passo (saveState) para retomada após crash. As dependências são injetadas
 * (testável sem I/O real). Ver saga.ts para a máquina de estados.
 */

export interface SagaOp {
  id: string;
  eventId: string;
  visCompanyId: string;
  requestedTier: string;
  targetPlanId: string | null;
  state: SagaState;
  asaasRef: string | null;
}

export interface SagaDeps {
  /** Cobra no Asaas. Retorna a referência da operação. Lança em falha. */
  confirmBilling: (op: SagaOp) => Promise<{ asaasRef: string }>;
  /** Aplica a troca de plano local (Subscription.planId, limites, cache). */
  applyLocal: (op: SagaOp) => Promise<void>;
  /** Publica o entitlement v2 de volta pro Domus. */
  publish: (op: SagaOp) => Promise<void>;
  /** Persiste o estado da op (idempotente por op.id). */
  saveState: (op: SagaOp & { lastError?: string | null }) => Promise<void>;
}

export interface SagaResult {
  /** O CHECKPOINT onde parou (não some pra "FAILED" — retomar continua daqui). */
  state: SagaState;
  asaasRef: string | null;
  /** true se um passo lançou. O checkpoint (`state`) diz onde retomar. */
  failed?: boolean;
  lastError?: string | null;
}

const TERMINAL: SagaState[] = ["COMPLETED"];

/**
 * Executa (ou retoma) a saga a partir do estado atual da op até COMPLETED.
 * Cada passo avança um estado e persiste ANTES de agir (checkpoint). Falha em
 * qualquer passo NÃO some pra "FAILED": preserva o checkpoint (onde parou) e
 * marca `failed` + grava `lastError` — retomar (rodar de novo do checkpoint)
 * continua de onde parou, sem repetir passos já concluídos.
 *
 * `confirmBilling` DEVE ser idempotente no Asaas (idempotencyKey derivada de
 * eventId/op.id): a retomada de BILLING_REQUESTED o chama de novo, e sem chave
 * idempotente isso dobraria a cobrança. O wiring é responsável por essa chave.
 */
export async function runSaga(op: SagaOp, deps: SagaDeps): Promise<SagaResult> {
  let current: SagaOp = { ...op };

  while (!TERMINAL.includes(current.state)) {
    try {
      switch (current.state) {
        case "RECEIVED": {
          // Persiste BILLING_REQUESTED ANTES de cobrar: se crashar durante a
          // cobrança, a retomada sabe que estava no passo de cobrança.
          current = { ...current, state: "BILLING_REQUESTED" };
          await deps.saveState(current);
          break;
        }
        case "BILLING_REQUESTED": {
          const { asaasRef } = await deps.confirmBilling(current);
          current = { ...current, state: "BILLING_CONFIRMED", asaasRef };
          await deps.saveState(current);
          break;
        }
        case "BILLING_CONFIRMED": {
          await deps.applyLocal(current);
          current = { ...current, state: "LOCAL_APPLIED" };
          await deps.saveState(current);
          break;
        }
        case "LOCAL_APPLIED": {
          await deps.publish(current);
          current = { ...current, state: "COMPLETED" };
          await deps.saveState(current);
          break;
        }
        default: {
          // Estado inválido/corrompido (fora do enum) — falha explícita em vez
          // de girar o loop sem avançar (achado Codex: sem isto, loop infinito).
          throw new Error(`Estado de saga inválido: "${current.state}"`);
        }
      }
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      // Preserva o CHECKPOINT (current.state) — não sobrescreve pra FAILED, pra
      // não perder onde retomar. Grava só o erro. Se a cobrança falhou, o estado
      // fica em BILLING_REQUESTED (nunca aplicou local → tier não liberado).
      await deps.saveState({ ...current, lastError });
      return { state: current.state, asaasRef: current.asaasRef, failed: true, lastError };
    }
  }

  return { state: current.state, asaasRef: current.asaasRef };
}

/** Reexportado por conveniência (executor + saga são o mesmo domínio). */
export { nextState };
