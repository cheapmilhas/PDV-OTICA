import { describe, it, expect } from "vitest";
import { nextPeriod, isContiguous } from "./billing-clock";

const d = (s: string) => new Date(s + "T00:00:00.000Z");

describe("nextPeriod", () => {
  it("mensal: encadeia a partir do FIM do período anterior, nunca de now", () => {
    const p = nextPeriod({ previousEnd: d("2026-08-09"), cycle: "MONTHLY" });
    expect(p.periodStart.toISOString()).toBe(d("2026-08-09").toISOString());
    expect(p.periodEnd.toISOString()).toBe(d("2026-09-09").toISOString());
  });

  it("anual: um período de 12 meses, não 12 mensais", () => {
    const p = nextPeriod({ previousEnd: d("2026-02-24"), cycle: "YEARLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2027-02-24").toISOString());
  });

  it("fim de mês: 31/01 + 1 mês = 28/02 (não 03/03)", () => {
    // setMonth() ingênuo estoura para março. A âncora do ciclo é preservada.
    const p = nextPeriod({ previousEnd: d("2026-01-31"), cycle: "MONTHLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2026-02-28").toISOString());
  });

  it("ano bissexto: 31/01/2028 + 1 mês = 29/02/2028", () => {
    const p = nextPeriod({ previousEnd: d("2028-01-31"), cycle: "MONTHLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2028-02-29").toISOString());
  });

  it("intervalo é semiaberto: o fim de um é o começo do próximo", () => {
    const p1 = nextPeriod({ previousEnd: d("2026-03-15"), cycle: "MONTHLY" });
    const p2 = nextPeriod({ previousEnd: p1.periodEnd, cycle: "MONTHLY" });
    expect(p2.periodStart.toISOString()).toBe(p1.periodEnd.toISOString());
  });

  it("mês com 30 dias: 31/03 + 1 mês = 30/04 (abril não tem dia 31)", () => {
    // Mesma regra de clamping do 31/01→28/02, mas partindo de um mês de 31
    // dias para um de 30 — garante que o clamp não é hardcoded para fevereiro.
    const p = nextPeriod({ previousEnd: d("2026-03-31"), cycle: "MONTHLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2026-04-30").toISOString());
  });

  it("encadeamento longo: 31/01 -> 28/02 -> 28/03, não 31/03", () => {
    // Decisão de design: a âncora é o dia-do-mês de `previousEnd`, recalculada
    // a CADA chamada — não existe estado externo guardando "o dia original era
    // 31". `nextPeriod` só recebe `previousEnd`; uma vez que o clamp reduziu o
    // período anterior a 28/02, esse "28" é o único dado que a função tem para
    // encadear o próximo — logo o passo seguinte é 28/03. Recuperar o "31"
    // exigiria um parâmetro extra (ex.: `anchorDay`) fora do contrato desta
    // task; ver ressalva no relatório.
    const p1 = nextPeriod({ previousEnd: d("2026-01-31"), cycle: "MONTHLY" });
    expect(p1.periodEnd.toISOString()).toBe(d("2026-02-28").toISOString());

    const p2 = nextPeriod({ previousEnd: p1.periodEnd, cycle: "MONTHLY" });
    expect(p2.periodEnd.toISOString()).toBe(d("2026-03-28").toISOString());
  });

  it("anual em ano bissexto: 29/02/2028 + 1 ano = 28/02/2029 (2029 não é bissexto)", () => {
    const p = nextPeriod({ previousEnd: d("2028-02-29"), cycle: "YEARLY" });
    expect(p.periodEnd.toISOString()).toBe(d("2029-02-28").toISOString());
  });

  it("periodStart é sempre igual a previousEnd, mesmo quando o mês clampeia", () => {
    // Mutação plausível: alguém poderia recalcular `periodStart` a partir de
    // "ano/mês/dia-âncora" em vez de copiar `previousEnd` literalmente,
    // introduzindo um desvio sutil no início do período.
    const p = nextPeriod({ previousEnd: d("2026-01-31"), cycle: "MONTHLY" });
    expect(p.periodStart.toISOString()).toBe(d("2026-01-31").toISOString());
  });

  it("preserva hora/minuto/segundo de previousEnd, não só a data", () => {
    // Mutação plausível: truncar para meia-noite UTC ao montar o próximo
    // período. Faturas reais podem ter timestamp com hora (ex.: gerado às
    // 14:32) e o encadeamento não pode arredondar isso.
    const withTime = new Date("2026-05-10T14:32:07.500Z");
    const p = nextPeriod({ previousEnd: withTime, cycle: "MONTHLY" });
    expect(p.periodStart.toISOString()).toBe(withTime.toISOString());
    expect(p.periodEnd.toISOString()).toBe("2026-06-10T14:32:07.500Z");
  });

  it("não muta a data de entrada (previousEnd)", () => {
    // Mutação plausível: usar setUTCMonth diretamente sobre o objeto Date
    // recebido, mutando o argumento do chamador (que pode ser reusado).
    const input = d("2026-01-31");
    const inputCopy = new Date(input);
    nextPeriod({ previousEnd: input, cycle: "MONTHLY" });
    expect(input.toISOString()).toBe(inputCopy.toISOString());
  });
});

describe("isContiguous", () => {
  it("detecta buraco na sequência", () => {
    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
      { periodStart: d("2026-02-01"), periodEnd: d("2026-03-01") },
    ])).toBe(true);

    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
      { periodStart: d("2026-02-05"), periodEnd: d("2026-03-05") }, // buraco
    ])).toBe(false);
  });

  it("detecta sobreposição (não é só buraco que quebra contiguidade)", () => {
    // Mutação plausível: comparar com `<=`/`>=` em vez de igualdade estrita,
    // deixando passar uma sobreposição de dias como se fosse "contíguo o
    // bastante".
    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-05") },
      { periodStart: d("2026-02-01"), periodEnd: d("2026-03-01") }, // sobrepõe
    ])).toBe(false);
  });

  it("lista vazia e lista de um elemento são contíguas por vacuidade", () => {
    expect(isContiguous([])).toBe(true);
    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
    ])).toBe(true);
  });

  it("três períodos: buraco só no segundo par ainda é detectado", () => {
    // Mutação plausível: só comparar o primeiro par com o segundo e nunca
    // avançar o laço, ou comparar sempre contra o primeiro elemento.
    expect(isContiguous([
      { periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
      { periodStart: d("2026-02-01"), periodEnd: d("2026-03-01") },
      { periodStart: d("2026-03-02"), periodEnd: d("2026-04-01") }, // buraco aqui
    ])).toBe(false);
  });
});
