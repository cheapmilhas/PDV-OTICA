import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSaga } from "./executor";
import type { SagaDeps, SagaOp } from "./executor";

function makeOp(state: SagaOp["state"] = "RECEIVED"): SagaOp {
  return {
    id: "op1",
    eventId: "ev1",
    visCompanyId: "co1",
    requestedTier: "clinic_full",
    targetPlanId: "plan_clinica",
    state,
    asaasRef: null,
  };
}

function makeDeps(over: Partial<SagaDeps> = {}): SagaDeps {
  return {
    confirmBilling: vi.fn().mockResolvedValue({ asaasRef: "asaas-1" }),
    applyLocal: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    saveState: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("runSaga — ordem Asaas-first (upgrade nunca libera sem cobrar)", () => {
  it("caminho feliz: cobra → aplica local → publica → COMPLETED, nessa ordem", async () => {
    const deps = makeDeps();
    const order: string[] = [];
    (deps.confirmBilling as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("billing"); return { asaasRef: "a1" }; });
    (deps.applyLocal as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("local"); });
    (deps.publish as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push("publish"); });

    const final = await runSaga(makeOp("RECEIVED"), deps);

    expect(order).toEqual(["billing", "local", "publish"]);
    expect(final.state).toBe("COMPLETED");
  });

  it("cobrança FALHA → NÃO aplica local nem publica; estado FAILED", async () => {
    const deps = makeDeps({
      confirmBilling: vi.fn().mockRejectedValue(new Error("asaas down")),
    });
    const final = await runSaga(makeOp("RECEIVED"), deps);

    expect(deps.applyLocal).not.toHaveBeenCalled(); // não libera tier sem pagar
    expect(deps.publish).not.toHaveBeenCalled();
    expect(final.state).toBe("FAILED");
    expect(final.lastError).toContain("asaas");
  });

  it("persiste estado APÓS cada passo (retomada)", async () => {
    const deps = makeDeps();
    await runSaga(makeOp("RECEIVED"), deps);
    const saved = (deps.saveState as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].state);
    // Deve ter persistido BILLING_CONFIRMED, LOCAL_APPLIED e COMPLETED (ao menos).
    expect(saved).toContain("BILLING_CONFIRMED");
    expect(saved).toContain("LOCAL_APPLIED");
    expect(saved).toContain("COMPLETED");
  });
});

describe("runSaga — retomada por estado (crash recovery)", () => {
  it("retoma de BILLING_CONFIRMED → NÃO recobra, aplica local + publica", async () => {
    const deps = makeDeps();
    const final = await runSaga(makeOp("BILLING_CONFIRMED"), deps);

    expect(deps.confirmBilling).not.toHaveBeenCalled(); // já cobrou antes do crash
    expect(deps.applyLocal).toHaveBeenCalledOnce();
    expect(deps.publish).toHaveBeenCalledOnce();
    expect(final.state).toBe("COMPLETED");
  });

  it("retoma de LOCAL_APPLIED → só publica", async () => {
    const deps = makeDeps();
    const final = await runSaga(makeOp("LOCAL_APPLIED"), deps);

    expect(deps.confirmBilling).not.toHaveBeenCalled();
    expect(deps.applyLocal).not.toHaveBeenCalled();
    expect(deps.publish).toHaveBeenCalledOnce();
    expect(final.state).toBe("COMPLETED");
  });

  it("op já COMPLETED → no-op (não repete nada)", async () => {
    const deps = makeDeps();
    const final = await runSaga(makeOp("COMPLETED"), deps);
    expect(deps.confirmBilling).not.toHaveBeenCalled();
    expect(deps.applyLocal).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(final.state).toBe("COMPLETED");
  });
});
