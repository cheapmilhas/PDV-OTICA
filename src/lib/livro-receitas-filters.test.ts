import { describe, it, expect } from "vitest";
import { chipToDateParams, type DateParams } from "./livro-receitas-filters";

// "hoje" fixo para teste determinístico: 2026-06-27 12:00 BRT.
const HOJE = new Date("2026-06-27T15:00:00.000Z"); // 12:00 em America/Sao_Paulo (UTC-3)

describe("chipToDateParams", () => {
  it("'todas' limpa todos os params de data", () => {
    const r = chipToDateParams("todas", HOJE);
    expect(r).toEqual({});
  });

  it("'vence30' vai de início de hoje até FIM do dia +30 (inclui quem vence no dia 30)", () => {
    const r = chipToDateParams("vence30", HOJE);
    expect(r.validadeDe).toBeInstanceOf(Date);
    expect(r.validadeAte).toBeInstanceOf(Date);
    // janela ~30 dias + fração do último dia (fim do dia) → entre 30 e 31 dias.
    const dias = (r.validadeAte!.getTime() - r.validadeDe!.getTime()) / (1000 * 60 * 60 * 24);
    expect(dias).toBeGreaterThan(30);
    expect(dias).toBeLessThan(31);
    expect(r.emitidaDe).toBeUndefined();
    expect(r.emitidaAte).toBeUndefined();
  });

  it("'vencidas' usa FIM do dia de hoje como teto (inclui quem vence hoje); sem validadeDe", () => {
    const r = chipToDateParams("vencidas", HOJE);
    expect(r.validadeAte).toBeInstanceOf(Date);
    expect(r.validadeDe).toBeUndefined();
    // fim do dia BRT de 2026-06-27 = 2026-06-28T02:59:59.999Z
    expect(r.validadeAte!.toISOString()).toBe("2026-06-28T02:59:59.999Z");
  });

  it("'idade1a2' é faixa exclusiva: emitidaDe=hoje-2a, emitidaAte=hoje-1a", () => {
    const r = chipToDateParams("idade1a2", HOJE);
    expect(r.emitidaDe!.getUTCFullYear()).toBe(2024);
    expect(r.emitidaAte!.getUTCFullYear()).toBe(2025);
    expect(r.validadeDe).toBeUndefined();
    expect(r.validadeAte).toBeUndefined();
  });

  it("'idade2mais' seta apenas emitidaAte=hoje-2a", () => {
    const r = chipToDateParams("idade2mais", HOJE);
    expect(r.emitidaAte!.getUTCFullYear()).toBe(2024);
    expect(r.emitidaDe).toBeUndefined();
  });

  it("faixas 1a2 e 2mais não se sobrepõem (emitidaDe de 1a2 == emitidaAte de 2mais)", () => {
    const a = chipToDateParams("idade1a2", HOJE);
    const b = chipToDateParams("idade2mais", HOJE);
    expect(a.emitidaDe!.getTime()).toBe(b.emitidaAte!.getTime());
  });
});
