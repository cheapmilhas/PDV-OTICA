import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 🔑 Mocks HOISTADOS (`vi.hoisted`), não variáveis de escopo externo.
 *
 * `vi.mock` é içado para o topo do módulo, antes de qualquer `const`. Uma
 * factory que feche sobre um `const logErrorMock = vi.fn()` declarado abaixo
 * quebra com "Cannot access before initialization" assim que a ordem de
 * carregamento dos módulos muda — e ela muda justamente quando alguém mexe no
 * arquivo sob teste. O sintoma é um erro de importação em vez de uma asserção
 * vermelha: a suíte "falha", mas falha dizendo a coisa errada, e quem estiver
 * revisando uma mutação lê ruído no lugar do sinal. `vi.hoisted` sobe as
 * variáveis junto com o mock e o teste passa a falhar pelo motivo certo.
 */
const { captureMessageMock, logErrorMock, logWarnMock, logInfoMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  logErrorMock: vi.fn(),
  logWarnMock: vi.fn(),
  logInfoMock: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ error: logErrorMock, warn: logWarnMock, info: logInfoMock }),
  },
}));
vi.mock("@/lib/sentry", () => ({ captureMessage: captureMessageMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findMany: vi.fn() },
    billingObligation: { findMany: vi.fn() },
  },
}));

import { runGenerationPhase } from "./billing-generation-phase.service";
import type { BatchEntry } from "./billing-obligation.service";
import type { ShadowReport } from "./billing-shadow.service";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-09-01T12:00:00Z");

/** Prisma falso mínimo — só os dois métodos que a fase de fato chama. */
type FakePrisma = Parameters<typeof runGenerationPhase>[0] extends { prismaClient?: infer P }
  ? P
  : never;

function fakePrisma(over: {
  companyIds?: string[];
  obligations?: Array<{ subscriptionId: string; periodStart: Date; periodEnd: Date }>;
  subscriptionsThrows?: boolean;
  obligationsThrows?: boolean;
} = {}) {
  return {
    subscription: {
      findMany: vi.fn(async () => {
        if (over.subscriptionsThrows) throw new Error("banco fora");
        return (over.companyIds ?? ["co-1"]).map((companyId) => ({ companyId }));
      }),
    },
    billingObligation: {
      findMany: vi.fn(async () => {
        if (over.obligationsThrows) throw new Error("banco fora");
        return over.obligations ?? [];
      }),
    },
  } as unknown as FakePrisma;
}

function entry(companyId: string, outcome: BatchEntry["outcome"]): BatchEntry {
  return { companyId, outcome };
}

const OBLIGACAO = {
  id: "ob-1",
  sequence: 1,
  state: "PLANNED" as const,
  disposition: "CHARGE" as const,
  periodStart: new Date("2026-09-04T00:00:00Z"),
  periodEnd: new Date("2026-10-04T00:00:00Z"),
  priceCents: 18990,
};

function shadowReport(over: Partial<ShadowReport> = {}): ShadowReport {
  return {
    runAt: NOW,
    avaliadas: 1,
    cobraria: { empresas: 1, totalCents: 18990 },
    restringiria: 0,
    porMotivo: {},
    persistidas: 1,
    decisions: [],
    resumo: "resumo do sombra",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.subscription.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.billingObligation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 3 — as flags são independentes, e nenhuma delas é invoiceGenerationEnabled
// ═══════════════════════════════════════════════════════════════════════════════

describe("flags independentes", () => {
  it("geração DESLIGADA → o motor nem é chamado", async () => {
    const runObligationsFn = vi.fn();
    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => false,
      isShadowEnabledFn: () => false,
      runObligationsFn,
      now: NOW,
    });

    expect(out.skipped).toBe("generation_disabled");
    expect(runObligationsFn).not.toHaveBeenCalled();
    expect(out.avaliadas).toBe(0);
  });

  it("🔑 MUTAÇÃO: ignorar a flag e rodar sempre é pego — nada é gerado com ela OFF", async () => {
    // Se alguém apagar o `if (!isGenerationEnabled())`, este teste cai: o motor
    // passaria a ser chamado com a etapa 1 do rollout desligada, e o modo de
    // falha de um motor de cobrança ligado por engano é cobrar quem não devia.
    const runObligationsFn = vi.fn(async () => [
      entry("co-1", { kind: "issued", obligation: OBLIGACAO, invoiceId: "inv-1", dueAt: NOW, emailStatus: "SENT" }),
    ]);

    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => false,
      isShadowEnabledFn: () => false,
      runObligationsFn,
      now: NOW,
    });

    expect(runObligationsFn).not.toHaveBeenCalled();
    expect(out.emitidas).toBe(0);
    expect(out.criadas).toBe(0);
  });

  it("sombra LIGADO com geração DESLIGADA → o sombra roda mesmo assim", async () => {
    // A ordem do rollout é medir ANTES de ligar o motor. Travar o sombra atrás
    // da geração inverteria essa ordem e deixaria a etapa 3 inalcançável.
    const runShadowFn = vi.fn(async () => shadowReport());
    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => false,
      isShadowEnabledFn: () => true,
      runObligationsFn: vi.fn(),
      runShadowFn,
      now: NOW,
    });

    expect(runShadowFn).toHaveBeenCalledTimes(1);
    expect(out.sombra).toEqual({ avaliadas: 1, cobraria: 1, totalCents: 18990 });
    expect(out.skipped).toBe("generation_disabled");
  });

  it("sombra DESLIGADO → não é chamado e não custa listagem", async () => {
    const runShadowFn = vi.fn();
    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      runShadowFn,
      now: NOW,
    });

    expect(runShadowFn).not.toHaveBeenCalled();
    expect(out.sombra).toBeNull();
  });

  it("as DUAS ligadas → geração roda ANTES do sombra (o relatório descreve o mundo que ficou)", async () => {
    const ordem: string[] = [];
    const runObligationsFn = vi.fn(async () => {
      ordem.push("geracao");
      return [];
    });
    const runShadowFn = vi.fn(async () => {
      ordem.push("sombra");
      return shadowReport();
    });

    await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => true,
      runObligationsFn,
      runShadowFn,
      now: NOW,
    });

    expect(ordem).toEqual(["geracao", "sombra"]);
  });

  it("sombra que LANÇA não derruba a fase de geração", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => true,
      runObligationsFn: vi.fn(async () => [
        entry("co-1", { kind: "planned", obligation: OBLIGACAO, created: true }),
      ]),
      runShadowFn: vi.fn(async () => {
        throw new Error("sombra explodiu");
      }),
      now: NOW,
    });

    expect(out.criadas).toBe(1);
    expect(out.sombra).toBeNull();
    expect(out.falhas).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// needs_bootstrap — estado NORMAL, não erro e não ruído
// ═══════════════════════════════════════════════════════════════════════════════

describe("needs_bootstrap é estado normal, não falha", () => {
  it("16 assinaturas sem âncora → semAncora=16, falhas=0", async () => {
    const companyIds = Array.from({ length: 16 }, (_, i) => `co-${i}`);
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({ companyIds }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async (ids: string[]) =>
        ids.map((id) => entry(id, { kind: "skipped", reason: "needs_bootstrap" })),
      ),
      now: NOW,
    });

    expect(out.semAncora).toBe(16);
    expect(out.falhas).toBe(0);
    expect(out.nadaAFazer).toBe(0);
    expect(out.porMotivo.needs_bootstrap).toBe(16);
  });

  it("🔑 MUTAÇÃO: needs_bootstrap NÃO polui o log como erro — nem 16 linhas, nem uma", async () => {
    // Se `needs_bootstrap` cair no ramo de `failed` ou no `log.error`, este teste
    // cai. Um log que grita todo dia sobre o esperado é um log que ninguém lê no
    // dia do inesperado.
    const companyIds = Array.from({ length: 16 }, (_, i) => `co-${i}`);
    await runGenerationPhase({
      prismaClient: fakePrisma({ companyIds }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async (ids: string[]) =>
        ids.map((id) => entry(id, { kind: "skipped", reason: "needs_bootstrap" })),
      ),
      now: NOW,
    });

    expect(logErrorMock).not.toHaveBeenCalled();
    expect(logWarnMock).not.toHaveBeenCalled();

    // UMA linha agregada de info — suficiente para ver o bootstrap pendente,
    // insuficiente para virar ruído.
    const agregadas = logInfoMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("sem âncora"),
    );
    expect(agregadas).toHaveLength(1);
    expect(agregadas[0][1]).toMatchObject({ semAncora: 16 });
  });

  it("distingue 'não há o que cobrar' de 'não sei quem é essa gente'", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({ companyIds: ["a", "b", "c"] }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => [
        entry("a", { kind: "skipped", reason: "needs_bootstrap" }),
        entry("b", { kind: "skipped", reason: "outside_horizon" }),
        entry("c", { kind: "skipped", reason: "no_effective_subscription" }),
      ]),
      now: NOW,
    });

    expect(out.semAncora).toBe(1);
    expect(out.nadaAFazer).toBe(2);
    expect(out.falhas).toBe(0);
  });

  it("failed de verdade conta como falha e vai para o log de erro", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => [
        entry("co-1", {
          kind: "failed",
          reason: "ambiguous_subscription",
          detail: "duas vivas",
          retryable: false,
        }),
      ]),
      now: NOW,
    });

    expect(out.falhas).toBe(1);
    expect(out.semAncora).toBe(0);
    expect(logErrorMock).toHaveBeenCalled();
  });

  it("motivo de skip DESCONHECIDO conta como falha (o novo aparece, não some)", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma(),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => [
        // Simula um valor acrescentado ao enum sem passar pela classificação.
        entry("co-1", {
          kind: "skipped",
          reason: "motivo_inventado" as never,
        }),
      ]),
      now: NOW,
    });

    expect(out.falhas).toBe(1);
    expect(logWarnMock).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Contagem dos desfechos
// ═══════════════════════════════════════════════════════════════════════════════

describe("telemetria dos desfechos", () => {
  it("issued/planned/settled entram nos contadores certos", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({ companyIds: ["a", "b", "c", "d"] }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => [
        entry("a", { kind: "issued", obligation: OBLIGACAO, invoiceId: "i", dueAt: NOW, emailStatus: "SENT" }),
        entry("b", { kind: "planned", obligation: OBLIGACAO, created: true }),
        entry("c", { kind: "planned", obligation: OBLIGACAO, created: false }),
        entry("d", { kind: "settled", obligation: OBLIGACAO, created: true }),
      ]),
      now: NOW,
    });

    expect(out.emitidas).toBe(1);
    // b (planned novo) + d (settled criada agora) — c foi REENCONTRADA, não criada.
    expect(out.criadas).toBe(2);
    expect(out.quitadas).toBe(1);
    expect(out.porMotivo).toMatchObject({
      issued: 1,
      planned_created: 1,
      planned_existing: 1,
      settled: 1,
    });
  });

  it("falha na LISTAGEM não lança — vira falha da rodada", async () => {
    const runObligationsFn = vi.fn();
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({ subscriptionsThrows: true }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn,
      now: NOW,
    });

    expect(out.falhas).toBe(1);
    expect(out.porMotivo.listagem_falhou).toBe(1);
    expect(runObligationsFn).not.toHaveBeenCalled();
  });

  it("o lote só inclui assinaturas não-terminais (CANCELED/TRIAL_EXPIRED ficam fora)", async () => {
    const p = fakePrisma();
    await runGenerationPhase({
      prismaClient: p,
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    const where = (p as unknown as { subscription: { findMany: ReturnType<typeof vi.fn> } })
      .subscription.findMany.mock.calls[0][0];
    expect(where.where.status.in).toEqual(["ACTIVE", "PAST_DUE", "SUSPENDED", "TRIAL"]);
    expect(where.where.status.in).not.toContain("CANCELED");
    expect(where.where.status.in).not.toContain("TRIAL_EXPIRED");
    expect(where.distinct).toEqual(["companyId"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 2 — teto de UMA obrigação por assinatura por rodada
// ═══════════════════════════════════════════════════════════════════════════════

describe("teto de 1 obrigação por assinatura por rodada", () => {
  it("uma empresa produz no máximo UM desfecho por rodada", async () => {
    // O teto é ESTRUTURAL no motor: `resolveNextObligationPlan` devolve UM plano
    // (não uma lista) e `runObligationForCompany` a chama uma vez. Esta fase não
    // reimplementa o teto — ela não pode DESFAZÊ-lo, e é isso que se prova: um
    // companyId no lote nunca vira mais de uma obrigação contada.
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({ companyIds: ["co-1"] }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async (ids: string[]) => {
        expect(ids).toEqual(["co-1"]);
        return [entry("co-1", { kind: "planned", obligation: OBLIGACAO, created: true })];
      }),
      now: NOW,
    });

    expect(out.criadas).toBe(1);
  });

  it("a mesma empresa não aparece duas vezes no lote (distinct por companyId)", async () => {
    // Duas assinaturas vivas da MESMA empresa não podem virar duas passagens
    // pelo motor na mesma rodada — seriam duas obrigações no mesmo tick.
    const p = fakePrisma();
    await runGenerationPhase({
      prismaClient: p,
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    const args = (p as unknown as { subscription: { findMany: ReturnType<typeof vi.fn> } })
      .subscription.findMany.mock.calls[0][0];
    expect(args.distinct).toEqual(["companyId"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 4 — detector de descontinuidade
// ═══════════════════════════════════════════════════════════════════════════════

describe("detector de descontinuidade", () => {
  const d = (iso: string) => new Date(iso);

  it("linha do tempo contígua → nenhum alarme", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({
        obligations: [
          { subscriptionId: "s1", periodStart: d("2026-07-01"), periodEnd: d("2026-08-01") },
          { subscriptionId: "s1", periodStart: d("2026-08-01"), periodEnd: d("2026-09-01") },
          { subscriptionId: "s1", periodStart: d("2026-09-01"), periodEnd: d("2026-10-01") },
        ],
      }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    expect(out.descontinuidades).toBe(0);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("🔑 buraco na sequência → ALARME (Sentry + log + resumo), nos TRÊS destinos", async () => {
    // Se o detector deixar de alarmar, este teste cai nos três lugares de uma vez.
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({
        obligations: [
          { subscriptionId: "s1", periodStart: d("2026-07-01"), periodEnd: d("2026-08-01") },
          // Falta agosto: o próximo começa em setembro.
          { subscriptionId: "s1", periodStart: d("2026-09-01"), periodEnd: d("2026-10-01") },
        ],
      }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    expect(out.descontinuidades).toBe(1);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock.mock.calls[0][0]).toContain("descontinuidade");
    expect(captureMessageMock.mock.calls[0][1]).toMatchObject({ level: "error" });
    expect(
      logErrorMock.mock.calls.some(
        (c) => typeof c[0] === "string" && c[0].includes("DESCONTINUIDADE"),
      ),
    ).toBe(true);
  });

  it("🔑 o alarme NÃO bloqueia: a geração da mesma rodada continua contando", async () => {
    // A decisão do plano é alarme, não bloqueio. Bloquear transformaria "uma
    // assinatura com histórico torto" em "ninguém foi cobrado este mês".
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({
        obligations: [
          { subscriptionId: "s1", periodStart: d("2026-07-01"), periodEnd: d("2026-08-01") },
          { subscriptionId: "s1", periodStart: d("2026-09-01"), periodEnd: d("2026-10-01") },
        ],
      }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => [
        entry("co-1", { kind: "issued", obligation: OBLIGACAO, invoiceId: "i", dueAt: NOW, emailStatus: "SENT" }),
      ]),
      now: NOW,
    });

    expect(out.descontinuidades).toBe(1);
    expect(out.emitidas).toBe(1);
    expect(out.falhas).toBe(0);
  });

  it("assinaturas diferentes não se contaminam (o fim de uma ≠ início da outra)", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({
        obligations: [
          { subscriptionId: "s1", periodStart: d("2026-07-01"), periodEnd: d("2026-08-01") },
          { subscriptionId: "s2", periodStart: d("2026-11-01"), periodEnd: d("2026-12-01") },
        ],
      }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    expect(out.descontinuidades).toBe(0);
  });

  it("🔑 ordena por (subscriptionId, periodStart) — sem isso, linha PERFEITA vira alarme falso", async () => {
    // `isContiguous` NÃO ordena: a docstring dela assume a lista já ordenada. Se
    // o `orderBy` sumir, o Postgres devolve em ordem física e toda assinatura
    // saudável passa a alarmar em toda rodada.
    const p = fakePrisma();
    await runGenerationPhase({
      prismaClient: p,
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    const args = (p as unknown as { billingObligation: { findMany: ReturnType<typeof vi.fn> } })
      .billingObligation.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ subscriptionId: "asc" }, { periodStart: "asc" }]);
    // E ignora as ANULADAS: `VOID` é período desfeito de propósito.
    expect(args.where).toEqual({ state: { not: "VOID" } });
  });

  it("falha ao LER as obrigações não derruba a fase", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({ obligationsThrows: true }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => [
        entry("co-1", { kind: "planned", obligation: OBLIGACAO, created: true }),
      ]),
      now: NOW,
    });

    expect(out.descontinuidades).toBe(0);
    expect(out.criadas).toBe(1);
  });

  it("duas assinaturas descontínuas → dois alarmes", async () => {
    const out = await runGenerationPhase({
      prismaClient: fakePrisma({
        obligations: [
          { subscriptionId: "s1", periodStart: d("2026-07-01"), periodEnd: d("2026-08-01") },
          { subscriptionId: "s1", periodStart: d("2026-09-01"), periodEnd: d("2026-10-01") },
          { subscriptionId: "s2", periodStart: d("2026-01-01"), periodEnd: d("2026-02-01") },
          { subscriptionId: "s2", periodStart: d("2026-03-01"), periodEnd: d("2026-04-01") },
        ],
      }),
      isGenerationEnabledFn: () => true,
      isShadowEnabledFn: () => false,
      runObligationsFn: vi.fn(async () => []),
      now: NOW,
    });

    expect(out.descontinuidades).toBe(2);
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fronteira estrutural — a fase não fala com o gateway
// ═══════════════════════════════════════════════════════════════════════════════

describe("fronteira", () => {
  it("este módulo não importa gateway nem envio direto", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = readFileSync(
      resolve(process.cwd(), "src/services/billing-generation-phase.service.ts"),
      "utf8",
    );

    // A fase ORQUESTRA; quem fala com o Asaas é o motor, atrás das suas guardas
    // e das suas flags. Um import direto daqui pularia todas elas.
    for (const proibido of ["asaas", "invoice-charge", "invoice-send"]) {
      expect(
        fonte.includes(`"@/lib/${proibido}`) || fonte.includes(`"@/services/${proibido}`),
        `A fase de geração passou a importar ${proibido} diretamente — o gateway é produção SEM sandbox.`,
      ).toBe(false);
    }
  });
});
