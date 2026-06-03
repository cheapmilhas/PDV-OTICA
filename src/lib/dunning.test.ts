import { describe, it, expect } from "vitest";
import { nextDunningStage, canCancel, dunningMessage, DUNNING_STAGES } from "./dunning";

describe("nextDunningStage", () => {
  it("antes de 3 dias → null (nenhum marco)", () => {
    expect(nextDunningStage(0, null)).toBeNull();
    expect(nextDunningStage(2, null)).toBeNull();
  });

  it("3 dias, nada avisado → marco 3", () => {
    expect(nextDunningStage(3, null)).toBe(3);
    expect(nextDunningStage(3, 0)).toBe(3);
  });

  it("não reenvia marco já avisado", () => {
    expect(nextDunningStage(3, 3)).toBeNull();
    expect(nextDunningStage(5, 3)).toBeNull(); // próximo é 7, ainda não atingido
  });

  it("avança para o próximo marco quando atingido", () => {
    expect(nextDunningStage(7, 3)).toBe(7);
    expect(nextDunningStage(14, 7)).toBe(14);
  });

  it("PULA marcos: entrou com 10 dias, nada avisado → 7 (não 3)", () => {
    expect(nextDunningStage(10, null)).toBe(7);
  });

  it("PULA direto para 14: entrou com 20 dias, nada avisado → 14", () => {
    expect(nextDunningStage(20, null)).toBe(14);
  });

  it("após 14 avisado, mesmo com 30 dias → null (14 é o último marco)", () => {
    expect(nextDunningStage(30, 14)).toBeNull();
  });
});

describe("canCancel", () => {
  it("menos de 30 dias → não cancela", () => {
    expect(canCancel(29, 14)).toBe(false);
  });

  it("30 dias mas sem aviso 14 registrado → NÃO cancela (régua exige avisar antes)", () => {
    expect(canCancel(30, null)).toBe(false);
    expect(canCancel(30, 7)).toBe(false);
    expect(canCancel(35, 3)).toBe(false);
  });

  it("30 dias COM aviso 14 registrado → pode cancelar", () => {
    expect(canCancel(30, 14)).toBe(true);
    expect(canCancel(45, 14)).toBe(true);
  });
});

describe("dunningMessage", () => {
  it("texto diferente por marco", () => {
    const m3 = dunningMessage(3, 3);
    const m7 = dunningMessage(7, 7);
    const m14 = dunningMessage(14, 14);
    expect(m3.title).not.toBe(m7.title);
    expect(m7.title).not.toBe(m14.title);
    expect(m14.title.toLowerCase()).toContain("suspens");
  });

  it("inclui os dias de atraso na mensagem", () => {
    expect(dunningMessage(7, 9).message).toContain("9");
  });
});

describe("DUNNING_STAGES", () => {
  it("régua é 3/7/14 em ordem crescente", () => {
    expect([...DUNNING_STAGES]).toEqual([3, 7, 14]);
  });
});
