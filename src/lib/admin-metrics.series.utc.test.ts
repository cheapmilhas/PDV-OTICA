/**
 * Teste UTC-DEDICADO para computeMrrSeries.
 *
 * A Vercel roda em UTC em produção. O vitest.config.ts fixa TZ=America/Sao_Paulo
 * globalmente (para estabilizar o CI), o que MASCARA bugs de fuso que só
 * aparecem sob UTC. Este arquivo força TZ=UTC ANTES de importar o módulo, para
 * travar a regressão da classe de bug em que `key` e `month` (rótulo) da série
 * de MRR eram derivados de fontes de fuso diferentes e discordavam em prod.
 *
 * IMPORTANTE: o override de TZ precisa acontecer antes de qualquer import que
 * faça matemática de data — por isso ele fica no topo, antes dos imports do
 * módulo sob teste.
 */
process.env.TZ = "UTC";

import { describe, it, expect, beforeAll } from "vitest";
import {
  computeMrrSeries,
  type SubscriptionForSeries,
} from "./admin-metrics";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("computeMrrSeries sob TZ=UTC (produção Vercel)", () => {
  beforeAll(() => {
    // Garante que o runtime está de fato em UTC — se o pin global vazar, o teste
    // não estaria cobrindo o cenário de produção e daria falso-verde.
    expect(new Date().getTimezoneOffset()).toBe(0);
  });

  it("key e rótulo do mês CONCORDAM (mesma fonte de fuso) em UTC", () => {
    const series = computeMrrSeries([], NOW, 6);
    // A janela é jan..jun/2026; sob UTC o bug antigo produzia label 'dez' para
    // key '2026-01' (dupla conversão de fuso no rótulo).
    expect(series.map((p) => p.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(series.map((p) => p.month)).toEqual([
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
    ]);
  });

  it("cada key mapeia para o rótulo pt-BR correto do MESMO mês em UTC", () => {
    const monthByKey: Record<string, string> = {
      "2026-01": "jan",
      "2026-02": "fev",
      "2026-03": "mar",
      "2026-04": "abr",
      "2026-05": "mai",
      "2026-06": "jun",
    };
    const series = computeMrrSeries([], NOW, 6);
    for (const p of series) {
      expect(p.month).toBe(monthByKey[p.key]);
    }
  });

  it("rótulo curto pt-BR sem ponto final em UTC", () => {
    const series = computeMrrSeries([], NOW, 3);
    expect(series.map((p) => p.month)).toEqual(["abr", "mai", "jun"]);
    expect(series.every((p) => !p.month.includes("."))).toBe(true);
  });
});
