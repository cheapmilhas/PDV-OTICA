import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));

const nextSaasInvoiceNumber = vi.fn().mockResolvedValue("INV-000200");
vi.mock("@/lib/saas-invoice-number", () => ({
  nextSaasInvoiceNumber: (...a: unknown[]) => nextSaasInvoiceNumber(...a),
}));

import {
  ISSUE_LEAD_DAYS,
  runObligationForCompany,
  runObligationsForCompanies,
  type ObligationDeps,
  type ObligationOutcome,
} from "@/services/billing-obligation.service";

const NOW = new Date("2026-09-01T12:00:00Z");
const COMPANY_ID = "co-1";
const SUB_ID = "sub-1";
const PLAN_ID = "plan-1";
/** Dentro do horizonte de ISSUE_LEAD_DAYS a partir de NOW. */
const ANCHOR = new Date("2026-09-04T00:00:00Z");
const ANCHOR_END = new Date("2026-10-04T00:00:00Z");

// ── Estado do banco falso ────────────────────────────────────────────────────

interface FakeState {
  company: { id: string; cnpj: string | null } | null;
  subscriptions: Array<Record<string, unknown>>;
  obligations: Array<Record<string, unknown>>;
  courtesies: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
}

let state: FakeState;
let createObligationImpl: ((data: Record<string, unknown>) => unknown) | null;
const executeRaw = vi.fn();
const invoiceCreate = vi.fn();
const obligationUpdateMany = vi.fn();

const SNAPSHOT_KEYS = [
  "id",
  "sequence",
  "state",
  "disposition",
  "periodStart",
  "periodEnd",
  "priceCents",
] as const;

function pickSnapshot(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of SNAPSHOT_KEYS) out[k] = row[k];
  return out;
}

function defaultSubscription(over: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    companyId: COMPANY_ID,
    status: "ACTIVE",
    billingCycle: "MONTHLY",
    asaasSubscriptionId: null,
    discountPercent: null,
    discountExpiresAt: null,
    planId: PLAN_ID,
    plan: {
      id: PLAN_ID,
      name: "Clinica",
      priceMonthly: 18990,
      priceYearly: 189900,
    },
    company: { cnpj: "20606235000131" },
    ...over,
  };
}

function obligationRow(over: Record<string, unknown> = {}) {
  return {
    id: "obl-1",
    subscriptionId: SUB_ID,
    sequence: 1,
    state: "PLANNED",
    disposition: "CHARGE",
    periodStart: ANCHOR,
    periodEnd: ANCHOR_END,
    // Ciclo congelado na materialização: a fase 2 compara com o da assinatura
    // para detectar troca de ciclo depois de o período estar fechado.
    cycle: "MONTHLY",
    priceCents: 18990,
    invoiceId: null,
    ...over,
  };
}

/**
 * Prisma falso com estado. `$transaction(fn)` roda o callback com o mesmo `tx`,
 * como faz o teste do precedente.
 */
function makePrisma() {
  const billingObligation = {
    findFirst: async (args: {
      where?: Record<string, unknown>;
      orderBy?: { sequence?: "asc" | "desc" };
    }) => {
      const rows = state.obligations.filter((o) => matchObligation(o, args?.where));
      const asc = args?.orderBy?.sequence === "asc";
      const sorted = [...rows].sort((a, b) =>
        asc
          ? Number(a.sequence) - Number(b.sequence)
          : Number(b.sequence) - Number(a.sequence),
      );
      return sorted[0] ? { ...sorted[0] } : null;
    },
    findUnique: async (args: { where: { id: string } }) => {
      const row = state.obligations.find((o) => o.id === args.where.id);
      if (!row) return null;
      const sub = state.subscriptions.find((s) => s.id === row.subscriptionId);
      // A guarda pré-gateway (fase 3) lê `subscription.courtesies` aninhado.
      return {
        ...row,
        subscription: sub
          ? { ...sub, courtesies: state.courtesies.map((c) => ({ ...c })) }
          : sub,
      };
    },
    findUniqueOrThrow: async (args: { where: { id: string } }) => {
      const row = state.obligations.find((o) => o.id === args.where.id);
      if (!row) throw new Error("not found");
      return { ...row };
    },
    create: async (args: { data: Record<string, unknown> }) => {
      if (createObligationImpl) return createObligationImpl(args.data);
      const row = { id: `obl-${state.obligations.length + 1}`, invoiceId: null, ...args.data };
      state.obligations.push(row);
      return pickSnapshot(row);
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.obligations.find((o) => o.id === args.where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, args.data);
      return pickSnapshot(row);
    },
    updateMany: async (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      obligationUpdateMany(args);
      const rows = state.obligations.filter((o) => matchObligation(o, args.where));
      for (const row of rows) Object.assign(row, args.data);
      return { count: rows.length };
    },
  };

  const tx = {
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
    $queryRaw: vi.fn(),
    company: {
      findUnique: async () => (state.company ? { ...state.company } : null),
    },
    subscription: {
      findMany: async () => state.subscriptions.map((s) => ({ ...s })),
    },
    subscriptionCourtesy: {
      findMany: async () => state.courtesies.map((c) => ({ ...c })),
    },
    invoice: {
      // Honra o filtro de verdade: a guarda de sobreposição procura só faturas
      // SEM vínculo, e um fake que devolve tudo faria a guarda disparar em cima
      // da própria tentativa da obrigação.
      findMany: async (args: { where?: Record<string, unknown> }) =>
        state.invoices.filter((i) => matchInvoice(i, args?.where)).map((i) => ({ ...i })),
      findUnique: async (args: { where: { id: string } }) => {
        const row = state.invoices.find((i) => i.id === args.where.id);
        return row ? { ...row } : null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        invoiceCreate(args);
        const row = { id: `inv-${state.invoices.length + 1}`, ...args.data };
        state.invoices.push(row);
        return { id: row.id };
      },
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = state.invoices.find((i) => i.id === args.where.id);
        if (!row) throw new Error("invoice not found");
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    billingObligation,
  };

  return {
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    billingObligation,
  } as unknown as ObligationDeps["prismaClient"];
}

function matchInvoice(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    // `subscription: { companyId }` — a guarda de sobreposição busca por EMPRESA,
    // então o fake tem que resolver a relação, senão o teste da assinatura
    // antiga cancelada passaria por acidente.
    if (key === "subscription" && value && typeof value === "object") {
      const sub = state.subscriptions.find((s) => s.id === row.subscriptionId);
      const inv = state.invoices.find((i) => i.id === row.id);
      const companyIdDaFatura =
        (sub?.companyId as string | undefined) ??
        (inv?.companyId as string | undefined);
      const esperado = (value as { companyId?: string }).companyId;
      if (esperado !== undefined && companyIdDaFatura !== esperado) return false;
      continue;
    }
    if (value && typeof value === "object" && "in" in value) {
      if (!(value as { in: unknown[] }).in.includes(row[key])) return false;
      continue;
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function matchObligation(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    // `subscription: { companyId }` — usado na releitura do vencedor após P2002.
    if (key === "subscription" && value && typeof value === "object") {
      const sub = state.subscriptions.find((s) => s.id === row.subscriptionId);
      const esperado = (value as { companyId?: string }).companyId;
      if (esperado !== undefined && sub?.companyId !== esperado) return false;
      continue;
    }
    if (key === "state" && value && typeof value === "object" && "not" in value) {
      if (row.state === (value as { not: unknown }).not) return false;
      continue;
    }
    if (key === "periodStart" && value instanceof Date) {
      if ((row.periodStart as Date).getTime() !== value.getTime()) return false;
      continue;
    }
    if (row[key] !== value) return false;
  }
  return true;
}

// ── Dependências injetadas ───────────────────────────────────────────────────

const ensureCustomerFn = vi.fn();
const ensureChargeFn = vi.fn();
const sendChargeEmailFn = vi.fn();
const isGenerationEnabledFn = vi.fn();
const isIssuanceEnabledFn = vi.fn();

function deps(over: Partial<ObligationDeps> = {}): ObligationDeps {
  return {
    prismaClient: makePrisma(),
    ensureCustomerFn,
    ensureChargeFn,
    sendChargeEmailFn,
    isGenerationEnabledFn,
    isIssuanceEnabledFn,
    firstPeriodStartBySubscription: { [SUB_ID]: ANCHOR },
    now: NOW,
    ...over,
  };
}

function run(over: Partial<ObligationDeps> = {}) {
  return runObligationForCompany(COMPANY_ID, deps(over));
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` zera CHAMADAS, não implementações: sem este reset, o
  // `mockImplementation` do teste de corrida do CAS vazaria para os seguintes.
  obligationUpdateMany.mockReset();
  nextSaasInvoiceNumber.mockResolvedValue("INV-000200");
  createObligationImpl = null;
  state = {
    company: { id: COMPANY_ID, cnpj: "20606235000131" },
    subscriptions: [defaultSubscription()],
    obligations: [],
    courtesies: [],
    invoices: [],
  };
  isGenerationEnabledFn.mockReturnValue(true);
  isIssuanceEnabledFn.mockReturnValue(true);
  ensureCustomerFn.mockResolvedValue({ asaasCustomerId: "cus_1", created: false });
  ensureChargeFn.mockResolvedValue({ id: "inv-1", total: 18990 });
  sendChargeEmailFn.mockResolvedValue({ status: "SENT", alreadySentToday: false });
});

// ═════════════════════════════════════════════════════════════════════════════
// O TESTE MAIS IMPORTANTE: isolamento por assinatura no lote
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationsForCompanies — isolamento por empresa", () => {
  it("uma empresa com dado corrompido NÃO derruba o lote das outras", async () => {
    // 🔑 Os módulos puros LANÇAM em dado corrompido (fail-closed deliberado).
    // Se a exceção subisse, UMA linha com periodEnd inválido zeraria a cobrança
    // de TODAS as empresas do mês. Este teste é a trava disso.
    const good1 = "co-boa-1";
    const bad = "co-ruim";
    const good2 = "co-boa-2";

    const byCompany: Record<string, FakeState> = {
      [good1]: freshState(good1, "sub-a", "obl-a"),
      [bad]: freshState(bad, "sub-b", "obl-b"),
      [good2]: freshState(good2, "sub-c", "obl-c"),
    };
    // A do meio tem a obrigação anterior com periodEnd INVÁLIDO.
    byCompany[bad].obligations = [
      obligationRow({
        id: "obl-b0",
        subscriptionId: "sub-b",
        state: "PAID",
        periodEnd: new Date("data-que-nao-existe"),
      }),
    ];

    const created: string[] = [];
    const results = await runObligationsForCompanies([good1, bad, good2], {
      ...deps(),
      prismaClient: makeRoutingPrisma(byCompany, created),
      firstPeriodStartBySubscription: {
        "sub-a": ANCHOR,
        "sub-b": ANCHOR,
        "sub-c": ANCHOR,
      },
      // Só materializa; a emissão não interessa a este teste.
      isIssuanceEnabledFn: () => false,
    });

    expect(results).toHaveLength(3);
    expect(results[0].outcome.kind).toBe("skipped");
    expect(results[2].outcome.kind).toBe("skipped");

    // A do meio falhou, isolada e identificada.
    expect(results[1]).toMatchObject({
      companyId: bad,
      outcome: { kind: "failed", reason: "invalid_calendar" },
    });

    // 🔑 A PROVA: as outras duas realmente foram processadas — obrigação criada
    // para as duas, não zero.
    expect(created).toEqual(["sub-a", "sub-c"]);
  });

  it("empresa ambígua é isolada e as outras seguem sendo cobradas", async () => {
    const results = await runObligationsForCompanies(["co-amb", "co-ok"], {
      ...deps(),
      prismaClient: makeRoutingPrisma(
        {
          "co-amb": {
            ...freshState("co-amb", "sub-x", "obl-x"),
            subscriptions: [
              defaultSubscription({ id: "sub-x1", companyId: "co-amb", status: "ACTIVE" }),
              defaultSubscription({ id: "sub-x2", companyId: "co-amb", status: "TRIAL" }),
            ],
          },
          "co-ok": freshState("co-ok", "sub-y", "obl-y"),
        },
        [],
      ),
      firstPeriodStartBySubscription: { "sub-y": ANCHOR },
      isIssuanceEnabledFn: () => false,
    });

    expect(results[0].outcome).toMatchObject({
      kind: "failed",
      reason: "ambiguous_subscription",
    });
    expect(results[1].outcome.kind).toBe("skipped");
  });

  function freshState(companyId: string, subId: string, _oblId: string): FakeState {
    return {
      company: { id: companyId, cnpj: "20606235000131" },
      subscriptions: [defaultSubscription({ id: subId, companyId })],
      obligations: [],
      courtesies: [],
      invoices: [],
    };
  }

  /** Prisma que troca de "banco" conforme a empresa do advisory lock/company. */
  function makeRoutingPrisma(byCompany: Record<string, FakeState>, created: string[]) {
    let current: FakeState | null = null;

    const billingObligation = {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const rows = (current?.obligations ?? []).filter((o) =>
          matchObligation(o, args?.where),
        );
        const sorted = [...rows].sort((a, b) => Number(b.sequence) - Number(a.sequence));
        return sorted[0] ? { ...sorted[0] } : null;
      },
      findUnique: async () => null,
      findUniqueOrThrow: async () => {
        throw new Error("not used");
      },
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(String(args.data.subscriptionId));
        const row = { id: `obl-${created.length}`, invoiceId: null, ...args.data };
        current?.obligations.push(row);
        return pickSnapshot(row);
      },
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    };

    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      company: {
        findUnique: async (args: { where: { id: string } }) => {
          current = byCompany[args.where.id] ?? null;
          return current?.company ? { ...current.company } : null;
        },
      },
      subscription: { findMany: async () => (current?.subscriptions ?? []).map((s) => ({ ...s })) },
      subscriptionCourtesy: { findMany: async () => [] },
      invoice: {
        findMany: async () => [],
        findUnique: async () => null,
        create: async () => ({ id: "inv-x" }),
      },
      billingObligation,
    };

    return {
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
      billingObligation,
    } as unknown as ObligationDeps["prismaClient"];
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Criação da obrigação
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — criação", () => {
  it("assinatura sem obrigação nenhuma cria a sequence 1", async () => {
    const r = await run({ isIssuanceEnabledFn: () => false });

    expect(r).toMatchObject({
      kind: "skipped",
      reason: "issuance_not_enabled",
      obligation: { sequence: 1, state: "PLANNED", disposition: "CHARGE", priceCents: 18990 },
    });
    expect(state.obligations).toHaveLength(1);
  });

  it("serializa por empresa com advisory lock ANTES de ler qualquer coisa", async () => {
    await run();
    expect(executeRaw).toHaveBeenCalled();
  });

  it("já existe obrigação do período: NÃO cria outra", async () => {
    state.obligations = [obligationRow()];

    await run({ isIssuanceEnabledFn: () => false });

    expect(state.obligations).toHaveLength(1);
  });

  it("obrigação já existente PLANNED volta para a fase de emissão (não é terminal)", async () => {
    // 🔑 Sem isto, uma obrigação criada com a emissão desligada ficaria PLANNED
    // para sempre: a rodada seguinte a reencontraria e encerraria ali.
    state.obligations = [obligationRow()];

    const r = await run();

    expect(r.kind).toBe("issued");
    expect(ensureChargeFn).toHaveBeenCalled();
  });

  it("PLANNED pendente é retomada ANTES de calcular período novo (impasse do horizonte)", async () => {
    // 🔑 Sem a precedência de trabalho pendente, a `PLANNED` do período atual
    // vira a âncora, o período SEGUINTE cai fora do horizonte, e a rodada
    // devolve `outside_horizon` todo dia — a dívida fica materializada e nunca
    // emitida. É o impasse permanente.
    state.obligations = [obligationRow({ id: "obl-parada" })];

    const r = await run();

    expect(r).toMatchObject({ kind: "issued", obligation: { id: "obl-parada" } });
    expect(state.obligations).toHaveLength(1);
  });

  it("backlog é retomado em ORDEM (mês 3 antes do mês 5)", async () => {
    state.obligations = [
      obligationRow({
        id: "obl-5",
        sequence: 5,
        periodStart: new Date("2026-09-20T00:00:00Z"),
        periodEnd: new Date("2026-10-20T00:00:00Z"),
      }),
      obligationRow({ id: "obl-3", sequence: 3 }),
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "issued", obligation: { id: "obl-3", sequence: 3 } });
  });

  it("uma obrigação por rodada: com pendente NÃO cria a seguinte", async () => {
    state.obligations = [obligationRow({ id: "obl-parada" })];

    await run({ isIssuanceEnabledFn: () => false });

    expect(state.obligations).toHaveLength(1);
  });

  it("período além do horizonte NÃO é materializado (anti-avalanche)", async () => {
    // A obrigação vigente termina em novembro; o próximo período começa longe.
    state.obligations = [
      obligationRow({
        state: "PAID",
        periodStart: new Date("2026-10-04T00:00:00Z"),
        periodEnd: new Date("2026-11-04T00:00:00Z"),
      }),
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "skipped", reason: "outside_horizon" });
    expect(state.obligations).toHaveLength(1);
  });

  it("sem âncora do bootstrap NÃO inventa data — sinaliza needs_bootstrap", async () => {
    // `currentPeriodEnd` é escrito por sete caminhos e nenhum prova "pagou até
    // aqui"; `mark_paid` confirma à mão e nem o avança. Inferir cobraria de novo
    // um período já pago.
    const r = await run({ firstPeriodStartBySubscription: {} });

    expect(r).toMatchObject({ kind: "skipped", reason: "needs_bootstrap" });
    expect(state.obligations).toHaveLength(0);
  });

  it("encadeia do FIM do período anterior, nunca de agora", async () => {
    state.obligations = [
      obligationRow({
        state: "PAID",
        periodStart: new Date("2026-08-03T00:00:00Z"),
        periodEnd: new Date("2026-09-03T00:00:00Z"),
      }),
    ];

    await run({ isIssuanceEnabledFn: () => false });

    const nova = state.obligations[1];
    expect(nova.periodStart).toEqual(new Date("2026-09-03T00:00:00Z"));
    expect(nova.periodStart).not.toEqual(NOW);
    expect(nova.sequence).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Concorrência
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — concorrência", () => {
  it("P2002 é tratado como 'já existe', não como erro fatal", async () => {
    // Duas execuções concorrentes → UMA obrigação. É o mecanismo funcionando.
    const winner = obligationRow({ id: "obl-vencedora" });
    createObligationImpl = () => {
      state.obligations.push(winner);
      throw new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
      });
    };

    const r = await run({ isIssuanceEnabledFn: () => false });

    expect(r).toMatchObject({
      kind: "skipped",
      reason: "issuance_not_enabled",
      obligation: { id: "obl-vencedora" },
    });
  });

  it("P2002 cujo vencedor cobre OUTRO período não é confundido com idempotência", async () => {
    createObligationImpl = () => {
      throw new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
      });
    };

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "unexpected", retryable: true });
  });

  it("CAS da reserva: se outra execução ocupou a tentativa, NÃO cria segunda cobrança", async () => {
    // 🔑 `Invoice.billingObligationId` tem ÍNDICE, não unique. Sem o CAS
    // (`invoiceId: null` no WHERE), duas rodadas que retomem a mesma `PLANNED`
    // veriam ambas "sem fatura", criariam duas Invoices, e o Asaas receberia
    // DUAS cobranças reais — chaves de idempotência diferentes
    // (`invoice:<id>`), logo o gateway não as deduplicaria.
    state.obligations = [obligationRow()];
    const prismaClient = makePrisma();

    // Encena a corrida: no instante do updateMany, a obrigação já foi ocupada
    // por outra execução, então o WHERE do CAS não casa e o count é 0.
    obligationUpdateMany.mockImplementation((args: { where: Record<string, unknown> }) => {
      if ("invoiceId" in args.where) {
        state.obligations[0].invoiceId = "inv-de-outra-execucao";
      }
    });

    const r = await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));

    expect(r).toMatchObject({ kind: "failed", reason: "attempt_race", retryable: true });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("promoção para ISSUED é CAS: obrigação já PAGA pelo webhook NÃO regride", async () => {
    // 🔑 O webhook pode confirmar o pagamento antes de a fase 3 gravar ISSUED.
    // Um update cego regrediria PAID → ISSUED, e no vencimento quem PAGOU
    // apareceria inadimplente.
    state.obligations = [obligationRow()];
    ensureChargeFn.mockImplementation(async () => {
      // Durante a chamada ao gateway, o webhook marca paga.
      state.obligations[0].state = "PAID";
      return { id: "inv-1", total: 18990 };
    });

    const r = await run();

    expect(r).toMatchObject({ kind: "skipped", reason: "already_settled" });
    expect(state.obligations[0].state).toBe("PAID");
  });

  it("obrigação já ISSUED NÃO é reemitida (não é trabalho pendente)", async () => {
    // A já emitida saiu da fila: `PLANNED` é o único estado que o motor retoma.
    // Nada a fazer nesta rodada — o período seguinte ainda está longe.
    state.obligations = [obligationRow({ state: "ISSUED", invoiceId: "inv-velha" })];

    const r = await run();

    expect(r.kind).toBe("skipped");
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(state.obligations).toHaveLength(1);
  });

  it("obrigação PAGA não é reemitida", async () => {
    state.obligations = [obligationRow({ state: "PAID", paidAt: NOW })];

    const r = await run();

    expect(r.kind).toBe("skipped");
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(state.obligations).toHaveLength(1);
  });

  it("obrigação ANULADA não bloqueia o período: nasce SUBSTITUTA com sequence nova", async () => {
    // ⚠️ Anular acontece por "troca de plano" e "trial estendido" (schema,
    // `voidReason`) — nos dois o período volta a ser cobrável. Se a anulada
    // bloqueasse o período, anular por troca de plano deixaria o mês
    // PERMANENTEMENTE sem cobrança.
    state.obligations = [
      obligationRow({ id: "obl-anulada", sequence: 1, state: "VOID", voidReason: "troca de plano" }),
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
    expect(state.obligations).toHaveLength(2);
    const substituta = state.obligations[1];
    // Número contábil NOVO: o da anulada continua ocupado pela unique.
    expect(substituta.sequence).toBe(2);
    expect(substituta.periodStart).toEqual(ANCHOR);
    expect(state.obligations[0].state).toBe("VOID");
  });

  it("depois de uma VOID, a próxima obrigação recebe sequence MAIOR (não recicla)", async () => {
    // A anulada continua ocupando o número na unique (subscriptionId, sequence);
    // reusá-lo colidiria em P2002 a cada rodada, para sempre.
    state.obligations = [
      obligationRow({
        id: "obl-paga",
        sequence: 1,
        state: "PAID",
        periodStart: new Date("2026-08-04T00:00:00Z"),
        periodEnd: new Date("2026-09-04T00:00:00Z"),
      }),
      obligationRow({
        id: "obl-anulada",
        sequence: 2,
        state: "VOID",
        periodStart: new Date("2026-09-04T00:00:00Z"),
        periodEnd: new Date("2026-10-04T00:00:00Z"),
      }),
    ];

    await run({ isIssuanceEnabledFn: () => false });

    const nova = state.obligations[2];
    expect(nova.sequence).toBe(3);
    // A âncora vem da última NÃO anulada (a paga), não da anulada.
    expect(nova.periodStart).toEqual(new Date("2026-09-04T00:00:00Z"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cortesia e conta interna
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — cortesia e plano interno", () => {
  it("cortesia vigente: obrigação COURTESY, nenhuma chamada ao gateway, nenhum e-mail", async () => {
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];

    const r = await run();

    expect(r).toMatchObject({
      kind: "settled",
      obligation: { disposition: "COURTESY", state: "PAID" },
    });
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(ensureCustomerFn).not.toHaveBeenCalled();
    expect(sendChargeEmailFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("cortesia grava o preço CHEIO (receita não faturada), não zero", async () => {
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];

    await run();

    expect(state.obligations[0].priceCents).toBe(18990);
  });

  it("cortesia nasce SEM issuedAt/dueAt — nunca pode restringir ninguém (I1)", async () => {
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];

    await run();

    expect(state.obligations[0].issuedAt).toBeUndefined();
    expect(state.obligations[0].dueAt).toBeUndefined();
  });

  it("cortesia REVOGADA não isenta — volta a cobrar", async () => {
    state.courtesies = [
      {
        startsAt: new Date("2026-01-01T00:00:00Z"),
        endsAt: null,
        revokedAt: new Date("2026-08-01T00:00:00Z"),
      },
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
  });

  it("cortesia que já EXPIROU não isenta", async () => {
    state.courtesies = [
      {
        startsAt: new Date("2026-01-01T00:00:00Z"),
        endsAt: new Date("2026-08-01T00:00:00Z"),
        revokedAt: null,
      },
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
  });

  it("cortesia concedida DEPOIS da obrigação quita em vez de cobrar", async () => {
    // A obrigação já existe (PLANNED, CHARGE) e a cortesia entrou no meio.
    state.obligations = [obligationRow()];
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];

    const r = await run();

    expect(r).toMatchObject({
      kind: "settled",
      obligation: { disposition: "COURTESY", state: "PAID" },
    });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("LEGACY_WAIVED (passado regularizado pelo bootstrap) NÃO é cobrada de novo", async () => {
    // Esta disposição nunca é PRODUZIDA pelo motor, mas existe no banco (escrita
    // direta da etapa 2 do rollout) e pode ser lida aqui. Tratá-la por omissão
    // faria o motor cobrar um período que o dono declarou encerrado.
    state.obligations = [
      obligationRow({ disposition: "LEGACY_WAIVED", state: "PLANNED" }),
    ];

    const r = await run();

    expect(r).toMatchObject({
      kind: "settled",
      obligation: { disposition: "LEGACY_WAIVED" },
    });
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("obrigação isenta escrita à mão como PLANNED é QUITADA — senão trava a assinatura para sempre", async () => {
    // 🔑 O bug que este teste tranca: o motor cria isenta já `PAID`, mas o
    // bootstrap da etapa 2 e a Task 9 escrevem `disposition` à mão e podem
    // deixar `PLANNED`. Nessa situação a precedência de "pendente antes de novo"
    // devolvia a MESMA obrigação todo dia, o outcome dizia `settled`, e a
    // assinatura NUNCA gerava o período seguinte — o cliente parava de ser
    // cobrado em silêncio, com o resultado afirmando "quitada".
    state.obligations = [
      obligationRow({ disposition: "LEGACY_WAIVED", state: "PLANNED" }),
    ];

    const r = await run();

    expect(r).toMatchObject({
      kind: "settled",
      obligation: { disposition: "LEGACY_WAIVED", state: "PAID" },
    });
    // O banco também: não basta o outcome mentir bonito.
    expect(state.obligations[0].state).toBe("PAID");
    expect(state.obligations[0].paidAt).toEqual(NOW);
    // I1 nunca pode restringir por causa dela.
    expect(state.obligations[0].issuedAt ?? null).toBeNull();
    expect(state.obligations[0].dueAt ?? null).toBeNull();
  });

  it("depois de destravada, a assinatura VOLTA a gerar o período seguinte", async () => {
    // A prova de que o destravamento serve para algo: com a isenta quitada, a
    // rodada seguinte encadeia o período novo em vez de devolver a mesma linha.
    state.obligations = [
      obligationRow({
        disposition: "COURTESY",
        state: "PLANNED",
        periodStart: new Date("2026-08-04T00:00:00Z"),
        periodEnd: ANCHOR,
      }),
    ];

    const primeira = await run();
    expect(primeira.kind).toBe("settled");

    const segunda = await run();

    expect(segunda.kind).toBe("issued");
    expect(state.obligations).toHaveLength(2);
    // Encadeou do FIM da anterior, com sequence nova.
    expect(state.obligations[1]).toMatchObject({
      sequence: 2,
      periodStart: ANCHOR,
      disposition: "CHARGE",
    });
  });

  it("disposição virada para LEGACY_WAIVED ENTRE as fases NÃO é cobrada (2ª camada)", async () => {
    // 🔑 A fase 1 barra o que não é `CHARGE`, mas com o dado que ela leu antes de
    // commitar. A fase 2 abre transação NOVA e RECALCULA a disposição — e
    // `resolveObligationDisposition` só sabe devolver CHARGE/COURTESY/INTERNAL,
    // nunca LEGACY_WAIVED. Sem a releitura de `fresh.disposition`, o dono declarar
    // o período encerrado no meio da rodada resultava em cobrança REAL no
    // gateway, com a linha contraditória `LEGACY_WAIVED` + `ISSUED`.
    state.obligations = [obligationRow({ disposition: "CHARGE", state: "PLANNED" })];

    const prismaClient = makePrisma()!;
    const original = prismaClient.billingObligation.findUnique;
    let leituras = 0;
    prismaClient.billingObligation.findUnique = (async (args: never) => {
      leituras++;
      // A primeira `findUnique` é a releitura da fase 2: o dono acabou de
      // regularizar o período à mão, entre as duas transações.
      if (leituras === 1) state.obligations[0].disposition = "LEGACY_WAIVED";
      return original(args);
    }) as typeof original;

    const r = await run({ prismaClient });

    expect(r).toMatchObject({ kind: "failed", reason: "needs_review" });
    expect((r as { detail: string }).detail).toContain("LEGACY_WAIVED");
    // O que realmente importa: nada de dinheiro.
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(state.obligations[0].state).toBe("PLANNED");
  });

  it("plano de preço zero é INTERNAL, sem cobrança e com priceCents 0", async () => {
    state.subscriptions = [
      defaultSubscription({
        plan: { id: PLAN_ID, name: "Interno — Domus", priceMonthly: 0, priceYearly: 0 },
      }),
    ];

    const r = await run();

    expect(r).toMatchObject({
      kind: "settled",
      obligation: { disposition: "INTERNAL", state: "PAID", priceCents: 0 },
    });
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("plano MEIO cadastrado (mensal 0, anual positivo) é INTERNAL com priceCents 0", async () => {
    // ⚠️ DÍVIDA CONHECIDA, travada aqui para não virar surpresa: nada no schema
    // garante que `priceMonthly = 0` implique `priceYearly = 0`, e
    // `resolveObligationDisposition` decide "é conta interna?" olhando SÓ o
    // mensal. Uma assinatura ANUAL desse plano nunca é cobrada — fica INTERNAL.
    // Não é o que se quer comercialmente, mas é o lado SEGURO (não cobra por
    // engano) e o valor registrado é 0, então a receita não faturada não infla.
    // Consertar de verdade exige validação no cadastro do plano, fora desta task.
    state.subscriptions = [
      defaultSubscription({
        billingCycle: "YEARLY",
        plan: { id: PLAN_ID, name: "Meio cadastrado", priceMonthly: 0, priceYearly: 299900 },
      }),
    ];

    const r = await run();

    expect(r).toMatchObject({
      kind: "settled",
      obligation: { disposition: "INTERNAL", priceCents: 0 },
    });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("plano interno vence a cortesia (INTERNAL não infla receita não faturada)", async () => {
    state.subscriptions = [
      defaultSubscription({
        plan: { id: PLAN_ID, name: "Interno — Domus", priceMonthly: 0, priceYearly: 0 },
      }),
    ];
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "settled", obligation: { disposition: "INTERNAL" } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guardas fail-closed
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — guardas fail-closed", () => {
  it("empresa ambígua NÃO cobra e sinaliza", async () => {
    state.subscriptions = [
      defaultSubscription({ id: "sub-a", status: "ACTIVE" }),
      defaultSubscription({ id: "sub-b", status: "PAST_DUE" }),
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "ambiguous_subscription" });
    expect(state.obligations).toHaveLength(0);
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("assinaturas CANCELED antigas não escondem a única viva", async () => {
    // Com `take: 2` como no precedente, duas canceladas ocultariam a viva e o
    // motor concluiria "não há assinatura" numa empresa que paga.
    state.subscriptions = [
      defaultSubscription({ id: "sub-old1", status: "CANCELED" }),
      defaultSubscription({ id: "sub-old2", status: "CANCELED" }),
      defaultSubscription({ id: SUB_ID, status: "ACTIVE" }),
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
  });

  it("nenhuma assinatura viva é ausência, não erro", async () => {
    state.subscriptions = [defaultSubscription({ status: "CANCELED" })];

    const r = await run();

    expect(r).toMatchObject({ kind: "skipped", reason: "no_effective_subscription" });
  });

  it("assinatura com asaasSubscriptionId é EXCLUÍDA (armadilha da 2ª cobrança)", async () => {
    // `ensureInvoiceCharge` roda o sync nativo e, se ele não produzir
    // paymentUrl, cai no standalone e cria uma SEGUNDA cobrança no gateway.
    state.subscriptions = [defaultSubscription({ asaasSubscriptionId: "sub_asaas_1" })];

    const r = await run();

    expect(r).toMatchObject({ kind: "skipped", reason: "native_asaas_subscription" });
    expect(state.obligations).toHaveLength(0);
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("asaasSubscriptionId que aparece ENTRE as fases também barra a emissão (TOCTOU)", async () => {
    // 🔑 O cenário real: a fase 1 vê a assinatura LIMPA e reserva a obrigação;
    // o checkout roda no intervalo e grava `asaasSubscriptionId`; a fase 2 tem
    // que revalidar. Sem a segunda checagem, `ensureInvoiceCharge` entra no sync
    // nativo e pode cair no standalone — a assinatura fica com cobrança nativa
    // E standalone, duas cobranças reais.
    //
    // A limpeza na fase 1 e a sujeira na fase 2 são encenadas por um contador de
    // leituras: só a partir da SEGUNDA leitura a assinatura tem a nativa.
    state.obligations = [obligationRow()];
    let leituras = 0;
    const base = defaultSubscription();

    type Tx = Record<string, unknown>;
    const inner = makePrisma() as unknown as {
      $transaction: (fn: (tx: Tx) => unknown) => unknown;
    };
    const prismaClient = {
      $transaction: async (fn: (tx: Tx) => unknown) =>
        inner.$transaction(async (tx: Tx) => {
          leituras++;
          const sujo = leituras > 1;
          const sub = { ...base, asaasSubscriptionId: sujo ? "sub_asaas_novo" : null };
          return fn({
            ...tx,
            subscription: { findMany: async () => [sub] },
            billingObligation: {
              ...(tx.billingObligation as Tx),
              findUnique: async (args: { where: { id: string } }) => {
                const row = state.obligations.find((o) => o.id === args.where.id);
                return row ? { ...row, subscription: sub } : null;
              },
            },
          });
        }),
    } as unknown as ObligationDeps["prismaClient"];

    const r = await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));

    expect(r).toMatchObject({ kind: "skipped", reason: "native_asaas_subscription" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("empresa sem documento não chega ao gateway", async () => {
    state.subscriptions = [defaultSubscription({ company: { cnpj: null } })];
    state.obligations = [obligationRow()];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "missing_document" });
    expect(ensureCustomerFn).not.toHaveBeenCalled();
  });

  it("empresa inexistente falha sem criar nada", async () => {
    state.company = null;

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "company_not_found" });
  });

  it("geração desligada não abre nem conexão", async () => {
    const r = await run({ isGenerationEnabledFn: () => false });

    expect(r).toEqual({ kind: "skipped", reason: "generation_disabled" });
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("emissão não liberada para a coorte materializa mas NÃO cobra", async () => {
    const r = await run({ isIssuanceEnabledFn: () => false });

    expect(r).toMatchObject({ kind: "skipped", reason: "issuance_not_enabled" });
    expect(state.obligations).toHaveLength(1);
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("fatura viva SEM vínculo cobrindo o mesmo período BARRA a emissão", async () => {
    // A conversão de trial grava `Invoice.source`, não `billingObligationId`.
    // Sem esta guarda o motor emitiria uma SEGUNDA mensalidade do mesmo período.
    state.obligations = [obligationRow()];
    state.invoices = [
      {
        id: "inv-conversao",
        number: "INV-000008",
        subscriptionId: SUB_ID,
        billingObligationId: null,
        isManual: false,
        status: "PENDING",
        periodStart: new Date("2026-09-10T00:00:00Z"),
        periodEnd: new Date("2026-10-10T00:00:00Z"),
      },
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "unmapped_invoice_overlap" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("fatura viva de assinatura ANTIGA da mesma EMPRESA também barra", async () => {
    // 🔑 `Subscription` não tem unique em `companyId`. No padrão "cancela e
    // recontrata", a assinatura velha pode ter fatura viva cobrindo o mês que a
    // nova vai cobrar. Buscar só por `subscriptionId` deixaria passar e a
    // EMPRESA pagaria duas vezes o mesmo mês.
    state.obligations = [obligationRow()];
    state.subscriptions = [
      defaultSubscription({ id: "sub-antiga", status: "CANCELED" }),
      defaultSubscription({ id: SUB_ID, status: "ACTIVE" }),
    ];
    state.invoices = [
      {
        id: "inv-da-antiga",
        number: "INV-000006",
        subscriptionId: "sub-antiga",
        billingObligationId: null,
        isManual: false,
        status: "PENDING",
        total: 18990,
        asaasPaymentId: "pay_1",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "unmapped_invoice_overlap" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("fatura sem vínculo de período ADJACENTE não barra (é o encadeamento normal)", async () => {
    state.obligations = [obligationRow()];
    state.invoices = [
      {
        id: "inv-anterior",
        number: "INV-000007",
        subscriptionId: SUB_ID,
        billingObligationId: null,
        isManual: false,
        status: "PAID",
        periodStart: new Date("2026-08-04T00:00:00Z"),
        periodEnd: ANCHOR,
      },
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Emissão
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — emissão", () => {
  it("emite a fatura da MENSALIDADE ligada à obrigação e promove a ISSUED", async () => {
    const r = await run();

    expect(r).toMatchObject({ kind: "issued", emailStatus: "SENT" });
    const data = invoiceCreate.mock.calls[0][0].data;
    expect(data.isManual).toBe(false);
    expect(data.total).toBe(18990);
    expect(data.billingObligationId).toBe(state.obligations[0].id);
    expect(state.obligations[0].state).toBe("ISSUED");
  });

  it("grava dueDate EXPLÍCITO na fatura (o gateway não persiste o fallback dele)", async () => {
    await run();

    const data = invoiceCreate.mock.calls[0][0].data;
    expect(data.dueDate).toEqual(ANCHOR);
    expect(state.obligations[0].dueAt).toEqual(ANCHOR);
  });

  it("dueAt da obrigação e dueDate da fatura são o MESMO instante (I1 precisa provar o vencimento)", async () => {
    await run();

    expect(state.obligations[0].dueAt).toEqual(invoiceCreate.mock.calls[0][0].data.dueDate);
  });

  it("chama o gateway FORA da transação, depois de reservar", async () => {
    await run();

    expect(ensureCustomerFn).toHaveBeenCalledWith(COMPANY_ID);
    expect(ensureChargeFn).toHaveBeenCalled();
  });

  it("FALHA DO GATEWAY: obrigação permanece PLANNED, não vira ISSUED", async () => {
    // 🔑 I1: marcar ISSUED sem o gateway criaria uma dívida que ninguém foi
    // cobrado por — e no vencimento o cliente seria restringido por uma cobrança
    // que nunca existiu.
    ensureChargeFn.mockRejectedValue(new Error("Asaas 500"));

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "gateway_error", retryable: true });
    expect(state.obligations[0].state).toBe("PLANNED");
    expect(state.obligations[0].issuedAt).toBeFalsy();
  });

  it("falha ao criar o customer também deixa a obrigação PLANNED", async () => {
    ensureCustomerFn.mockRejectedValue(new Error("documento recusado"));

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "gateway_error" });
    expect(state.obligations[0].state).toBe("PLANNED");
  });

  it("retry depois de falha do gateway REUSA a mesma obrigação e a mesma fatura", async () => {
    ensureChargeFn.mockRejectedValueOnce(new Error("Asaas 500"));
    const prismaClient = makePrisma();

    await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));
    expect(state.obligations[0].state).toBe("PLANNED");
    const invoiceIdDaPrimeira = state.obligations[0].invoiceId;

    const r2 = await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));

    expect(r2.kind).toBe("issued");
    expect(state.obligations).toHaveLength(1);
    expect(state.invoices).toHaveLength(1);
    expect(state.obligations[0].invoiceId).toBe(invoiceIdDaPrimeira);
  });

  it("falha no e-mail NÃO desfaz a cobrança", async () => {
    sendChargeEmailFn.mockRejectedValue(new Error("provedor fora"));

    const r = await run();

    expect(r).toMatchObject({ kind: "issued", emailStatus: "NOT_SENT" });
    expect(state.obligations[0].state).toBe("ISSUED");
  });

  it("e-mail SUPRIMIDO aparece no outcome (emitido não pode esconder 'ninguém recebeu')", async () => {
    // O caso MedFacil: e-mail redirecionado por testMode.
    sendChargeEmailFn.mockResolvedValue({ status: "SKIPPED", alreadySentToday: false });

    const r = await run();

    expect(r).toMatchObject({ kind: "issued", emailStatus: "SKIPPED" });
  });

  it("fatura CANCELADA exige revisão — o motor NÃO reemite por cima de um estorno", async () => {
    state.obligations = [obligationRow({ invoiceId: "inv-cancelada" })];
    state.invoices = [
      {
        id: "inv-cancelada",
        number: "INV-000010",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "CANCELED",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "needs_review", retryable: false });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("fatura já PAGA quita a obrigação em vez de cobrar de novo", async () => {
    state.obligations = [obligationRow({ invoiceId: "inv-paga" })];
    state.invoices = [
      {
        id: "inv-paga",
        number: "INV-000011",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "PAID",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "settled", obligation: { state: "PAID" } });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("recalcula o preço na EMISSÃO, não usa o congelado na criação", async () => {
    // 🔑 Schema: "o preço é congelado na EMISSÃO, não na criação". Uma obrigação
    // materializada dias antes tem que cobrar o plano de hoje — senão um upgrade
    // no meio cobraria o valor antigo.
    state.obligations = [obligationRow({ priceCents: 18990 })];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-2", name: "Clinica Plus", priceMonthly: 29990, priceYearly: 299900 },
      }),
    ];

    await run();

    expect(state.obligations[0].priceCents).toBe(29990);
    expect(state.obligations[0].planId).toBe("plan-2");
    expect(invoiceCreate.mock.calls[0][0].data.total).toBe(29990);
  });

  it("ciclo ANUAL cobra o preço anual, não o mensal", async () => {
    state.subscriptions = [defaultSubscription({ billingCycle: "YEARLY" })];

    await run();

    expect(invoiceCreate.mock.calls[0][0].data.total).toBe(189900);
  });

  it("desconto vigente é aplicado na cobrança", async () => {
    state.subscriptions = [
      defaultSubscription({
        discountPercent: 10,
        discountExpiresAt: new Date("2026-12-01T00:00:00Z"),
      }),
    ];

    await run();

    expect(invoiceCreate.mock.calls[0][0].data.total).toBe(17091);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Contrato que muda entre a materialização e a emissão
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — contrato que muda antes da emissão", () => {
  it("ciclo trocado depois do período fechado exige revisão (não cobra ano por mês)", async () => {
    // 🔑 O período já está congelado em 1 mês. Recalcular só o preço com o ciclo
    // novo cobraria `priceYearly` — um ANO — por 30 dias de serviço. Trocar de
    // ciclo exige ANULAR e refazer o período (Task 9), não recálculo silencioso.
    state.obligations = [obligationRow({ cycle: "MONTHLY" })];
    state.subscriptions = [defaultSubscription({ billingCycle: "YEARLY" })];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "needs_review" });
    expect((r as { detail: string }).detail).toMatch(/ciclo mudou/);
    expect(ensureChargeFn).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("preço novo em tentativa NÃO enviada ao gateway atualiza a FATURA também", async () => {
    // 🔑 Atualizar só `obligation.priceCents` deixaria a obrigação afirmando
    // R$ 299,90 enquanto `ensureInvoiceCharge` cobra `invoice.total` = R$ 189,90:
    // o registro contábil dizendo um valor e o gateway cobrando outro.
    state.obligations = [obligationRow({ invoiceId: "inv-reservada" })];
    state.invoices = [
      {
        id: "inv-reservada",
        number: "INV-000020",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "PENDING",
        total: 18990,
        asaasPaymentId: null,
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-2", name: "Clinica Plus", priceMonthly: 29990, priceYearly: 299900 },
      }),
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
    expect(state.obligations[0].priceCents).toBe(29990);
    // O invariante: os dois lados batem.
    expect(state.invoices[0].total).toBe(29990);
    expect(state.invoices[0].subtotal).toBe(29990);
  });

  it("na retomada, dueAt da obrigação e dueDate da fatura continuam o MESMO instante", async () => {
    // 🔑 O bug: `dueDate` da fatura só era corrigido DENTRO do `if` do preço,
    // enquanto `dueAt` da obrigação era gravado sempre. Com o preço igual e a
    // fatura carregando um vencimento velho, os dois lados divergiam em silêncio
    // — e I1 restringe pelo `dueAt` da obrigação enquanto o Asaas cobra pelo
    // `dueDate` da fatura. O cliente podia ser restringido numa data que a
    // cobrança dele nunca teve.
    const VENCIMENTO_VELHO = new Date("2001-01-01T00:00:00Z");
    state.obligations = [
      obligationRow({ invoiceId: "inv-reservada", dueAt: VENCIMENTO_VELHO }),
    ];
    state.invoices = [
      {
        id: "inv-reservada",
        number: "INV-000030",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "PENDING",
        // MESMO preço de agora: é o caminho que passava batido.
        total: 18990,
        subtotal: 18990,
        asaasPaymentId: null,
        dueDate: VENCIMENTO_VELHO,
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
    expect(state.invoices[0].dueDate).toEqual(ANCHOR);
    expect(state.obligations[0].dueAt).toEqual(ANCHOR);
    // O invariante, escrito como invariante: os dois lados batem.
    expect(state.obligations[0].dueAt).toEqual(state.invoices[0].dueDate);
  });

  it("tentativa JÁ no gateway: a obrigação segue o dueDate da FATURA, não o recalculado", async () => {
    // Depois de `asaasPaymentId` o vencimento está fixado no Asaas e o cliente já
    // recebeu o PIX com aquela data. Reescrever o local criaria a divergência
    // oposta — a obrigação afirmando um vencimento que a cobrança não tem.
    const VENCIMENTO_NO_GATEWAY = new Date("2026-09-10T00:00:00Z");
    state.obligations = [obligationRow({ invoiceId: "inv-no-asaas", dueAt: null })];
    state.invoices = [
      {
        id: "inv-no-asaas",
        number: "INV-000031",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "PENDING",
        total: 18990,
        subtotal: 18990,
        asaasPaymentId: "pay_123",
        dueDate: VENCIMENTO_NO_GATEWAY,
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const r = await run();

    expect(r.kind).toBe("issued");
    expect(state.invoices[0].dueDate).toEqual(VENCIMENTO_NO_GATEWAY);
    expect(state.obligations[0].dueAt).toEqual(VENCIMENTO_NO_GATEWAY);
  });

  it("ponteiro de fatura PENDURADO exige revisão e NÃO cria fatura órfã por rodada", async () => {
    // 🔑 O bug: com `invoiceId` ocupado e a fatura inexistente, o fluxo criava
    // uma fatura NOVA (queimando um número do contador global `INV-`), o CAS
    // exigia `invoiceId: null` e nunca casava, e a rodada devolvia
    // `attempt_race` com `retryable: true` — "é fila, espera passar". O cron
    // repetia todo dia: quatro rodadas, quatro faturas órfãs `PENDING`.
    state.obligations = [obligationRow({ invoiceId: "inv-que-nao-existe" })];
    state.invoices = [];

    const resultados: ObligationOutcome[] = [];
    for (let rodada = 0; rodada < 3; rodada++) resultados.push(await run());

    for (const r of resultados) {
      expect(r).toMatchObject({ kind: "failed", reason: "needs_review" });
      // NÃO é corrida: dizer `retryable` mandaria o operador esperar em vez de
      // consertar o ponteiro.
      expect(r).toMatchObject({ retryable: false });
    }
    // A PROVA: nenhuma fatura criada, nenhum número de `INV-` queimado.
    expect(state.invoices).toHaveLength(0);
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(nextSaasInvoiceNumber).not.toHaveBeenCalled();
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("preço novo em tentativa JÁ enviada ao gateway exige revisão (não reescreve por baixo)", async () => {
    // O valor está fixado no Asaas e o cliente já recebeu o PIX. Mudar a Invoice
    // local não muda a cobrança dele — só criaria divergência silenciosa.
    state.obligations = [obligationRow({ invoiceId: "inv-no-gateway" })];
    state.invoices = [
      {
        id: "inv-no-gateway",
        number: "INV-000021",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "PENDING",
        total: 18990,
        asaasPaymentId: "pay_existente",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-2", name: "Clinica Plus", priceMonthly: 29990, priceYearly: 299900 },
      }),
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "needs_review" });
    expect((r as { detail: string }).detail).toMatch(/preço mudou/);
    expect(state.invoices[0].total).toBe(18990);
  });

  it("ponteiro de fatura apontando para OUTRA assinatura exige revisão", async () => {
    // `BillingObligation.invoiceId` é `String?` sem FK, e `Invoice.billingObligationId`
    // é o ponteiro inverso — nada no schema mantém os dois sincronizados. Um
    // ponteiro torto faria o motor mandar ao gateway (e por e-mail ao cliente) a
    // fatura de OUTRA assinatura.
    state.obligations = [obligationRow({ invoiceId: "inv-de-outro" })];
    state.invoices = [
      {
        id: "inv-de-outro",
        number: "INV-000022",
        subscriptionId: "sub-de-outra-empresa",
        billingObligationId: null,
        isManual: false,
        status: "PENDING",
        total: 18990,
        asaasPaymentId: null,
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-02-01T00:00:00Z"),
      },
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "needs_review" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("assinatura movida de EMPRESA entre as fases não é cobrada sob o lock errado", async () => {
    state.obligations = [obligationRow()];
    state.subscriptions = [defaultSubscription({ companyId: "outra-empresa" })];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "unexpected" });
    expect((r as { detail: string }).detail).toMatch(/mudou de empresa/);
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guarda pré-gateway (janela entre a fase 2 e a fase 3)
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — guarda no último instante antes do gateway", () => {
  /**
   * A fase 2 solta o advisory lock ao commitar e o gateway é chamado depois.
   * Estes testes encenam mudanças NESSA janela: a leitura de guarda da fase 3 é
   * a última chance de recusar antes de gastar dinheiro real.
   */
  function prismaComMudancaAntesDoGateway(mudar: () => void) {
    const inner = makePrisma() as unknown as {
      $transaction: (fn: (tx: Record<string, unknown>) => unknown) => unknown;
      billingObligation: Record<string, unknown>;
    };
    let txs = 0;
    return {
      $transaction: async (fn: (tx: Record<string, unknown>) => unknown) => {
        const r = await inner.$transaction(fn);
        // Depois do COMMIT da fase 2 (a 2ª transação), o mundo mudou.
        if (++txs === 2) mudar();
        return r;
      },
      billingObligation: inner.billingObligation,
    } as unknown as ObligationDeps["prismaClient"];
  }

  it("assinatura nativa criada entre a fase 2 e o gateway ABORTA a emissão", async () => {
    state.obligations = [obligationRow()];
    const prismaClient = prismaComMudancaAntesDoGateway(() => {
      state.subscriptions = [defaultSubscription({ asaasSubscriptionId: "sub_asaas_tarde" })];
    });

    const r = await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));

    expect(r).toMatchObject({ kind: "skipped", reason: "native_asaas_subscription" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("cortesia concedida entre a fase 2 e o gateway ABORTA a emissão", async () => {
    state.obligations = [obligationRow()];
    const prismaClient = prismaComMudancaAntesDoGateway(() => {
      state.courtesies = [
        { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
      ];
    });

    const r = await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));

    expect(r).toMatchObject({ kind: "skipped", reason: "courtesy" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("obrigação paga entre a fase 2 e o gateway ABORTA a emissão", async () => {
    state.obligations = [obligationRow()];
    const prismaClient = prismaComMudancaAntesDoGateway(() => {
      state.obligations[0].state = "PAID";
    });

    const r = await runObligationForCompany(COMPANY_ID, deps({ prismaClient }));

    expect(r).toMatchObject({ kind: "skipped", reason: "already_settled" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("pagamento confirmado ENTRE o CAS e a leitura não manda e-mail de nova cobrança", async () => {
    // O CAS ganha (`count === 1`), mas o webhook marca PAID antes da releitura.
    // Avisar "nova cobrança" a quem acabou de pagar é contraditório, e o outcome
    // afirmaria `issued` sobre uma linha `PAID`.
    state.obligations = [obligationRow()];
    obligationUpdateMany.mockImplementation((args: { data: Record<string, unknown> }) => {
      if (args.data.state === "ISSUED") {
        // Depois de o CAS promover, o webhook confirma o pagamento.
        setTimeoutImediato(() => {
          state.obligations[0].state = "PAID";
        });
      }
    });

    const r = await run();

    expect(r).toMatchObject({ kind: "skipped", reason: "already_settled" });
    expect(sendChargeEmailFn).not.toHaveBeenCalled();
  });

  /** Aplica a mudança logo após o updateMany do fake escrever o estado. */
  function setTimeoutImediato(fn: () => void) {
    queueMicrotask(fn);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Erros classificados
// ═════════════════════════════════════════════════════════════════════════════

describe("runObligationForCompany — classificação de erro", () => {
  it("plano com preço zero em CHARGE vira invalid_price, não cobrança de R$ 0", async () => {
    // Plano mensal zero com anual positivo: `resolveObligationDisposition` diria
    // INTERNAL. Aqui o cenário é o inverso — mensal positivo, mas o cálculo do
    // ciclo anual dá zero.
    state.subscriptions = [
      defaultSubscription({
        billingCycle: "YEARLY",
        plan: { id: PLAN_ID, name: "Meio cadastrado", priceMonthly: 18990, priceYearly: 0 },
      }),
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "invalid_price", retryable: false });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("ciclo desconhecido vira invalid_calendar em vez de faturar como mensal", async () => {
    state.obligations = [obligationRow({ state: "PAID", periodEnd: new Date("2026-09-02T00:00:00Z") })];
    state.subscriptions = [
      defaultSubscription({ billingCycle: "QUARTERLY" as unknown as "MONTHLY" }),
    ];

    const r = await run();

    expect(r).toMatchObject({ kind: "failed", reason: "invalid_calendar" });
  });

  it("nunca LANÇA — erro desconhecido vira outcome failed", async () => {
    const r = await run({
      prismaClient: {
        $transaction: async () => {
          throw new Error("conexão caiu");
        },
      } as unknown as ObligationDeps["prismaClient"],
    });

    expect(r).toMatchObject({ kind: "failed", reason: "unexpected", detail: "conexão caiu" });
  });

  it("timeout de transação é classificado como RETOMÁVEL (é fila, não defeito)", async () => {
    // O checkout segura o MESMO advisory lock durante uma chamada real ao Asaas.
    const r = await run({
      prismaClient: {
        $transaction: async () => {
          throw new Prisma.PrismaClientKnownRequestError("tx timeout", {
            code: "P2028",
            clientVersion: "x",
          });
        },
      } as unknown as ObligationDeps["prismaClient"],
    });

    expect(r).toMatchObject({ kind: "failed", reason: "lock_timeout", retryable: true });
  });
});

describe("constantes", () => {
  it("o horizonte de geração é o MESMO número da janela de emissão", () => {
    // Se divergissem, existiria obrigação materializada que ainda não pode ser
    // emitida — PLANNED parada esperando a janela abrir.
    expect(ISSUE_LEAD_DAYS).toBe(5);
  });
});

describe("outcome carrega o que as Tasks 6-9 precisam", () => {
  it("todo outcome com obrigação expõe id, estado, disposição, período e preço", async () => {
    const r: ObligationOutcome = await run();

    expect(r.kind).toBe("issued");
    if (r.kind !== "issued") return;
    expect(r.obligation).toMatchObject({
      id: expect.any(String),
      sequence: expect.any(Number),
      state: "ISSUED",
      disposition: "CHARGE",
      priceCents: expect.any(Number),
    });
    expect(r.obligation.periodStart).toBeInstanceOf(Date);
    expect(r.obligation.periodEnd).toBeInstanceOf(Date);
    expect(r.invoiceId).toEqual(expect.any(String));
  });
});

