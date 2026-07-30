import { describe, expect, it } from "vitest";
import { nextPeriod, isContiguous } from "@/lib/billing-clock";
import { advisoryKeyForCompany as keyReal } from "@/lib/advisory-lock";
import { resolveObligationDisposition } from "@/lib/billing-courtesy";

/**
 * Testes do bootstrap das obrigações (`scripts/bootstrap-billing-obligations.cjs`).
 *
 * ## O QUE ESTE ARQUIVO COBRE
 *
 *  1. A réplica da aritmética de período no `.cjs` bate com `nextPeriod`
 *     (`src/lib/billing-clock.ts`) — a duplicação consciente não pode derivar.
 *  2. A réplica de `advisoryKeyForCompany` é BIT A BIT igual à do motor.
 *  3. Os períodos da Óticas Ultra são CONTÍGUOS e são exatamente 8 (maio pago +
 *     7 de cortesia), conferido pelo `isContiguous` REAL.
 *  4. A retificação de redação `31/05` → `01/06` é a única leitura que faz a
 *     cortesia realmente cobrir junho — provado pelo `resolveObligationDisposition`
 *     REAL, não por reimplementação.
 *  5. Os totais de receita não faturada batem com o documento aprovado.
 *  6. Invariantes estruturais do PLANO declarado: nenhuma isenta em PLANNED,
 *     nenhuma isenta com issuedAt/dueAt, sequências começando em 1 sem lacuna.
 *  7. O FLUXO COMPLETO (`executar`) contra um Prisma FALSO em memória, sobre a
 *     foto de produção descrita no doc: percorre as 4 assinaturas sem abortar,
 *     produz 11 obrigações e 2 cortesias, é NO-OP na segunda execução, e cada
 *     guarda de drift aborta quando o banco divergir (8 sabotagens).
 *
 * ## O QUE ESTE ARQUIVO **NÃO** COBRE — e não dá para cobrir aqui
 *
 *  - ⛔ Constraint, trigger, FK e TRANSAÇÃO. O Prisma falso não tem nenhum dos
 *    quatro: ele NÃO prova a unique de `(subscriptionId, sequence)`, NÃO prova o
 *    bump de revisão de entitlement e NÃO prova o ROLLBACK. Só o banco real
 *    prova, e é para isso que o dry-run existe — rodá-lo é obrigatório antes do
 *    `--apply`.
 *  - ⛔ Que os IDS de assinatura e fatura existam em produção. Vieram de
 *    levantamento read-only aprovado; conferir exigiria consultar o banco.
 *  - ⛔ Que a foto do falso corresponda à realidade de hoje. Ela transcreve o
 *    doc de 2026-07-30; se produção tiver derivado, é o dry-run que acusa.
 *  - ⛔ O comportamento do webhook do Asaas na corrida dos PIX vivos (Task 8,
 *    ainda pendente). O script só reduz a janela; não a fecha.
 *
 * Ou seja: isto cobre a ARITMÉTICA, a COERÊNCIA DO PLANO e o FLUXO. A prova
 * contra o schema real é o dry-run.
 */

// Vive em `src/lib/` (e não ao lado do script) porque o `include` do
// vitest.config.ts só varre `src/**` — um teste em `scripts/` nunca rodaria, e
// um teste que não roda é pior que teste nenhum.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bootstrap = require("../../scripts/bootstrap-billing-obligations.cjs") as {
  periodEndFrom: (previousEnd: Date, cycle: "MONTHLY" | "YEARLY") => Date;
  advisoryKeyForCompany: (companyId: string) => number;
  ultraPeriods: () => { sequence: number; periodStart: Date; periodEnd: Date }[];
  ULTRA_ANCHOR: Date;
  ULTRA_COURTESY_FROM: Date;
  ULTRA_COURTESY_UNTIL: Date;
  PLANO: {
    rotulo: string;
    subscriptionId: string;
    pagasEsperadas: number;
    esperado: { planNameLike?: string; status?: string; cycle?: string };
    obrigacoes: {
      sequence: number;
      periodStart: Date;
      periodEnd: Date;
      disposition: string;
      state: string;
      priceCents: number;
    }[];
    cortesias: { startsAt: Date; endsAt: Date | null; reason: string }[];
  }[];
  executar: (tx: unknown, modo: "dry-run" | "apply") => Promise<string[]>;
};

const U = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("réplica da aritmética de período vs. billing-clock real", () => {
  const casos: { previousEnd: string; cycle: "MONTHLY" | "YEARLY" }[] = [
    { previousEnd: "2026-05-01", cycle: "MONTHLY" },
    { previousEnd: "2026-02-24", cycle: "YEARLY" },
    // Fim de mês: os casos em que `setMonth` cru estouraria o mês.
    { previousEnd: "2026-01-31", cycle: "MONTHLY" },
    { previousEnd: "2026-03-31", cycle: "MONTHLY" },
    { previousEnd: "2026-05-31", cycle: "MONTHLY" },
    { previousEnd: "2026-08-31", cycle: "MONTHLY" },
    // Bissexto e virada de ano.
    { previousEnd: "2024-02-29", cycle: "YEARLY" },
    { previousEnd: "2026-12-01", cycle: "MONTHLY" },
    { previousEnd: "2026-12-31", cycle: "MONTHLY" },
  ];

  it.each(casos)(
    "$previousEnd + $cycle bate com nextPeriod()",
    ({ previousEnd, cycle }) => {
      const esperado = nextPeriod({ previousEnd: U(previousEnd), cycle }).periodEnd;
      expect(bootstrap.periodEndFrom(U(previousEnd), cycle).toISOString()).toBe(
        esperado.toISOString(),
      );
    },
  );

  it("recusa data inválida, como o billing-clock", () => {
    expect(() => bootstrap.periodEndFrom(new Date("nada"), "MONTHLY")).toThrow();
  });

  it("recusa ciclo desconhecido em vez de virar NaN silencioso", () => {
    expect(() =>
      bootstrap.periodEndFrom(U("2026-05-01"), "QUARTERLY" as "MONTHLY"),
    ).toThrow(/ciclo/i);
  });
});

describe("réplica da chave de advisory lock vs. a do motor", () => {
  // Se estas divergirem, o script e o motor travariam em chaves diferentes e o
  // lock não protegeria nada — as duas transações passariam juntas.
  const ids = [
    "cmm1993ga000c90ezc38kk28n",
    "cmn8ww0yy0008m25s5avfmk23",
    "cmryty1d1008ewikgogat8gtv",
    "cms18lj5800034z37xamv6ez5",
    "",
    "a",
  ];
  it.each(ids)("chave de %s é idêntica à do motor", (id) => {
    expect(bootstrap.advisoryKeyForCompany(id)).toBe(keyReal(id));
  });
});

describe("períodos da Óticas Ultra", () => {
  const periodos = bootstrap.ultraPeriods();

  it("são 8: maio (pago) + 7 de cortesia (jun→dez), como o doc aprovado", () => {
    expect(periodos).toHaveLength(8);
  });

  it("começam na âncora aprovada (01/05/2026)", () => {
    expect(periodos[0].periodStart.toISOString()).toBe(
      bootstrap.ULTRA_ANCHOR.toISOString(),
    );
  });

  it("são CONTÍGUOS pelo isContiguous REAL — sem buraco nem sobreposição", () => {
    expect(isContiguous(periodos)).toBe(true);
  });

  it("o primeiro período de cortesia começa exatamente onde a cortesia começa", () => {
    // É isto que a retificação de redação garante: o fim do período de maio é
    // o MESMO instante em que a concessão passa a valer.
    expect(periodos[0].periodEnd.toISOString()).toBe(
      bootstrap.ULTRA_COURTESY_FROM.toISOString(),
    );
    expect(periodos[1].periodStart.toISOString()).toBe(
      bootstrap.ULTRA_COURTESY_FROM.toISOString(),
    );
  });

  it("o último período coberto é dezembro, fechando em 01/01/2027", () => {
    const ultimo = periodos[periodos.length - 1];
    expect(ultimo.periodStart.toISOString()).toBe(U("2026-12-01").toISOString());
    expect(ultimo.periodEnd.toISOString()).toBe(U("2027-01-01").toISOString());
  });

  it("mantêm a âncora no dia 1º — nenhum drift para o dia 30", () => {
    for (const p of periodos) {
      expect(p.periodStart.getUTCDate()).toBe(1);
      expect(p.periodEnd.getUTCDate()).toBe(1);
    }
  });

  it("nenhum período começa em/depois do fim da cortesia (jan/2027 fica de fora)", () => {
    const forA = periodos.filter(
      (p) => p.periodStart.getTime() >= bootstrap.ULTRA_COURTESY_UNTIL.getTime(),
    );
    expect(forA).toHaveLength(0);
  });
});

describe("a retificação 31/05 → 01/06 é a leitura correta (prova pelo resolvedor REAL)", () => {
  const cortesiaAprovada = [
    {
      startsAt: bootstrap.ULTRA_COURTESY_FROM,
      endsAt: bootstrap.ULTRA_COURTESY_UNTIL,
      revokedAt: null,
    },
  ];

  it("com o limite 01/06, o período de junho resolve COURTESY", () => {
    const periodos = bootstrap.ultraPeriods();
    expect(
      resolveObligationDisposition({
        periodStart: periodos[1].periodStart,
        planPriceMonthly: 14990,
        courtesies: cortesiaAprovada,
      }),
    ).toBe("COURTESY");
  });

  it("todos os 7 períodos de cortesia resolvem COURTESY", () => {
    const periodos = bootstrap.ultraPeriods().slice(1);
    for (const p of periodos) {
      expect(
        resolveObligationDisposition({
          periodStart: p.periodStart,
          planPriceMonthly: 14990,
          courtesies: cortesiaAprovada,
        }),
      ).toBe("COURTESY");
    }
  });

  it("🔥 a leitura LITERAL (31/05) faria o cliente isentado ser COBRADO", () => {
    // Encadeando de 31/05, a seq 2 começaria em 31/05 — ANTES de a cortesia
    // começar (01/06). O resolvedor exige `startsAt <= periodStart`, então a
    // obrigação sairia CHARGE. É o oposto da decisão aprovada, e a razão de a
    // retificação não ser cosmética.
    expect(
      resolveObligationDisposition({
        periodStart: U("2026-05-31"),
        planPriceMonthly: 14990,
        courtesies: cortesiaAprovada,
      }),
    ).toBe("CHARGE");
  });

  it("🔥 a leitura LITERAL também quebraria a contiguidade", () => {
    expect(
      isContiguous([
        { periodStart: U("2026-05-01"), periodEnd: U("2026-05-31") },
        { periodStart: U("2026-06-01"), periodEnd: U("2026-07-01") },
      ]),
    ).toBe(false);
  });

  it("o período de dezembro fica coberto porque endsAt é EXCLUSIVO (01/01/2027)", () => {
    expect(
      resolveObligationDisposition({
        periodStart: U("2026-12-01"),
        planPriceMonthly: 14990,
        courtesies: cortesiaAprovada,
      }),
    ).toBe("COURTESY");
  });

  it("janeiro/2027 volta a ser CHARGE — o motor retoma a cobrança sozinho", () => {
    expect(
      resolveObligationDisposition({
        periodStart: U("2027-01-01"),
        planPriceMonthly: 14990,
        courtesies: cortesiaAprovada,
      }),
    ).toBe("CHARGE");
  });
});

describe("receita não faturada bate com o documento aprovado", () => {
  const somaCortesia = (rotulo: string) =>
    bootstrap.PLANO.find((a) => a.rotulo === rotulo)!
      .obrigacoes.filter((o) => o.disposition === "COURTESY")
      .reduce((acc, o) => acc + o.priceCents, 0);

  it("Óticas Ultra: R$ 1.049,30 (7 × R$ 149,90)", () => {
    expect(somaCortesia("Óticas Ultra")).toBe(104_930);
  });

  it("Óticas Atacadão: R$ 1.499,00 (valor cheio do anual)", () => {
    expect(somaCortesia("Óticas Atacadão")).toBe(149_900);
  });
});

describe("invariantes estruturais do PLANO declarado", () => {
  it("nenhuma obrigação isenta nasce PLANNED (isso TRAVA a assinatura)", () => {
    for (const alvo of bootstrap.PLANO) {
      for (const o of alvo.obrigacoes) {
        const isenta =
          o.disposition === "COURTESY" ||
          o.disposition === "INTERNAL" ||
          o.disposition === "LEGACY_WAIVED";
        if (isenta) expect(o.state).not.toBe("PLANNED");
      }
    }
  });

  it("toda isenta nasce PAID", () => {
    const isentas = bootstrap.PLANO.flatMap((a) =>
      a.obrigacoes.filter((o) => o.disposition === "COURTESY"),
    );
    expect(isentas.length).toBeGreaterThan(0);
    for (const o of isentas) expect(o.state).toBe("PAID");
  });

  it("sequências começam em 1 e não têm lacuna", () => {
    for (const alvo of bootstrap.PLANO) {
      const seqs = alvo.obrigacoes.map((o) => o.sequence).sort((a, b) => a - b);
      expect(seqs[0]).toBe(1);
      seqs.forEach((s, i) => expect(s).toBe(i + 1));
    }
  });

  it("todo período tem fim > início", () => {
    for (const alvo of bootstrap.PLANO) {
      for (const o of alvo.obrigacoes) {
        expect(o.periodEnd.getTime()).toBeGreaterThan(o.periodStart.getTime());
      }
    }
  });

  it("as obrigações de cada assinatura são contíguas (isContiguous real)", () => {
    for (const alvo of bootstrap.PLANO) {
      const ordenadas = [...alvo.obrigacoes].sort((a, b) => a.sequence - b.sequence);
      expect(isContiguous(ordenadas)).toBe(true);
    }
  });

  it("toda COURTESY do plano é coberta por uma cortesia declarada no MESMO plano", () => {
    // Fecha o furo de um ledger que afirma isenção sem a concessão que a
    // justifique. Usa o resolvedor REAL, não uma reimplementação.
    for (const alvo of bootstrap.PLANO) {
      const courtesies = alvo.cortesias.map((c) => ({
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        revokedAt: null,
      }));
      for (const o of alvo.obrigacoes) {
        if (o.disposition !== "COURTESY") continue;
        expect(
          resolveObligationDisposition({
            periodStart: o.periodStart,
            planPriceMonthly: 14990,
            courtesies,
          }),
        ).toBe("COURTESY");
      }
    }
  });

  it("as 4 assinaturas aprovadas estão no plano, e só elas", () => {
    expect(bootstrap.PLANO.map((a) => a.subscriptionId).sort()).toEqual(
      [
        "cmm1993ga000c90ezc38kk28n",
        "cmn8ww0yy0008m25s5avfmk23",
        "cmryty1d1008ewikgogat8gtv",
        "cms18lj5800034z37xamv6ez5",
      ].sort(),
    );
  });

  it("declara quantas faturas PAGAS o doc aprovado prevê em cada alvo", () => {
    // É o que transforma "apareceu uma paga na Atacadão" em drift abortado, em
    // vez de o script tentar vinculá-la sozinho.
    const porRotulo = Object.fromEntries(
      bootstrap.PLANO.map((a) => [a.rotulo, a.pagasEsperadas]),
    );
    expect(porRotulo["Óticas Atacadão"]).toBe(0);
    expect(porRotulo["Óticas Ultra"]).toBe(1);
  });

  it("os alvos óticos exigem identidade do plano, não só o preço", () => {
    for (const rotulo of ["Óticas Atacadão", "Óticas Ultra"]) {
      const alvo = bootstrap.PLANO.find((a) => a.rotulo === rotulo)!;
      expect(alvo.esperado.planNameLike).toBe("Básico");
    }
  });

  it("as duas obrigações ISSUED são as dos PIX vivos, com os valores aprovados", () => {
    const issued = bootstrap.PLANO.flatMap((a) =>
      a.obrigacoes.filter((o) => o.state === "ISSUED"),
    );
    expect(issued).toHaveLength(2);
    expect(issued.map((o) => o.priceCents).sort((a, b) => a - b)).toEqual([8990, 18990]);
    for (const o of issued) expect(o.disposition).toBe("CHARGE");
  });
});

// ---------------------------------------------------------------------------
// Fluxo COMPLETO contra um Prisma falso em memória.
//
// ⚠️ LIMITE HONESTO: o falso NÃO tem constraint, trigger, FK nem transação. Ele
// NÃO prova unicidade de `(subscriptionId, sequence)`, não prova o bump de
// entitlement e não prova rollback — só o banco real prova isso, e é para isso
// que o dry-run existe.
//
// O que ele PROVA, e que nenhum teste puro pegava: que `executar()` percorre a
// foto aprovada de ponta a ponta SEM ABORTAR, produz exatamente as 11 obrigações
// e 2 cortesias esperadas, é NO-OP na segunda execução, e que cada guarda de
// drift realmente aborta quando o banco divergir. Era aqui que morava o defeito
// que fazia o dry-run falhar sempre.
// ---------------------------------------------------------------------------

const PLAN_BASICO = {
  id: "plan-basico",
  name: "Básico",
  priceMonthly: 14990,
  priceYearly: 149900,
};
const PLAN_MED_A = {
  id: "plan-med-a",
  name: "Medical Plus",
  priceMonthly: 18990,
  priceYearly: 189900,
};
const PLAN_MED_B = {
  id: "plan-med-b",
  name: "Medical Base",
  priceMonthly: 8990,
  priceYearly: 89900,
};

/** A foto de produção de 2026-07-30 descrita no documento aprovado. */
function fotoAprovada() {
  const subs: Record<string, Record<string, unknown>> = {
    cmm1993ga000c90ezc38kk28n: {
      id: "cmm1993ga000c90ezc38kk28n",
      companyId: "co-atacadao",
      planId: PLAN_BASICO.id,
      status: "ACTIVE",
      billingCycle: "YEARLY",
      plan: PLAN_BASICO,
      company: { name: "Óticas Atacadão" },
    },
    cmn8ww0yy0008m25s5avfmk23: {
      id: "cmn8ww0yy0008m25s5avfmk23",
      companyId: "co-ultra",
      planId: PLAN_BASICO.id,
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      plan: PLAN_BASICO,
      company: { name: "Óticas Ultra" },
    },
    cmryty1d1008ewikgogat8gtv: {
      id: "cmryty1d1008ewikgogat8gtv",
      companyId: "co-teste",
      planId: PLAN_MED_A.id,
      status: "TRIAL",
      billingCycle: "MONTHLY",
      plan: PLAN_MED_A,
      company: { name: "TESTE" },
    },
    cms18lj5800034z37xamv6ez5: {
      id: "cms18lj5800034z37xamv6ez5",
      companyId: "co-medfacil",
      planId: PLAN_MED_B.id,
      status: "TRIAL",
      billingCycle: "MONTHLY",
      plan: PLAN_MED_B,
      company: { name: "MedFacil" },
    },
  };

  const inv = (o: Record<string, unknown>) => ({
    asaasPaymentId: null,
    paidAt: null,
    billingObligationId: null,
    isManual: false,
    ...o,
  });

  // As 8 faturas da foto.
  const invoices: Record<string, unknown>[] = [
    inv({ id: "inv-ata-1", number: "INV-000101", subscriptionId: "cmm1993ga000c90ezc38kk28n", status: "PENDING", total: 14990, issuedAt: U("2026-06-01"), periodStart: U("2026-06-01"), periodEnd: U("2026-07-01") }),
    inv({ id: "inv-ata-2", number: "INV-000102", subscriptionId: "cmm1993ga000c90ezc38kk28n", status: "PENDING", total: 14990, issuedAt: U("2026-06-01"), periodStart: U("2026-06-01"), periodEnd: U("2026-07-01") }),
    inv({ id: "inv-ata-3", number: "INV-000103", subscriptionId: "cmm1993ga000c90ezc38kk28n", status: "PENDING", total: 500, issuedAt: U("2026-03-01"), periodStart: U("2026-03-01"), periodEnd: U("2026-04-01") }),
    inv({ id: "inv-ata-4", number: "INV-000104", subscriptionId: "cmm1993ga000c90ezc38kk28n", status: "PENDING", total: 500, issuedAt: U("2026-04-01"), periodStart: U("2026-04-01"), periodEnd: U("2026-05-01") }),
    inv({ id: "inv-ultra-pago", number: "INV-000201", subscriptionId: "cmn8ww0yy0008m25s5avfmk23", status: "PAID", total: 9990, paidAt: U("2026-05-06"), issuedAt: U("2026-05-01"), periodStart: U("2026-05-01"), periodEnd: U("2026-06-01") }),
    inv({ id: "inv-ultra-jun", number: "INV-000202", subscriptionId: "cmn8ww0yy0008m25s5avfmk23", status: "PENDING", total: 14990, issuedAt: U("2026-06-01"), periodStart: U("2026-06-01"), periodEnd: U("2026-07-01") }),
    inv({ id: "cms4vwe7b001c10quxzva1ww3", number: "INV-000301", subscriptionId: "cmryty1d1008ewikgogat8gtv", status: "PENDING", total: 18990, asaasPaymentId: "pay_eo8jup3l0gd7b1b5", issuedAt: U("2026-07-28"), periodStart: U("2026-08-07"), periodEnd: U("2026-09-07") }),
    inv({ id: "cms50bzgu000cq2snrim3kcyw", number: "INV-000401", subscriptionId: "cms18lj5800034z37xamv6ez5", status: "PENDING", total: 8990, asaasPaymentId: "pay_805aqzhcpooy0f9d", issuedAt: U("2026-07-28"), periodStart: U("2026-08-09"), periodEnd: U("2026-09-09") }),
  ];

  return { subs, invoices };
}

/** Prisma falso: o mínimo de semântica de `where` que o script usa. */
function fakeTx(foto: ReturnType<typeof fotoAprovada>) {
  const { subs, invoices } = foto;
  const obligations: Record<string, unknown>[] = [];
  const courtesies: Record<string, unknown>[] = [];
  let n = 0;

  const eq = (a: unknown, b: unknown) =>
    a instanceof Date ? a.getTime() === (b as Date)?.getTime?.() : a === b;

  const match = (row: Record<string, any>, where: Record<string, any> = {}) => {
    for (const [k, v] of Object.entries(where)) {
      if (k === "subscription") {
        if ((subs[row.subscriptionId] as any)?.companyId !== v.companyId) return false;
        continue;
      }
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v && !v.in.includes(row[k])) return false;
        if ("lt" in v && !(row[k] < v.lt)) return false;
        if ("gt" in v && !(row[k] > v.gt)) return false;
        continue;
      }
      if (v === null) {
        if (row[k] !== null && row[k] !== undefined) return false;
        continue;
      }
      if (!eq(v, row[k])) return false;
    }
    return true;
  };

  return {
    obligations,
    courtesies,
    tx: {
      $executeRaw: async () => 1,
      subscription: { findUnique: async ({ where }: any) => subs[where.id] ?? null },
      invoice: {
        findMany: async ({ where }: any) => invoices.filter((i) => match(i, where)),
        findUnique: async ({ where }: any) => invoices.find((i: any) => i.id === where.id) ?? null,
        update: async ({ where, data }: any) => {
          const i: any = invoices.find((x: any) => x.id === where.id);
          Object.assign(i, data);
          return i;
        },
      },
      billingObligation: {
        findUnique: async ({ where }: any) => {
          if (where.subscriptionId_sequence) {
            const { subscriptionId, sequence } = where.subscriptionId_sequence;
            return (
              obligations.find(
                (o: any) => o.subscriptionId === subscriptionId && o.sequence === sequence,
              ) ?? null
            );
          }
          return obligations.find((o: any) => o.id === where.id) ?? null;
        },
        findFirst: async ({ where }: any) => obligations.find((o) => match(o, where)) ?? null,
        findMany: async ({ where, orderBy }: any) => {
          let r = obligations.filter((o: any) =>
            where.id?.in ? where.id.in.includes(o.id) : match(o, where),
          );
          if (orderBy?.sequence === "asc") r = [...r].sort((a: any, b: any) => a.sequence - b.sequence);
          return r;
        },
        create: async ({ data }: any) => {
          if (
            obligations.some(
              (o: any) => o.subscriptionId === data.subscriptionId && o.sequence === data.sequence,
            )
          ) {
            throw new Error("Unique constraint failed (subscriptionId, sequence)");
          }
          const row = {
            id: `ob-${++n}`,
            voidReason: null,
            invoiceId: null,
            issuedAt: null,
            dueAt: null,
            paidAt: null,
            ...data,
          };
          obligations.push(row);
          return row;
        },
        update: async ({ where, data }: any) => {
          const o: any = obligations.find((x: any) => x.id === where.id);
          Object.assign(o, data);
          return o;
        },
      },
      subscriptionCourtesy: {
        findMany: async ({ where }: any) => courtesies.filter((c) => match(c, where)),
        create: async ({ data }: any) => {
          const row = { id: `co-${++n}`, endsAt: null, revokedAt: null, ...data };
          courtesies.push(row);
          return row;
        },
      },
    },
  };
}

describe("fluxo completo sobre a foto aprovada (Prisma falso em memória)", () => {
  it("percorre as 4 assinaturas sem abortar e passa o gate de commit", async () => {
    const { tx, obligations, courtesies } = fakeTx(fotoAprovada());
    const acoes: string[] = await bootstrap.executar(tx, "dry-run");

    expect(acoes.join("\n")).toContain("GATE DE COMMIT");
    // 1 (Atacadão) + 8 (Ultra) + 1 (TESTE) + 1 (MedFacil)
    expect(obligations).toHaveLength(11);
    expect(courtesies).toHaveLength(2);
  });

  it("registra a receita não faturada que o documento aprovado declara", async () => {
    const { tx } = fakeTx(fotoAprovada());
    const acoes: string[] = await bootstrap.executar(tx, "dry-run");
    const texto = acoes.join("\n");
    expect(texto).toContain("Óticas Ultra: receita não faturada R$ 1.049,30");
    expect(texto).toContain("Óticas Atacadão: receita não faturada R$ 1.499,00");
  });

  it("é NO-OP na segunda execução (idempotência por comparação exata)", async () => {
    const foto = fotoAprovada();
    const { tx, obligations, courtesies } = fakeTx(foto);
    await bootstrap.executar(tx, "dry-run");

    const acoes2: string[] = await bootstrap.executar(tx, "dry-run");
    // Nenhuma criação (`+ `) nem cancelamento (`✂`) na segunda passada.
    expect(acoes2.filter((l) => l.includes("+ ") || l.includes("✂"))).toEqual([]);
    expect(obligations).toHaveLength(11);
    expect(courtesies).toHaveLength(2);
  });

  it("as isentas nascem PAID, sem issuedAt/dueAt (não restringem por I1)", async () => {
    const { tx, obligations } = fakeTx(fotoAprovada());
    await bootstrap.executar(tx, "dry-run");
    const isentas = obligations.filter((o: any) => o.disposition === "COURTESY");
    expect(isentas.length).toBe(8); // 1 Atacadão + 7 Ultra
    for (const o of isentas as any[]) {
      expect(o.state).toBe("PAID");
      expect(o.issuedAt).toBeNull();
      expect(o.dueAt).toBeNull();
      expect(o.paidAt).not.toBeNull();
    }
  });

  it("a obrigação de maio da Ultra recebe o paidAt REAL da fatura paga", async () => {
    const { tx, obligations } = fakeTx(fotoAprovada());
    await bootstrap.executar(tx, "dry-run");
    const maio: any = obligations.find(
      (o: any) => o.subscriptionId === "cmn8ww0yy0008m25s5avfmk23" && o.sequence === 1,
    );
    // 06/05, da fatura — não 01/05, que era o fallback do período.
    expect(maio.paidAt.toISOString()).toBe(U("2026-05-06").toISOString());
    expect(maio.invoiceId).toBe("inv-ultra-pago");
    expect(maio.priceCents).toBe(9990);
  });

  it("as ISSUED recebem issuedAt da fatura e dueAt = início do período", async () => {
    const { tx, obligations } = fakeTx(fotoAprovada());
    await bootstrap.executar(tx, "dry-run");
    const issued = obligations.filter((o: any) => o.state === "ISSUED") as any[];
    expect(issued).toHaveLength(2);
    for (const o of issued) {
      // `issuedAt` é o da cobrança que já existe (28/07), nunca "agora".
      expect(o.issuedAt.toISOString()).toBe(U("2026-07-28").toISOString());
      expect(o.dueAt.toISOString()).toBe(o.periodStart.toISOString());
      expect(o.invoiceId).toBeTruthy();
    }
  });

  it("cancela o lixo da Atacadão e a de junho da Ultra, e NÃO a paga", async () => {
    const foto = fotoAprovada();
    const { tx } = fakeTx(foto);
    await bootstrap.executar(tx, "dry-run");
    const porNumero = Object.fromEntries(
      foto.invoices.map((i: any) => [i.number, i.status]),
    );
    expect(porNumero["INV-000101"]).toBe("CANCELED");
    expect(porNumero["INV-000102"]).toBe("CANCELED");
    expect(porNumero["INV-000103"]).toBe("CANCELED");
    expect(porNumero["INV-000104"]).toBe("CANCELED");
    expect(porNumero["INV-000202"]).toBe("CANCELED");
    // Dinheiro que entrou continua PAID.
    expect(porNumero["INV-000201"]).toBe("PAID");
    // Os PIX vivos seguem PENDING — o script não mexe em cobrança em curso.
    expect(porNumero["INV-000301"]).toBe("PENDING");
    expect(porNumero["INV-000401"]).toBe("PENDING");
  });
});

describe("guardas de drift abortam em vez de se adaptar", () => {
  it("🔥 PIX já PAGO aborta — obrigação ISSUED restringiria quem pagou (I1)", async () => {
    const foto = fotoAprovada();
    const pix: any = foto.invoices.find((i: any) => i.number === "INV-000301");
    pix.status = "PAID";
    pix.paidAt = U("2026-07-29");
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /não está no estado aprovado[\s\S]*PAID/,
    );
  });

  it("plano trocado aborta", async () => {
    const foto = fotoAprovada();
    (foto.subs.cmm1993ga000c90ezc38kk28n as any).plan = {
      ...PLAN_BASICO,
      name: "Premium",
    };
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /DIVERGE[\s\S]*Básico/,
    );
  });

  it("status da assinatura mudado aborta", async () => {
    const foto = fotoAprovada();
    (foto.subs.cmn8ww0yy0008m25s5avfmk23 as any).status = "CANCELED";
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /status esperado ACTIVE, encontrado CANCELED/,
    );
  });

  it("fatura PAGA onde o doc diz que não há nenhuma aborta", async () => {
    const foto = fotoAprovada();
    const i: any = foto.invoices.find((x: any) => x.number === "INV-000103");
    i.status = "PAID";
    i.paidAt = U("2026-03-05");
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /prevê 0 fatura\(s\) PAGA\(s\), mas o banco tem 1/,
    );
  });

  it("fatura PAGA que DESAPARECEU também aborta (o inverso, que passava por vacuidade)", async () => {
    // A da Ultra é a única paga da foto. Se ela for estornada/cancelada à mão, o
    // script não pode seguir gravando `paidAt` afirmando um pagamento que não
    // existe mais.
    const foto = fotoAprovada();
    const i: any = foto.invoices.find((x: any) => x.number === "INV-000201");
    i.status = "CANCELED";
    i.paidAt = null;
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /prevê 1 fatura\(s\) PAGA\(s\), mas o banco tem 0/,
    );
  });

  it("🔥 fatura a cancelar com cobrança viva no Asaas aborta (não dá para neutralizar só no banco)", async () => {
    const foto = fotoAprovada();
    const i: any = foto.invoices.find((x: any) => x.number === "INV-000101");
    i.asaasPaymentId = "pay_vivo_perigoso";
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /TÊM cobrança no Asaas/,
    );
  });

  it("fatura MANUAL viva aborta em vez de ser cancelada à revelia", async () => {
    const foto = fotoAprovada();
    const i: any = foto.invoices.find((x: any) => x.number === "INV-000104");
    i.isManual = true;
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /são MANUAIS[\s\S]*INV-000104/,
    );
  });

  it("assinatura inexistente aborta (banco errado)", async () => {
    const foto = fotoAprovada();
    delete foto.subs.cms18lj5800034z37xamv6ez5;
    const { tx } = fakeTx(foto);
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(/NÃO existe neste banco/);
  });

  it("obrigação preexistente DIVERGENTE aborta em vez de virar no-op", async () => {
    const foto = fotoAprovada();
    const { tx, obligations } = fakeTx(foto);
    // Alguém já criou a seq 1 da Atacadão com o preço errado.
    obligations.push({
      id: "ob-torta",
      subscriptionId: "cmm1993ga000c90ezc38kk28n",
      sequence: 1,
      periodStart: U("2026-02-24"),
      periodEnd: U("2027-02-24"),
      planId: PLAN_BASICO.id,
      cycle: "YEARLY",
      priceCents: 1,
      disposition: "COURTESY",
      state: "PAID",
      invoiceId: null,
      issuedAt: null,
      dueAt: null,
      paidAt: U("2026-02-24"),
      voidReason: null,
    });
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /JÁ EXISTE e diverge do aprovado[\s\S]*priceCents/,
    );
  });

  it("🔥 isenta preexistente com issuedAt/dueAt aborta (restringiria por I1)", async () => {
    const foto = fotoAprovada();
    const { tx, obligations } = fakeTx(foto);
    obligations.push({
      id: "ob-i1",
      subscriptionId: "cmm1993ga000c90ezc38kk28n",
      sequence: 1,
      periodStart: U("2026-02-24"),
      periodEnd: U("2027-02-24"),
      planId: PLAN_BASICO.id,
      cycle: "YEARLY",
      priceCents: 149900,
      disposition: "COURTESY",
      state: "PAID",
      invoiceId: null,
      // O veneno: isenta carimbada como emitida e vencida.
      issuedAt: U("2026-02-24"),
      dueAt: U("2026-02-24"),
      paidAt: U("2026-02-24"),
      voidReason: null,
    });
    await expect(bootstrap.executar(tx, "dry-run")).rejects.toThrow(
      /isenta COM issuedAt\/dueAt/,
    );
  });
});
