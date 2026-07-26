import { describe, expect, it } from "vitest";

import {
  severidadeDaFila,
  severidadeGeral,
  type FilaSeveridade,
} from "@/services/federation-health.service";

const SEM_RISCO = { cobradoSemAplicar: 0, revisaoManual: 0, falhas: 0, presas: 0 };
const fila = (severidade: FilaSeveridade) => ({ severidade });

/**
 * Saúde da Federação (N2): o canal Vis↔Domus é assíncrono e falha em silêncio.
 * A severidade é o que decide se o operador age hoje ou ignora — por isso ela
 * é testada, e não só a consulta.
 */
describe("severidadeDaFila", () => {
  it("fila limpa é ok", () => {
    expect(severidadeDaFila(0, 0)).toBe("ok");
  });

  it("atrasado é ATENÇÃO — costuma se resolver no próximo tick do cron", () => {
    expect(severidadeDaFila(3, 0)).toBe("atencao");
  });

  it("travado é CRÍTICO — esgotou tentativas, só sai com intervenção", () => {
    expect(severidadeDaFila(0, 1)).toBe("critico");
  });

  it("travado DOMINA atrasado: tratar os dois igual faria o operador ignorar ambos", () => {
    expect(severidadeDaFila(50, 1)).toBe("critico");
  });
});

describe("severidadeGeral", () => {
  it("tudo limpo é ok", () => {
    expect(severidadeGeral([fila("ok"), fila("ok")], SEM_RISCO)).toBe("ok");
  });

  it("propaga a PIOR fila, não a primeira", () => {
    expect(severidadeGeral([fila("ok"), fila("atencao"), fila("ok")], SEM_RISCO)).toBe("atencao");
    expect(severidadeGeral([fila("atencao"), fila("critico")], SEM_RISCO)).toBe("critico");
  });

  it("CLIENTE COBRADO SEM RECEBER O PLANO domina, mesmo com as filas limpas", () => {
    // É dinheiro do cliente sem contrapartida — o pior estado do sistema.
    // Se as filas limpas mascarassem isso, o painel esconderia justamente o
    // que ele existe para mostrar.
    expect(
      severidadeGeral([fila("ok")], { ...SEM_RISCO, cobradoSemAplicar: 1 }),
    ).toBe("critico");
  });

  it("revisão manual também domina — alguém precisa decidir", () => {
    expect(severidadeGeral([fila("ok")], { ...SEM_RISCO, revisaoManual: 1 })).toBe("critico");
  });

  it("saga PRESA no meio sobe como atenção (achado do Codex)", () => {
    // Estados intermediários parados (BILLING_REQUESTED etc.) não são terminais,
    // então ninguém os olharia — mas é a antessala do "cobrado sem aplicar".
    expect(severidadeGeral([fila("ok")], { ...SEM_RISCO, presas: 2 })).toBe("atencao");
  });

  it("presa NÃO rebaixa um crítico já existente", () => {
    expect(
      severidadeGeral([fila("critico")], { ...SEM_RISCO, presas: 2 }),
    ).toBe("critico");
  });

  it("falha comum de plano NÃO estoura o resumo sozinha", () => {
    // FAILED é falha-segura (não cobrou); vira número na tela, não alarme.
    expect(severidadeGeral([fila("ok")], { ...SEM_RISCO, falhas: 5 })).toBe("ok");
  });

  it("sem filas cadastradas não inventa problema", () => {
    expect(severidadeGeral([], SEM_RISCO)).toBe("ok");
  });
});
