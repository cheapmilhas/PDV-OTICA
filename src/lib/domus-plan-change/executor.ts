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
  state: SagaState;
  asaasRef: string | null;
  lastError?: string | null;
}

/**
 * Executa (ou retoma) a saga a partir do estado atual da op até COMPLETED.
 * Cada passo avança um estado e persiste. Falha em qualquer passo → FAILED
 * (retomável: rodar de novo continua de onde parou, sem repetir passos feitos).
 */
export async function runSaga(op: SagaOp, deps: SagaDeps): Promise<SagaResult> {
  let current: SagaOp = { ...op };

  // Loop pelos passos que faltam. Cada estado dispara a AÇÃO que leva ao próximo.
  while (current.state !== "COMPLETED" && current.state !== "FAILED") {
    try {
      switch (current.state) {
        case "RECEIVED": {
          // Marca que vai cobrar (BILLING_REQUESTED) antes de chamar o Asaas —
          // se crashar durante a cobrança, a retomada sabe que estava cobrando.
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
      }
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      // NÃO avança: para no estado atual como FAILED (retomável). Se a cobrança
      // (BILLING_REQUESTED) falhou, o estado fica FAILED sem nunca ter aplicado
      // local — o tier caro não é liberado.
      current = { ...current, state: "FAILED" };
      await deps.saveState({ ...current, lastError });
      return { state: "FAILED", asaasRef: current.asaasRef, lastError };
    }
  }

  return { state: current.state, asaasRef: current.asaasRef };
}

/** Reexportado por conveniência (executor + saga são o mesmo domínio). */
export { nextState };
