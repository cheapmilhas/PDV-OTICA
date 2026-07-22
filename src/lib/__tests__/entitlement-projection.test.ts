import { describe, it, expect } from "vitest";
import { projectEntitlement } from "@/lib/entitlement-projection";

/**
 * O projetor é PURO: recebe a decisão canônica de checkSubscription e devolve o
 * DTO que o Domus consome. NÃO reimplementa regra de assinatura — se as regras
 * mudarem em subscription.ts, o projetor acompanha de graça (evita as duas
 * implementações divergentes que a forja marcou como golpe fatal).
 */

const base = { planName: "Interno — Domus" };

describe("projectEntitlement — os 6 estados do enum", () => {
  it("ACTIVE → escreve", () => {
    const r = projectEntitlement({ ...base, allowed: true, readOnly: false, status: "ACTIVE" });
    expect(r.writeAllowed).toBe(true);
    expect(r.subscriptionStatus).toBe("ACTIVE");
  });

  it("TRIAL → escreve", () => {
    expect(projectEntitlement({ ...base, allowed: true, readOnly: false, status: "TRIAL" }).writeAllowed).toBe(true);
  });

  it("PAST_DUE (readOnly) → NÃO escreve no Domus (espelha o guard local do Vis)", () => {
    // checkSubscription retorna allowed:true, readOnly:true no grace period.
    // O guard local bloqueia escrita; a projeção pro Domus tem de espelhar isso.
    const r = projectEntitlement({ ...base, allowed: true, readOnly: true, status: "PAST_DUE" });
    expect(r.writeAllowed).toBe(false);
    expect(r.subscriptionStatus).toBe("PAST_DUE");
  });

  it("TRIAL_EXPIRED → NÃO escreve", () => {
    const r = projectEntitlement({ ...base, allowed: false, status: "TRIAL_EXPIRED" });
    expect(r.writeAllowed).toBe(false);
    expect(r.reason).toBe("TRIAL_EXPIRED");
  });

  it("SUSPENDED → NÃO escreve", () => {
    expect(projectEntitlement({ ...base, allowed: false, status: "SUSPENDED" }).writeAllowed).toBe(false);
  });

  it("CANCELED → NÃO escreve", () => {
    expect(projectEntitlement({ ...base, allowed: false, status: "CANCELED" }).writeAllowed).toBe(false);
  });
});

describe("projectEntitlement — robustez", () => {
  it("planName ausente (ramo kill-switch/bypass) → planName null, sem quebrar", () => {
    const r = projectEntitlement({ allowed: true, readOnly: false, status: "ACTIVE" });
    expect(r.planName).toBeNull();
    expect(r.writeAllowed).toBe(true);
  });

  it("NO_SUBSCRIPTION → NÃO escreve", () => {
    expect(projectEntitlement({ allowed: false, status: "NO_SUBSCRIPTION" }).writeAllowed).toBe(false);
  });

  it("writeAllowed = allowed && !readOnly (readOnly corta a escrita mesmo com allowed)", () => {
    expect(projectEntitlement({ allowed: true, readOnly: false, status: "ACTIVE" }).writeAllowed).toBe(true);
    expect(projectEntitlement({ allowed: true, readOnly: true, status: "PAST_DUE" }).writeAllowed).toBe(false);
    expect(projectEntitlement({ allowed: false, readOnly: false, status: "SUSPENDED" }).writeAllowed).toBe(false);
  });
});
