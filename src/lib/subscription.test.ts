import { describe, it, expect } from "vitest";
import { LIVE_STATUSES } from "./subscription";

/**
 * Testes de CARACTERIZAÇÃO: travam o comportamento atual de LIVE_STATUSES
 * (quais status de assinatura mantêm as features do plano liberadas).
 * Rede de segurança para as fases futuras que vão mexer em cobrança.
 * Se algum destes falhar, foi uma MUDANÇA de comportamento — confirme se é intencional.
 */
describe("LIVE_STATUSES (caracterização)", () => {
  it("inclui TRIAL, ACTIVE e PAST_DUE (status que liberam features)", () => {
    expect(LIVE_STATUSES).toContain("TRIAL");
    expect(LIVE_STATUSES).toContain("ACTIVE");
    expect(LIVE_STATUSES).toContain("PAST_DUE");
  });

  it("NÃO inclui SUSPENDED, CANCELED nem TRIAL_EXPIRED (status que zeram features)", () => {
    expect(LIVE_STATUSES).not.toContain("SUSPENDED");
    expect(LIVE_STATUSES).not.toContain("CANCELED");
    expect(LIVE_STATUSES).not.toContain("TRIAL_EXPIRED");
  });

  it("tem exatamente 3 status vivos", () => {
    expect(LIVE_STATUSES).toHaveLength(3);
  });
});
