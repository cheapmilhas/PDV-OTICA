import { describe, it, expect } from "vitest";
import { decideSagaAction } from "./saga";

// Op existente mínima pro teste (só os campos que a decisão lê).
function op(state: string, payloadHash = "hash-A") {
  return { state, payloadHash } as Parameters<typeof decideSagaAction>[0];
}

describe("decideSagaAction — idempotência + retomada por estado", () => {
  it("op inexistente (null) → fresh (cria e processa do início)", () => {
    const d = decideSagaAction(null, "hash-A");
    expect(d.kind).toBe("fresh");
  });

  it("op COMPLETED com MESMO hash → duplicate (200 sem reaplicar)", () => {
    const d = decideSagaAction(op("COMPLETED", "hash-A"), "hash-A");
    expect(d.kind).toBe("duplicate");
  });

  it("op existente com hash DIFERENTE → conflict (mesmo eventId, corpo trocado = 409)", () => {
    const d = decideSagaAction(op("COMPLETED", "hash-A"), "hash-B");
    expect(d.kind).toBe("conflict");
  });

  it("op FAILED com mesmo hash → resume (retenta, não retorna sucesso)", () => {
    const d = decideSagaAction(op("FAILED", "hash-A"), "hash-A");
    expect(d).toEqual({ kind: "resume", from: "FAILED" });
  });

  it.each(["RECEIVED", "BILLING_REQUESTED", "BILLING_CONFIRMED", "LOCAL_APPLIED"])(
    "op incompleta em %s com mesmo hash → resume (NÃO duplicate — retoma a saga)",
    (state) => {
      const d = decideSagaAction(op(state, "hash-A"), "hash-A");
      expect(d).toEqual({ kind: "resume", from: state });
    },
  );

  it("op incompleta com hash diferente → conflict (não retoma corpo trocado)", () => {
    const d = decideSagaAction(op("BILLING_REQUESTED", "hash-A"), "hash-B");
    expect(d.kind).toBe("conflict");
  });
});

describe("nextState — a ordem é Asaas-first no upgrade", () => {
  it("RECEIVED → BILLING_REQUESTED (cobra ANTES de aplicar local)", async () => {
    const { nextState } = await import("./saga");
    expect(nextState("RECEIVED")).toBe("BILLING_REQUESTED");
    expect(nextState("BILLING_REQUESTED")).toBe("BILLING_CONFIRMED");
    expect(nextState("BILLING_CONFIRMED")).toBe("LOCAL_APPLIED");
    expect(nextState("LOCAL_APPLIED")).toBe("COMPLETED");
    expect(nextState("COMPLETED")).toBe(null);
  });
});
