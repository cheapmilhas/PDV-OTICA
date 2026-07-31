import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));

import {
  applyContractChangeToObligations,
  type RecalcDbClient,
} from "@/services/obligation-recalc.service";
import { KEEP_DECISION_PREFIX, type ContractChange } from "@/lib/obligation-recalc";

/**
 * Testes do serviço que APLICA a decisão de recálculo (Task 9 do Plano B).
 *
 * ## O que este arquivo prova
 *
 * O que o módulo puro não pode provar sozinho: que a escrita certa vai para a
 * coluna certa sob o CAS certo, que o escopo de tenant está no `where`, que a
 * obrigação já emitida NUNCA tem preço nem estado mexidos, e que o alerta chega
 * ao operador.
 *
 * ## O que ele NÃO cobre — e não dá para cobrir aqui
 *
 * ⛔ Constraint, trigger, FK e transação: o Prisma falso não tem nenhum dos
 * quatro. Ele registra os `where`/`data` que o serviço mandaria e simula o efeito
 * do `updateMany` sobre um estado em memória; ele NÃO prova que o Postgres
 * aplicaria o mesmo. Em compensação, é o único jeito de exercitar este caminho
 * sem tocar o banco de PRODUÇÃO (o `.env` local aponta para lá) e sem nenhuma
 * chance de alcançar o gateway.
 */

const COMPANY_ID = "co-1";
const SUB_ID = "sub-1";
const PLANO_ANTIGO = "plan-basico";
const PLANO_NOVO = "plan-pro";
const PERIODO_START = new Date("2026-10-04T00:00:00Z");
const PERIODO_END = new Date("2026-11-04T00:00:00Z");

interface ObligationRow {
  id: string;
  subscriptionId: string;
  companyId: string;
  sequence: number;
  state: string;
  disposition: string;
  planId: string;
  periodStart: Date;
  periodEnd: Date;
  priceCents: number;
  dueAt: Date | null;
  voidReason: string | null;
}

let obligations: ObligationRow[];
let systemEvents: Array<Record<string, unknown>>;
const findManyArgs = vi.fn();
const updateManyArgs = vi.fn();

function obligationRow(over: Partial<ObligationRow> = {}): ObligationRow {
  return {
    id: "obl-1",
    subscriptionId: SUB_ID,
    companyId: COMPANY_ID,
    sequence: 1,
    state: "PLANNED",
    disposition: "CHARGE",
    planId: PLANO_ANTIGO,
    periodStart: PERIODO_START,
    periodEnd: PERIODO_END,
    priceCents: 18990,
    dueAt: PERIODO_START,
    voidReason: null,
    ...over,
  };
}

/**
 * Prisma falso com estado, injetado por `RecalcDbClient` — a interface ESTREITA
 * que o serviço declara (só os três métodos que ele de fato chama). Se o serviço
 * passar a chamar um quarto, o teste quebra, que é o comportamento desejado.
 *
 * As implementações vivem em `vi.fn()` porque os tipos de retorno do Prisma
 * (`Prisma__BillingObligationClient`, com `then`/`catch`/`$transaction`) são
 * grandes demais para reconstruir à mão, e reconstruí-los à mão só para
 * satisfazer a assinatura não provaria nada a mais. O que importa — a FORMA de
 * `where` e `data` — continua conferida: `applyContractChangeToObligations` só
 * aceita `RecalcDbClient`, cujos métodos são os do `prisma` REAL.
 *
 * Sem `as never`/`as any` no corpo dos duplos, pelo mesmo motivo de
 * `overdue-obligation-sweep.service.test.ts`: um `as` ali desligaria a checagem
 * exatamente onde ela protege, e este repo já teve um typo passar assim.
 */
/**
 * Simula uma escrita CONCORRENTE que chega entre o `findMany` e o `updateMany`
 * do serviço — o cron emitindo, ou o webhook confirmando o pagamento. É a única
 * forma de exercitar as duas corridas sem banco de verdade, e elas são
 * exatamente onde um `update` cego causaria dano irreversível.
 */
type CorridaAntesDaEscrita = () => void;

function makePrisma(corrida?: CorridaAntesDaEscrita): RecalcDbClient {
  const findMany = vi.fn(async (args: { where: Record<string, unknown>; orderBy?: { sequence?: "asc" | "desc" } }) => {
    findManyArgs(args);
    const where = args.where as {
      subscriptionId?: string;
      subscription?: { companyId?: string };
      state?: { in?: string[] };
    };
    const rows = obligations.filter((o) => {
      if (where.subscriptionId && o.subscriptionId !== where.subscriptionId) return false;
      // 🔑 O ESCOPO DE TENANT É SIMULADO DE VERDADE: sem o
      // `subscription: { companyId }` no `where`, este filtro não roda e as
      // obrigações de outra empresa aparecem.
      if (where.subscription?.companyId && o.companyId !== where.subscription.companyId) {
        return false;
      }
      if (where.state?.in && !where.state.in.includes(o.state)) return false;
      return true;
    });
    const asc = args.orderBy?.sequence !== "desc";
    return [...rows]
      .sort((a, b) => (asc ? a.sequence - b.sequence : b.sequence - a.sequence))
      .map((o) => ({ ...o }));
  });

  const updateMany = vi.fn(
    async (args: { where: { id?: string; state?: string }; data: Record<string, unknown> }) => {
      updateManyArgs(args);
      // A escrita concorrente acontece ANTES da nossa, como em produção: o CAS
      // abaixo é quem tem que perceber.
      corrida?.();
      const alvo = obligations.filter(
        (o) =>
          (args.where.id === undefined || o.id === args.where.id) &&
          // O CAS de estado é REAL neste duplo: é ele que separa
          // "ainda PLANNED" de "o cron emitiu no meio do caminho".
          (args.where.state === undefined || o.state === args.where.state),
      );
      for (const row of alvo) Object.assign(row, args.data);
      return { count: alvo.length };
    },
  );

  const upsert = vi.fn(
    async (args: { where: { dedupeKey: string }; create: Record<string, unknown> }) => {
      const existente = systemEvents.find((e) => e.dedupeKey === args.where.dedupeKey);
      if (existente) return existente;
      const novo = { ...args.create };
      systemEvents.push(novo);
      return novo;
    },
  );

  return {
    billingObligation: {
      findMany: findMany as unknown as RecalcDbClient["billingObligation"]["findMany"],
      updateMany: updateMany as unknown as RecalcDbClient["billingObligation"]["updateMany"],
    },
    systemEvent: { upsert: upsert as unknown as RecalcDbClient["systemEvent"]["upsert"] },
  };
}

/**
 * Método de banco que sempre falha. Genérico em `T` para casar com a assinatura
 * de qualquer método do `RecalcDbClient` sem enfraquecer o tipo do cliente
 * inteiro: quem recebe continua sendo um `RecalcDbClient` de verdade.
 */
function quebrado<T>(mensagem: string): T {
  const fn = async () => {
    throw new Error(mensagem);
  };
  return fn as unknown as T;
}

const TROCA: ContractChange = {
  kind: "plan_change",
  fromPlanId: PLANO_ANTIGO,
  toPlanId: PLANO_NOVO,
};

function run(change: ContractChange = TROCA, prisma: RecalcDbClient = makePrisma()) {
  return applyContractChangeToObligations(SUB_ID, COMPANY_ID, change, {
    prismaClient: prisma,
  });
}

beforeEach(() => {
  obligations = [];
  systemEvents = [];
  findManyArgs.mockClear();
  updateManyArgs.mockClear();
});

describe("applyContractChangeToObligations — troca de plano", () => {
  it("PLANNED: invalida o congelamento (dueAt) e NÃO reescreve preço nem plano", () => {
    // 🔑 O CORAÇÃO DO DESENHO. O recálculo é um HANDOFF para a fase 2 do motor,
    // que é a única escritora de `priceCents`/`planId` e a única que roda sob o
    // advisory lock. Se este serviço escrevesse esses campos, teríamos dois
    // escritores da mesma coluna com leituras diferentes — a quarta divergência
    // desta branch.
    obligations = [obligationRow()];

    return run().then((outcome) => {
      expect(outcome.kind).toBe("applied");
      if (outcome.kind !== "applied") throw new Error("ramo errado");
      expect(outcome.recalculadas).toHaveLength(1);
      expect(outcome.mantidas).toHaveLength(0);

      const row = obligations[0];
      expect(row.dueAt).toBeNull();
      expect(row.priceCents).toBe(18990); // intocado
      expect(row.planId).toBe(PLANO_ANTIGO); // intocado — a fase 2 regrava
      expect(row.state).toBe("PLANNED"); // intocado
      expect(row.disposition).toBe("CHARGE"); // intocado

      // E o CAS de estado tem que estar no `where`: sem ele, uma obrigação que o
      // cron emitiu entre a leitura e a escrita perderia o `dueAt` de uma
      // cobrança já viva no gateway.
      const chamada = updateManyArgs.mock.calls[0][0];
      expect(chamada.where.state).toBe("PLANNED");
    });
  });

  it("🚨 ISSUED: registra a decisão em voidReason, alerta, e NÃO muda estado nem preço", async () => {
    obligations = [obligationRow({ state: "ISSUED", dueAt: PERIODO_START })];

    const outcome = await run();

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.mantidas).toHaveLength(1);
    expect(outcome.recalculadas).toHaveLength(0);

    const row = obligations[0];
    // A cobrança existe no gateway: nada que a descreva pode mudar.
    expect(row.state).toBe("ISSUED");
    expect(row.priceCents).toBe(18990);
    expect(row.planId).toBe(PLANO_ANTIGO);
    expect(row.dueAt).toEqual(PERIODO_START);
    // Só a DECISÃO é registrada — e prefixada, para não ser lida como anulação.
    expect(row.voidReason?.startsWith(KEEP_DECISION_PREFIX)).toBe(true);

    // E o operador é chamado, com severidade que o cron de saúde não auto-resolve.
    expect(systemEvents).toHaveLength(1);
    expect(systemEvents[0]).toMatchObject({ source: "billing", severity: "critical" });
    expect(String(systemEvents[0].dedupeKey)).not.toMatch(/:auto$/);
  });

  it("ISSUED: o alerta cita a empresa e a obrigação (sem isso o operador não acha)", async () => {
    obligations = [obligationRow({ state: "ISSUED", id: "obl-xyz" })];

    await run();

    expect(String(systemEvents[0].detail)).toContain(COMPANY_ID);
    expect(String(systemEvents[0].detail)).toContain("obl-xyz");
  });

  it("duas trocas seguidas sobre a MESMA obrigação emitida geram UM alerta", async () => {
    obligations = [obligationRow({ state: "ISSUED" })];
    const prisma = makePrisma();

    await run(TROCA, prisma);
    await run(TROCA, prisma);

    expect(systemEvents).toHaveLength(1);
  });

  it("PAID e VOID não são sequer lidas do banco", async () => {
    obligations = [
      obligationRow({ id: "paga", state: "PAID" }),
      obligationRow({ id: "anulada", sequence: 2, state: "VOID" }),
    ];

    const outcome = await run();

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.recalculadas).toHaveLength(0);
    expect(outcome.mantidas).toHaveLength(0);
    // A consulta filtra por estado em aberto: período encerrado não volta nem
    // como `inalteradas`.
    expect(outcome.inalteradas).toBe(0);
    expect(findManyArgs.mock.calls[0][0].where.state).toEqual({ in: ["PLANNED", "ISSUED"] });
  });

  it.each(["COURTESY", "INTERNAL", "LEGACY_WAIVED"])(
    "isenta %s em PLANNED sobrevive INTACTA — recalcular a travaria para sempre",
    async (disposition) => {
      obligations = [obligationRow({ disposition, dueAt: null })];

      const outcome = await run();

      expect(outcome.kind).toBe("applied");
      if (outcome.kind !== "applied") throw new Error("ramo errado");
      expect(outcome.inalteradas).toBe(1);
      expect(outcome.recalculadas).toHaveLength(0);
      // Nenhuma escrita: uma isenta PLANNED já é o bug da Task 5; o serviço não
      // pode nem tocá-la de raspão.
      expect(updateManyArgs).not.toHaveBeenCalled();
      expect(obligations[0].disposition).toBe(disposition);
      expect(obligations[0].state).toBe("PLANNED");
    },
  );

  it("🔒 obrigação de OUTRA empresa não é tocada (escopo de tenant)", async () => {
    // `billing_obligations` não tem `companyId` — o tenant é transitivo por
    // `subscriptionId`. Sem `subscription: { companyId }` no `where`, esta linha
    // seria reescrita.
    obligations = [obligationRow({ id: "de-outro-tenant", companyId: "co-INVASOR" })];

    const outcome = await run();

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.recalculadas).toHaveLength(0);
    expect(obligations[0].dueAt).toEqual(PERIODO_START); // intocada
    expect(findManyArgs.mock.calls[0][0].where.subscription).toEqual({ companyId: COMPANY_ID });
  });

  it("várias obrigações em aberto são processadas em ordem de sequence", async () => {
    obligations = [
      obligationRow({ id: "obl-2", sequence: 2 }),
      obligationRow({ id: "obl-1", sequence: 1 }),
    ];

    const outcome = await run();

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    // Ordem estável: o relatório do operador lê na ordem em que a linha do tempo
    // aconteceu, e o teste consegue afirmar sobre a lista.
    expect(outcome.recalculadas.map((r) => r.sequence)).toEqual([1, 2]);
  });

  it("CORRIDA: emitida entre a leitura e a escrita vira 'mantida', não perde o dueAt", async () => {
    // O cron emitiu a obrigação depois do `findMany`. Um `update` cego apagaria o
    // `dueAt` de uma cobrança que já foi ao gateway — o cliente com PIX na mão e
    // o sistema sem saber quando vence.
    obligations = [obligationRow()];
    let primeira = true;
    const prisma = makePrisma(() => {
      if (!primeira) return;
      primeira = false;
      obligations[0].state = "ISSUED"; // o cron chegou primeiro
    });

    const outcome = await applyContractChangeToObligations(SUB_ID, COMPANY_ID, TROCA, {
      prismaClient: prisma,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.recalculadas).toHaveLength(0);
    expect(outcome.mantidas).toHaveLength(1);
    expect(obligations[0].dueAt).toEqual(PERIODO_START); // NÃO foi apagado
    expect(systemEvents).toHaveLength(1); // e o operador foi avisado
  });

  it("CORRIDA: paga entre a leitura e a escrita não vira alerta nem carimbo", async () => {
    // "Pagou no meio do caminho" é desfecho BOM. Carimbar `voidReason` numa linha
    // `PAID` confundiria a leitura da Task 10, e alertar seria ruído.
    obligations = [obligationRow({ state: "ISSUED" })];
    const prisma = makePrisma(() => {
      obligations[0].state = "PAID"; // o webhook chegou primeiro
    });

    const outcome = await applyContractChangeToObligations(SUB_ID, COMPANY_ID, TROCA, {
      prismaClient: prisma,
    });

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.mantidas).toHaveLength(0);
    expect(outcome.inalteradas).toBe(1);
    expect(obligations[0].voidReason).toBeNull();
    expect(systemEvents).toHaveLength(0);
  });
});

describe("applyContractChangeToObligations — extensão de trial", () => {
  const ESTENDE: ContractChange = {
    kind: "trial_extension",
    oldTrialEndsAt: new Date("2026-10-04T00:00:00Z"),
    newTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
  };

  it("PLANNED do período que voltou a ser grátis é invalidada", async () => {
    obligations = [obligationRow()];

    const outcome = await run(ESTENDE);

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.recalculadas).toHaveLength(1);
    expect(obligations[0].dueAt).toBeNull();
  });

  it("🚨 ISSUED do período que voltou a ser grátis é mantida e alertada", async () => {
    obligations = [obligationRow({ state: "ISSUED" })];

    const outcome = await run(ESTENDE);

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.mantidas).toHaveLength(1);
    expect(obligations[0].state).toBe("ISSUED");
    expect(systemEvents[0].title).toContain("Trial");
  });

  it("troca de plano e extensão de trial sobre a MESMA obrigação alertam SEPARADO", async () => {
    // São dois problemas diferentes para o operador resolver; colapsá-los numa
    // dedupeKey só esconderia o segundo.
    obligations = [obligationRow({ state: "ISSUED" })];
    const prisma = makePrisma();

    await run(TROCA, prisma);
    await run(ESTENDE, prisma);

    expect(systemEvents).toHaveLength(2);
  });

  it("período fora da faixa grátis não é tocado", async () => {
    obligations = [
      obligationRow({
        periodStart: new Date("2026-11-04T00:00:00Z"),
        periodEnd: new Date("2026-12-04T00:00:00Z"),
      }),
    ];

    const outcome = await run(ESTENDE);

    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") throw new Error("ramo errado");
    expect(outcome.inalteradas).toBe(1);
    expect(updateManyArgs).not.toHaveBeenCalled();
  });
});

describe("applyContractChangeToObligations — nunca lança", () => {
  it("falha de banco vira outcome, não exceção (o contrato JÁ foi commitado)", async () => {
    // Se este serviço lançasse, a rota do admin devolveria 500 com o plano já
    // trocado — e o operador clicaria de novo achando que não aconteceu.
    const prisma: RecalcDbClient = {
      ...makePrisma(),
      billingObligation: {
        ...makePrisma().billingObligation,
        findMany: quebrado("conexão caiu"),
      },
    };

    const outcome = await applyContractChangeToObligations(SUB_ID, COMPANY_ID, TROCA, {
      prismaClient: prisma,
    });

    expect(outcome).toEqual({ kind: "failed", detail: "conexão caiu" });
  });

  it("data corrompida na obrigação vira outcome, não exceção", async () => {
    // O módulo puro LANÇA diante de data inválida (fail-closed, de propósito).
    // Aqui essa exceção tem que virar `failed` — senão uma linha corrompida
    // derrubaria a troca de plano inteira com 500.
    obligations = [obligationRow({ periodEnd: new Date("nao-e-data") })];

    const outcome = await run({
      kind: "trial_extension",
      oldTrialEndsAt: new Date("2026-10-04T00:00:00Z"),
      newTrialEndsAt: new Date("2026-10-11T00:00:00Z"),
    });

    expect(outcome.kind).toBe("failed");
  });

  it("falha ao ALERTAR não desfaz a decisão já registrada", async () => {
    // Perder o alerta é ruim; perder o registro seria pior — a linha ficaria sem
    // nenhum rastro de que alguém mudou o contrato por cima dela.
    obligations = [obligationRow({ state: "ISSUED" })];
    const prisma: RecalcDbClient = {
      ...makePrisma(),
      systemEvent: { upsert: quebrado("systemEvent fora do ar") },
    };

    const outcome = await applyContractChangeToObligations(SUB_ID, COMPANY_ID, TROCA, {
      prismaClient: prisma,
    });

    expect(outcome.kind).toBe("applied");
    expect(obligations[0].voidReason?.startsWith(KEEP_DECISION_PREFIX)).toBe(true);
  });
});
