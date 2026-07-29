import { describe, it, expect } from "vitest";
import { LIVE_STATUSES, resolvePastDueAccess } from "./subscription";

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

describe("resolvePastDueAccess", () => {
  it("recém-vencido (0 dias) → pode LER e ESCREVER, com aviso", () => {
    const r = resolvePastDueAccess(0);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(false);
  });

  it("durante os avisos (7 dias) → ainda escreve", () => {
    expect(resolvePastDueAccess(7).readOnly).toBe(false);
  });

  it("no marco final (14 dias) → perde a escrita, mantém a leitura", () => {
    const r = resolvePastDueAccess(14);
    expect(r.allowed).toBe(true);
    expect(r.readOnly).toBe(true);
  });

  it("a mensagem muda de tom entre avisar e restringir", () => {
    expect(resolvePastDueAccess(3).message).not.toBe(resolvePastDueAccess(14).message);
  });

  it("a mensagem sempre informa os dias de atraso", () => {
    expect(resolvePastDueAccess(9).message).toContain("9");
  });
});
