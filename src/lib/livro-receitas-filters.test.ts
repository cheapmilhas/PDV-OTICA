import { describe, it, expect } from "vitest";
import { chipToDateParams, type DateParams } from "./livro-receitas-filters";

// "hoje" fixo para teste determinístico: 2026-06-27 12:00 BRT.
const HOJE = new Date("2026-06-27T15:00:00.000Z"); // 12:00 em America/Sao_Paulo (UTC-3)

describe("chipToDateParams", () => {
  it("'todas' limpa todos os params de data", () => {
    const r = chipToDateParams("todas", HOJE);
    expect(r).toEqual({});
  });

  it("'vence30' seta validadeDe=hoje e validadeAte=hoje+30d", () => {
    const r = chipToDateParams("vence30", HOJE);
    expect(r.validadeDe).toBeInstanceOf(Date);
    expect(r.validadeAte).toBeInstanceOf(Date);
    const dias = (r.validadeAte!.getTime() - r.validadeDe!.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(dias)).toBe(30);
    expect(r.emitidaDe).toBeUndefined();
    expect(r.emitidaAte).toBeUndefined();
  });

  it("'vencidas' seta validadeAte=hoje (sem validadeDe)", () => {
    const r = chipToDateParams("vencidas", HOJE);
    expect(r.validadeAte).toBeInstanceOf(Date);
    expect(r.validadeDe).toBeUndefined();
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
