import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSaga } from "./executor";
import type { SagaDeps, SagaOp, CasResult } from "./executor";
import type { SagaState } from "./saga";

// Longe no futuro: op NÃO expirada por padrão (a expiração é testada à parte).
const FAR_FUTURE = new Date(4102444800000); // 2100-01-01

function makeOp(state: SagaOp["state"] = "RECEIVED", over: Partial<SagaOp> = {}): SagaOp {
  return {
    id: "op1",
    eventId: "ev1",
    visCompanyId: "co1",
    requestedTier: "clinic_full",
    targetPlanId: "plan_clinica",
    state,
    asaasRef: null,
    expiresAt: FAR_FUTURE,
    ...over,
  };
}

const OK: CasResult = { applied: true };

/**
 * Deps de teste que simulam o estado da op no "banco". `transition`/`applyLocal`
 * fazem CAS de verdade contra `dbState`: só avançam se o estado esperado bate.
 * Isso permite testar monotonia (executor atrasado NÃO regride) e atomicidade.
 */
function makeDeps(over: Partial<SagaDeps> = {}, dbStateInit: SagaState = "RECEIVED") {
  const state = { value: dbStateInit as SagaState };
  const calls = { confirmBilling: 0, applyLocal: 0, publish: 0 };
  const order: string[] = []; // ordem real dos efeitos (cobra→aplica→publica)

  const base: SagaDeps = {
    confirmBilling: vi.fn(async () => {
      calls.confirmBilling++;
      order.push("billing");
      return { asaasRef: "asaas-real-id" };
    }),
    applyLocal: vi.fn(async (): Promise<CasResult> => {
      calls.applyLocal++;
      // CAS atômico: só aplica se o db ainda está em BILLING_CONFIRMED.
      if (state.value !== "BILLING_CONFIRMED") return { applied: false };
      order.push("local");
      state.value = "LOCAL_APPLIED";
      return OK;
    }),
    publish: vi.fn(async () => {
      calls.publish++;
      order.push("publish");
    }),
    transition: vi.fn(async (_op, from, to): Promise<CasResult> => {
      if (state.value !== from) return { applied: false };
      state.value = to;
      return OK;
    }),
    recordError: vi.fn(async () => {}),
    markTerminal: vi.fn(async (_op, from, terminal): Promise<CasResult> => {
      if (state.value !== from) return { applied: false };
      state.value = terminal;
      return OK;
    }),
    reloadOp: vi.fn(async () => ({ state: state.value, asaasRef: null as string | null })),
    ...over,
  };
  return { deps: base, state, calls, order };
}

beforeEach(() => vi.clearAllMocks());

describe("runSaga — ordem Asaas-first (upgrade nunca libera sem cobrar)", () => {
  it("caminho feliz: cobra → aplica local → publica → COMPLETED, nessa ordem", async () => {
    const { deps, order } = makeDeps({}, "RECEIVED");
    const final = await runSaga(makeOp("RECEIVED"), deps);

    expect(order).toEqual(["billing", "local", "publish"]);
    expect(final.state).toBe("COMPLETED");
  });

  it("cobrança FALHA → NÃO aplica local nem publica; failed=true, checkpoint em BILLING_REQUESTED", async () => {
    const { deps, calls } = makeDeps({
      confirmBilling: vi.fn().mockRejectedValue(new Error("asaas down")),
    });
    const final = await runSaga(makeOp("RECEIVED"), deps);

    expect(calls.applyLocal).toBe(0); // não libera tier sem pagar
    expect(calls.publish).toBe(0);
    expect(final.failed).toBe(true);
    // checkpoint preservado: parou tentando cobrar, NÃO some pra FAILED
    expect(final.state).toBe("BILLING_REQUESTED");
    expect(final.lastError).toContain("asaas");
    // recordError foi chamado com o estado atual (CAS)
    expect(deps.recordError).toHaveBeenCalledWith(
      expect.anything(),
      "BILLING_REQUESTED",
      expect.stringContaining("asaas"),
    );
  });

  it("retomar após falha de cobrança → continua de BILLING_REQUESTED (recobra idempotente)", async () => {
    const deps1 = makeDeps({ confirmBilling: vi.fn().mockRejectedValue(new Error("timeout")) }, "BILLING_REQUESTED");
    const r1 = await runSaga(makeOp("BILLING_REQUESTED"), deps1.deps);
    expect(r1.state).toBe("BILLING_REQUESTED");

    const deps2 = makeDeps({}, "BILLING_REQUESTED");
    const r2 = await runSaga(makeOp("BILLING_REQUESTED"), deps2.deps);
    expect(deps2.calls.confirmBilling).toBe(1);
    expect(r2.state).toBe("COMPLETED");
    expect(r2.failed).toBeFalsy();
  });
});

describe("runSaga — retomada por estado (crash recovery)", () => {
  it("retoma de BILLING_CONFIRMED → NÃO recobra, aplica local + publica", async () => {
    const { deps, calls } = makeDeps({}, "BILLING_CONFIRMED");
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);

    expect(calls.confirmBilling).toBe(0); // já cobrou antes do crash
    expect(calls.applyLocal).toBe(1);
    expect(calls.publish).toBe(1);
    expect(final.state).toBe("COMPLETED");
  });

  it("retoma de LOCAL_APPLIED → só publica", async () => {
    const { deps, calls } = makeDeps({}, "LOCAL_APPLIED");
    const final = await runSaga(makeOp("LOCAL_APPLIED"), deps);

    expect(calls.confirmBilling).toBe(0);
    expect(calls.applyLocal).toBe(0);
    expect(calls.publish).toBe(1);
    expect(final.state).toBe("COMPLETED");
  });

  it("op já COMPLETED → no-op (não repete nada)", async () => {
    const { deps, calls } = makeDeps({}, "COMPLETED");
    const final = await runSaga(makeOp("COMPLETED"), deps);
    expect(calls.confirmBilling).toBe(0);
    expect(calls.applyLocal).toBe(0);
    expect(calls.publish).toBe(0);
    expect(final.state).toBe("COMPLETED");
  });
});

describe("runSaga — monotonia (CAS): executor atrasado não regride nem duplica", () => {
  it("CAS de applyLocal perde (op já avançou por outro executor) → NÃO aplica, relê e encerra", async () => {
    // db já está em COMPLETED (outro executor terminou); este chega atrasado em
    // BILLING_CONFIRMED. O applyLocal CAS não pega; reloadState devolve COMPLETED.
    const { deps, calls } = makeDeps({}, "COMPLETED");
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);

    // applyLocal foi TENTADO uma vez mas o CAS não pegou → nenhum efeito duplicado
    expect(calls.applyLocal).toBe(1);
    expect(calls.publish).toBe(0); // já estava COMPLETED, não republica
    expect(final.state).toBe("COMPLETED");
    expect(final.failed).toBeFalsy();
  });

  it("CAS perde e reloadOp devolve o MESMO estado → para sem laço infinito", async () => {
    const { deps } = makeDeps({}, "RECEIVED");
    // força transition a nunca pegar (simula perda contínua do CAS)
    (deps.transition as ReturnType<typeof vi.fn>).mockResolvedValue({ applied: false });
    (deps.reloadOp as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "RECEIVED", asaasRef: null });

    const final = await runSaga(makeOp("RECEIVED"), deps);
    // resync vê real===atual → retorna null → o executor para (stopHere), sem girar.
    expect(final.state).toBe("RECEIVED");
    expect(final.failed).toBeFalsy();
  });

  it("CAS perde e reloadOp devolve estado ANTERIOR (regressão) → NÃO adota, para", async () => {
    // Achado Codex #6: um executor em BILLING_CONFIRMED que relê RECEIVED NÃO pode
    // adotar a regressão (reexecutaria confirmBilling = dupla cobrança).
    const { deps, calls } = makeDeps({}, "BILLING_CONFIRMED");
    (deps.applyLocal as ReturnType<typeof vi.fn>).mockResolvedValue({ applied: false });
    (deps.reloadOp as ReturnType<typeof vi.fn>).mockResolvedValue({ state: "RECEIVED", asaasRef: null });

    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);
    expect(calls.confirmBilling).toBe(0); // NÃO recobra
    expect(final.state).toBe("BILLING_CONFIRMED"); // para no checkpoint, não regride
    expect(final.failed).toBeFalsy();
  });

  it("applyLocal retorna applied=false 2×: efeito nunca roda duas vezes", async () => {
    // Simula reexecução após crash pós-commit: o db já está LOCAL_APPLIED.
    const { deps, calls } = makeDeps({}, "LOCAL_APPLIED");
    // retoma de BILLING_CONFIRMED (checkpoint antigo em memória)
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);
    // applyLocal tentou, CAS não pegou (db em LOCAL_APPLIED) → sem 2º efeito;
    // resync adota LOCAL_APPLIED e segue pro publish → COMPLETED.
    expect(calls.applyLocal).toBe(1);
    expect(calls.publish).toBe(1);
    expect(final.state).toBe("COMPLETED");
  });
});

describe("runSaga — terminais humanos não são processados", () => {
  it.each(["FAILED", "FAILED_BEFORE_BILLING", "CHARGED_NOT_APPLIED", "MANUAL_REVIEW"] as const)(
    "estado terminal %s → no-op imediato",
    async (terminal) => {
      const { deps, calls } = makeDeps({}, terminal);
      const final = await runSaga(makeOp(terminal), deps);
      expect(calls.confirmBilling).toBe(0);
      expect(calls.applyLocal).toBe(0);
      expect(calls.publish).toBe(0);
      expect(final.state).toBe(terminal);
    },
  );
});

describe("runSaga — expiração antes de cobrar (achado Codex #3)", () => {
  it("RECEIVED expirada → FAILED_BEFORE_BILLING, NÃO cobra (seguro)", async () => {
    const { deps, calls } = makeDeps({}, "RECEIVED");
    const past = new Date(1000); // 1970 — bem no passado
    const now = new Date(2000);
    const final = await runSaga(makeOp("RECEIVED", { expiresAt: past }), deps, now);

    expect(calls.confirmBilling).toBe(0); // nunca tocou o Asaas
    expect(calls.applyLocal).toBe(0);
    expect(final.state).toBe("FAILED_BEFORE_BILLING");
    expect(final.failed).toBeFalsy(); // expiração é terminal limpo, não "failed"
  });

  it("RECEIVED ainda válida → segue o fluxo normal (cobra)", async () => {
    const { deps, calls } = makeDeps({}, "RECEIVED");
    const now = new Date(2000);
    const future = new Date(999999999999);
    const final = await runSaga(makeOp("RECEIVED", { expiresAt: future }), deps, now);

    expect(calls.confirmBilling).toBe(1);
    expect(final.state).toBe("COMPLETED");
  });

  it("op JÁ em BILLING_REQUESTED e expirada → NÃO expira cegamente (ambíguo, dinheiro em jogo)", async () => {
    // Só o case RECEIVED checa expiração. Depois de tocar o Asaas, expirar seria
    // inseguro. A op segue o fluxo (retoma a cobrança idempotente).
    const { deps, calls } = makeDeps({}, "BILLING_REQUESTED");
    const now = new Date(9_000_000_000_000);
    const final = await runSaga(makeOp("BILLING_REQUESTED", { expiresAt: new Date(1000) }), deps, now);

    expect(calls.confirmBilling).toBe(1); // retomou a cobrança, não expirou
    expect(final.state).toBe("COMPLETED");
  });
});
