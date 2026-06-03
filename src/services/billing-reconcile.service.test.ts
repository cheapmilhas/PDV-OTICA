import { describe, it, expect } from "vitest";
import { decideReconcile } from "./billing-reconcile.service";

describe("decideReconcile", () => {
  it("Asaas ACTIVE + value bate (centavos) → clear", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 10000, expectedAsaasCycle: null },
      { status: "ACTIVE", value: 100, cycle: "MONTHLY" }
    );
    expect(d).toEqual({ action: "clear", reason: "matched" });
  });

  it("Asaas ACTIVE + value diverge → keep value_mismatch", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 10000, expectedAsaasCycle: null },
      { status: "ACTIVE", value: 90, cycle: "MONTHLY" }
    );
    expect(d).toEqual({ action: "keep", reason: "value_mismatch" });
  });

  it("Asaas EXPIRED → keep asaas_not_active (mesmo com value batendo)", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 10000, expectedAsaasCycle: null },
      { status: "EXPIRED", value: 100, cycle: "MONTHLY" }
    );
    expect(d).toEqual({ action: "keep", reason: "asaas_not_active" });
  });

  it("Asaas INACTIVE → keep asaas_not_active", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 10000, expectedAsaasCycle: null },
      { status: "INACTIVE", value: 100, cycle: "MONTHLY" }
    );
    expect(d.action).toBe("keep");
    expect(d.reason).toBe("asaas_not_active");
  });

  it("cycle esperado setado e bate (value+cycle) → clear", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 96000, expectedAsaasCycle: "YEARLY" },
      { status: "ACTIVE", value: 960, cycle: "YEARLY" }
    );
    expect(d).toEqual({ action: "clear", reason: "matched" });
  });

  it("cycle esperado setado e diverge → keep cycle_mismatch", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 96000, expectedAsaasCycle: "YEARLY" },
      { status: "ACTIVE", value: 960, cycle: "MONTHLY" }
    );
    expect(d).toEqual({ action: "keep", reason: "cycle_mismatch" });
  });

  it("expectedAsaasCycle null → não compara ciclo (só value)", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 10000, expectedAsaasCycle: null },
      { status: "ACTIVE", value: 100, cycle: "YEARLY" }
    );
    expect(d).toEqual({ action: "clear", reason: "matched" });
  });

  it("tolerância de centavo: 99.99 reais vs 9999 centavos → clear", () => {
    const d = decideReconcile(
      { expectedAsaasValue: 9999, expectedAsaasCycle: null },
      { status: "ACTIVE", value: 99.99, cycle: "MONTHLY" }
    );
    expect(d).toEqual({ action: "clear", reason: "matched" });
  });

  it("expectedAsaasValue null → não compara value (clear se ACTIVE)", () => {
    const d = decideReconcile(
      { expectedAsaasValue: null, expectedAsaasCycle: null },
      { status: "ACTIVE", value: 123.45, cycle: "MONTHLY" }
    );
    expect(d).toEqual({ action: "clear", reason: "matched" });
  });
});
