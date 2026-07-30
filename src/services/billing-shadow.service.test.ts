import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));

import {
  runShadowForCompanies,
  shadowDecisionForCompany,
  SHADOW_NAO_PROVA,
  type ShadowDeps,
} from "@/services/billing-shadow.service";

const NOW = new Date("2026-09-01T12:00:00Z");
const COMPANY_ID = "co-1";
const SUB_ID = "sub-1";
/** Dentro do horizonte de ISSUE_LEAD_DAYS a partir de NOW. */
const ANCHOR = new Date("2026-09-04T00:00:00Z");
const ANCHOR_END = new Date("2026-10-04T00:00:00Z");

// ── Banco falso ──────────────────────────────────────────────────────────────

interface FakeState {
  company: { id: string; name: string; cnpj: string | null } | null;
  subscriptions: Array<Record<string, unknown>>;
  obligations: Array<Record<string, unknown>>;
  courtesies: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
}

let state: FakeState;
const shadowCreateMany = vi.fn();

function defaultSubscription(over: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    companyId: COMPANY_ID,
    status: "ACTIVE",
    billingCycle: "MONTHLY",
    asaasSubscriptionId: null,
    discountPercent: null,
    discountExpiresAt: null,
    planId: "plan-1",
    plan: { id: "plan-1", name: "Clinica", priceMonthly: 18990, priceYearly: 189900 },
    ...over,
  };
}

function matchObligation(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
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
    if (key === "dueAt" && value && typeof value === "object" && "lt" in value) {
      const dueAt = row.dueAt as Date | null | undefined;
      if (!dueAt) return false;
      if (dueAt.getTime() >= ((value as { lt: Date }).lt).getTime()) return false;
      continue;
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function matchInvoice(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (key === "subscription" && value && typeof value === "object") {
      const sub = state.subscriptions.find((s) => s.id === row.subscriptionId);
      const esperado = (value as { companyId?: string }).companyId;
      if (esperado !== undefined && sub?.companyId !== esperado) return false;
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

function makePrisma() {
  return {
    company: {
      findUnique: async (args: { where: { id: string } }) =>
        state.company && state.company.id === args.where.id ? { ...state.company } : null,
    },
    subscription: {
      findMany: async () => state.subscriptions.map((s) => ({ ...s })),
    },
    subscriptionCourtesy: {
      findMany: async () => state.courtesies.map((c) => ({ ...c })),
    },
    billingObligation: {
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
    },
    invoice: {
      findMany: async (args: { where?: Record<string, unknown> }) =>
        state.invoices.filter((i) => matchInvoice(i, args?.where)).map((i) => ({ ...i })),
      findUnique: async (args: { where: { id: string } }) => {
        const row = state.invoices.find((i) => i.id === args.where.id);
        return row ? { ...row } : null;
      },
    },
    billingShadowDecision: {
      createMany: async (args: { data: unknown[] }) => {
        shadowCreateMany(args);
        return { count: args.data.length };
      },
    },
  } as unknown as ShadowDeps["prismaClient"];
}

const isShadowEnabledFn = vi.fn();
const hasDispatchedNoticeFn = vi.fn();

function deps(over: Partial<ShadowDeps> = {}): ShadowDeps {
  return {
    prismaClient: makePrisma(),
    isShadowEnabledFn,
    hasDispatchedNoticeFn,
    firstPeriodStartBySubscription: { [SUB_ID]: ANCHOR },
    now: NOW,
    ...over,
  };
}

function run(over: Partial<ShadowDeps> = {}) {
  return runShadowForCompanies([COMPANY_ID], deps(over));
}

beforeEach(() => {
  vi.clearAllMocks();
  isShadowEnabledFn.mockReturnValue(true);
  hasDispatchedNoticeFn.mockResolvedValue(false);
  state = {
    company: { id: COMPANY_ID, name: "Ótica Teste", cnpj: "20606235000131" },
    subscriptions: [defaultSubscription()],
    obligations: [],
    courtesies: [],
    invoices: [],
  };
});

// ═════════════════════════════════════════════════════════════════════════════
// O TESTE MAIS IMPORTANTE: a garantia ESTRUTURAL de não alcançar o gateway
// ═════════════════════════════════════════════════════════════════════════════

describe("garantia estrutural — o modo sombra não alcança o Asaas", () => {
  /**
   * 🔑 Este teste é a razão de o modo sombra existir sem sandbox. Ele não
   * confia em flag nem em mock: percorre o GRAFO DE IMPORTAÇÃO real a partir de
   * `billing-shadow.service.ts` e prova que nenhum módulo capaz de falar com o
   * gateway (ou de emitir cobrança/e-mail) é alcançável a partir dele.
   *
   * Um mock provaria só que a rodada de HOJE não chamou. Isto prova que não
   * EXISTE caminho — inclusive para a refatoração de amanhã, que quebra este
   * teste em vez de gastar dinheiro do cliente.
   */
  const PROIBIDOS = [
    "asaas",
    "invoice-charge",
    "invoice-send",
    "invoice-reminders",
    "trial-conversion-charge.service",
    "billing-obligation.service",
  ];

  function resolverImport(especificador: string, deArquivo: string): string | null {
    let base: string;
    if (especificador.startsWith("@/")) {
      base = resolve(process.cwd(), "src", especificador.slice(2));
    } else if (especificador.startsWith(".")) {
      base = resolve(dirname(deArquivo), especificador);
    } else {
      return null; // pacote externo — fora do escopo do nosso código
    }
    for (const sufixo of [".ts", ".tsx", "/index.ts", ".js"]) {
      const candidato = `${base}${sufixo}`;
      if (existsSync(candidato)) return candidato;
    }
    return existsSync(base) ? base : null;
  }

  function grafoDeImports(entrada: string): Map<string, string[]> {
    const visitados = new Map<string, string[]>();
    const fila = [entrada];

    while (fila.length > 0) {
      const arquivo = fila.pop() as string;
      if (visitados.has(arquivo)) continue;

      const fonte = readFileSync(arquivo, "utf8");
      // Pega `import ... from "x"`, `export ... from "x"`, `import("x")` e
      // `require("x")`. O `require` entrou depois de a revisão furar a versão
      // anterior com ele: em ESM um require de topo quebraria ruidosamente, mas
      // um buraco estreito num teste que existe para impedir cobrança indevida
      // não se deixa aberto por ser estreito.
      const especificadores = [
        ...fonte.matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g),
      ].map((m) => m[1]);

      visitados.set(arquivo, especificadores);
      for (const esp of especificadores) {
        const alvo = resolverImport(esp, arquivo);
        if (alvo && !visitados.has(alvo)) fila.push(alvo);
      }
    }
    return visitados;
  }

  it("nenhum módulo de gateway/emissão é alcançável a partir do serviço sombra", () => {
    const entrada = resolve(process.cwd(), "src/services/billing-shadow.service.ts");
    const grafo = grafoDeImports(entrada);

    const alcancados = [...grafo.keys()].map((f) => f.replace(process.cwd(), ""));
    const proibidosAlcancados = alcancados.filter((f) =>
      PROIBIDOS.some((p) => f.includes(p)),
    );

    // Mensagem de erro que EXPLICA, para quem quebrar isto amanhã entender por quê.
    expect(
      proibidosAlcancados,
      `O modo sombra passou a alcançar módulo(s) capazes de cobrar/enviar: ${proibidosAlcancados.join(", ")}.\n` +
        `O gateway Asaas é PRODUÇÃO SEM SANDBOX: o primeiro disparo é dinheiro real.\n` +
        `Se este import é mesmo necessário, o modo sombra deixou de ser sombra.`,
    ).toEqual([]);

    // Sanidade: o grafo foi realmente percorrido (senão o teste passaria vazio).
    expect(alcancados.length).toBeGreaterThan(3);
    expect(alcancados.some((f) => f.includes("billing-obligation.ts"))).toBe(true);
  });

  it("o serviço sombra escreve em UMA tabela só — billing_shadow_decisions", () => {
    // 🔑 Mutação coberta: se alguém fizer o sombra escrever em BillingObligation,
    // este teste cai. É a segunda metade da regra da spec — nunca a tabela real.
    const fonte = readFileSync(
      resolve(process.cwd(), "src/services/billing-shadow.service.ts"),
      "utf8",
    );

    const escritas = [
      ...fonte.matchAll(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g),
    ].map((m) => m[0]);

    // A única escrita do arquivo é o createMany das decisões.
    expect(escritas).toEqual([".createMany("]);
    expect(fonte).toContain("billingShadowDecision.createMany");
    expect(fonte).not.toContain("billingObligation.create");
    expect(fonte).not.toContain("billingObligation.update");
    expect(fonte).not.toContain("invoice.create");
    expect(fonte).not.toContain("$executeRaw");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PARIDADE DE GUARDAS — o alarme para quando o motor ganhar uma guarda nova
// ═════════════════════════════════════════════════════════════════════════════

describe("paridade com as guardas do motor", () => {
  /**
   * 🔑 POR QUE ESTE TESTE EXISTE. O modo sombra é uma SEGUNDA implementação da
   * leitura (ver a docstring do serviço), e o custo dessa escolha é exatamente
   * este: uma guarda nova no motor pode nascer ausente aqui, e o relatório passa
   * a prometer cobrança que o motor recusaria. Já aconteceu duas vezes nesta
   * task — `DRAFT` tratada como cobrável, e a disposição GRAVADA ignorada.
   *
   * O que este teste consegue provar, de forma robusta: toda guarda do motor
   * emite um `reason:` literal, e esse conjunto é extraível do fonte. Se o motor
   * ganhar um motivo que o sombra não conhece nem justificou, o teste falha e
   * obriga uma decisão consciente.
   *
   * O que ele NÃO prova, e não há como provar por análise estática: que a
   * SEMÂNTICA de cada guarda seja equivalente. Um `needs_review` novo no motor,
   * com condição diferente, reusa um motivo já mapeado e passaria por aqui — foi
   * o caso da disposição gravada, que caiu em `settled`, um desfecho já
   * conhecido. Contra isso a defesa é o teste por caso (acima), não este.
   *
   * A alternativa considerada e recusada: rodar motor e sombra lado a lado sobre
   * o mesmo estado e comparar. Ela provaria semântica de verdade, mas exigiria
   * dar ao motor um banco falso ESCRITÁVEL e deixá-lo chegar à fase 3 — ou seja,
   * ao gateway — dentro da suíte do sombra. É precisamente a fronteira que o
   * teste de grafo de imports existe para manter fechada, e um mock mal
   * configurado ali é dinheiro real. Não vale o risco.
   */

  /** Motivos do motor que o sombra reproduz, com o motivo equivalente aqui. */
  const MAPEADOS: Record<string, string> = {
    // Guardas com equivalente direto no sombra.
    no_effective_subscription: "no_effective_subscription",
    ambiguous_subscription: "ambiguous_subscription",
    company_not_found: "company_not_found",
    native_asaas_subscription: "native_asaas_subscription",
    needs_bootstrap: "needs_bootstrap",
    outside_horizon: "outside_horizon",
    missing_document: "missing_document",
    unmapped_invoice_overlap: "unmapped_invoice_overlap",
    needs_review: "needs_review",
    already_settled: "already_settled",
    invalid_calendar: "invalid_data",
    invalid_price: "invalid_data",
    unexpected: "invalid_data",
    courtesy: "courtesy",

    // Guardas deliberadamente SEM equivalente — cada uma com o porquê.
    //
    // O sombra tem a própria flag (`shadow_disabled`) e não observa a etapa 1.
    generation_disabled: "N/A: flag de outra etapa do rollout",
    // O sombra roda justamente COM a emissão desligada; é a premissa dele.
    issuance_not_enabled: "N/A: o modo sombra existe porque a emissão está off",
    // Corridas e locks não existem no sombra: ele não escreve e não pega lock.
    attempt_race: "N/A: o sombra não reserva tentativa (não escreve)",
    lock_timeout: "N/A: o sombra não pega advisory lock",
    // Só alcançável na fase 3, que o sombra declaradamente não exercita.
    gateway_error: "N/A: fase 3 (gateway) — declarado em SHADOW_NAO_PROVA",
  };

  it("todo motivo do motor está mapeado ou justificado como ausente", () => {
    const fonte = readFileSync(
      resolve(process.cwd(), "src/services/billing-obligation.service.ts"),
      "utf8",
    );
    const doMotor = new Set(
      [...fonte.matchAll(/reason:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    );

    expect(doMotor.size).toBeGreaterThan(10); // sanidade da extração

    const naoMapeados = [...doMotor].filter((r) => !(r in MAPEADOS));

    expect(
      naoMapeados,
      `O motor ganhou guarda(s) que o modo sombra não conhece: ${naoMapeados.join(", ")}.\n` +
        `O sombra é uma SEGUNDA implementação da leitura — uma guarda nova no motor\n` +
        `NÃO aparece aqui sozinha, e o relatório passa a prometer cobrança que o\n` +
        `motor recusaria. Decida conscientemente: ou reproduza a guarda em\n` +
        `billing-shadow.service.ts, ou registre em MAPEADOS por que ela não se aplica.`,
    ).toEqual([]);
  });

  it("a disposição GRAVADA não-CHARGE é uma guarda do motor que o sombra reproduz", () => {
    // Trava específica do defeito que escapou: o motor decide pela disposição
    // como está no banco antes de recalcular. Se essa guarda sumir do sombra,
    // os testes de caso caem — este documenta que ela é obrigatória.
    const sombra = readFileSync(
      resolve(process.cwd(), "src/services/billing-shadow.service.ts"),
      "utf8",
    );
    expect(sombra).toContain('pending.disposition !== "CHARGE"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A flag
// ═════════════════════════════════════════════════════════════════════════════

describe("flag da etapa 3", () => {
  it("desligada: não lê nada, não grava nada e diz que não avaliou", async () => {
    isShadowEnabledFn.mockReturnValue(false);
    const rel = await run();

    expect(rel.avaliadas).toBe(0);
    expect(rel.decisions).toEqual([]);
    expect(shadowCreateMany).not.toHaveBeenCalled();
    expect(rel.resumo).toContain("DESLIGADO");
  });

  it("ligada: avalia e grava", async () => {
    const rel = await run();
    expect(rel.avaliadas).toBe(1);
    expect(shadowCreateMany).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// wouldCharge — o número que o dono vai ler
// ═════════════════════════════════════════════════════════════════════════════

describe("wouldCharge", () => {
  it("assinatura normal com âncora: cobraria, com valor e período", async () => {
    const rel = await run();
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(true);
    expect(d.priceCents).toBe(18990);
    expect(d.disposition).toBe("CHARGE");
    expect(d.periodStart).toEqual(ANCHOR);
    expect(d.periodEnd).toEqual(ANCHOR_END);
    expect(d.reason).toBeNull();
    expect(rel.cobraria).toEqual({ empresas: 1, totalCents: 18990 });
    expect(d.note).toContain("R$ 189,90");
  });

  it("cortesia vigente: NÃO cobraria, e registra a receita não faturada CHEIA", async () => {
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];
    const rel = await run();
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.disposition).toBe("COURTESY");
    expect(d.reason).toBe("courtesy");
    // Preço CHEIO: é a receita que se deixou de faturar.
    expect(d.priceCents).toBe(18990);
    expect(rel.cobraria.totalCents).toBe(0);
  });

  it("plano de preço zero: conta interna, não cobraria e vale 0", async () => {
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-0", name: "Interno", priceMonthly: 0, priceYearly: 0 },
      }),
    ];
    const rel = await run();
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.disposition).toBe("INTERNAL");
    expect(d.priceCents).toBe(0);
  });

  it("sem CPF/CNPJ: NÃO cobraria — o motor real recusa antes do gateway", async () => {
    // 🔑 A guarda da FASE 2 do motor. Se o sombra não a reproduzisse, o dono
    // leria "cobraria" para uma empresa que o motor recusaria emitir.
    state.company = { id: COMPANY_ID, name: "Sem Doc", cnpj: null };
    const rel = await run();
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("missing_document");
    expect(rel.resumo).toContain("PRECISA DE AÇÃO HUMANA");
  });

  it("CNPJ com dígitos a menos também barra", async () => {
    state.company = { id: COMPANY_ID, name: "Doc Curto", cnpj: "123" };
    const [d] = (await run()).decisions;
    expect(d.reason).toBe("missing_document");
  });

  it("fatura sobreposta sem vínculo: NÃO cobraria (risco de cobrança dupla)", async () => {
    // 🔑 A outra guarda da fase 2 — as 8 faturas históricas e a de conversão de
    // trial não gravam `billingObligationId`, então só a interseção de datas
    // as encontra.
    state.invoices = [
      {
        id: "inv-hist",
        number: "INV-000003",
        subscriptionId: SUB_ID,
        billingObligationId: null,
        isManual: false,
        status: "PENDING",
        periodStart: new Date("2026-09-01T00:00:00Z"),
        periodEnd: new Date("2026-10-01T00:00:00Z"),
      },
    ];
    const rel = await run();
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("unmapped_invoice_overlap");
    expect(d.note).toContain("INV-000003");
  });

  it("fatura de OUTRO período não barra", async () => {
    state.invoices = [
      {
        id: "inv-velha",
        number: "INV-000001",
        subscriptionId: SUB_ID,
        billingObligationId: null,
        isManual: false,
        status: "PAID",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-02-01T00:00:00Z"),
      },
    ];
    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(true);
  });

  it("assinatura nativa do Asaas: o motor não opera, então não cobraria", async () => {
    state.subscriptions = [defaultSubscription({ asaasSubscriptionId: "sub_asaas_1" })];
    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("native_asaas_subscription");
  });

  it("duas assinaturas vivas: fail-closed, não cobraria e aparece como ação humana", async () => {
    state.subscriptions = [
      defaultSubscription({ id: "sub-a", status: "ACTIVE" }),
      defaultSubscription({ id: "sub-b", status: "TRIAL" }),
    ];
    const rel = await run();
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("ambiguous_subscription");
    expect(rel.resumo).toContain("PRECISA DE AÇÃO HUMANA");
  });

  it("fatura pendente CANCELADA na obrigação em aberto: precisa de revisão", async () => {
    state.obligations = [
      {
        id: "obl-1",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "PLANNED",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
        priceCents: 18990,
        cycle: "MONTHLY",
        invoiceId: "inv-cancelada",
      },
    ];
    state.invoices = [
      {
        id: "inv-cancelada",
        number: "INV-000009",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "CANCELED",
        total: 18990,
        asaasPaymentId: null,
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];
    const [d] = (await run()).decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("needs_review");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// needs_bootstrap — o caso de HOJE, que não pode parecer "nada a cobrar"
// ═════════════════════════════════════════════════════════════════════════════

describe("needs_bootstrap — o estado de hoje", () => {
  it("sem âncora: não decide nada, e o relatório GRITA que não é 'nada a cobrar'", async () => {
    // 🔑 Pré-bootstrap TODAS as assinaturas caem aqui. Um relatório que dissesse
    // apenas "cobraria: 0" seria lido pelo dono como "está tudo em dia".
    const rel = await runShadowForCompanies(
      [COMPANY_ID],
      deps({ firstPeriodStartBySubscription: {} }),
    );
    const [d] = rel.decisions;

    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("needs_bootstrap");
    expect(d.periodStart).toBeNull();

    expect(rel.resumo).toContain("SEM ÂNCORA");
    expect(rel.resumo).toContain("bootstrap não executado");
    expect(rel.resumo).toContain('NÃO quer dizer "nada a cobrar"');
    expect(rel.resumo).toContain("os números abaixo não medem nada ainda");
  });

  it("sem período, nada é gravado no artefato (não inventa data nem preço)", async () => {
    await runShadowForCompanies([COMPANY_ID], deps({ firstPeriodStartBySubscription: {} }));
    expect(shadowCreateMany).not.toHaveBeenCalled();
  });

  it("o alerta some quando parte das assinaturas já tem âncora", async () => {
    const rel = await runShadowForCompanies([COMPANY_ID], deps());
    expect(rel.resumo).not.toContain("SEM ÂNCORA");
  });

  it("o relatório avisa que a tabela ficou parcial (amostra ≠ censo)", async () => {
    // 🔑 Numa rodada pré-bootstrap a tabela fica VAZIA. Sem este aviso, quem
    // consultasse só o banco não distinguiria "rodou e nada coube" de "nunca rodou".
    const rel = await runShadowForCompanies(
      [COMPANY_ID],
      deps({ firstPeriodStartBySubscription: {} }),
    );
    expect(rel.persistidas).toBe(0);
    expect(rel.avaliadas).toBe(1);
    expect(rel.resumo).toContain("amostra parcial");
    expect(rel.resumo).toContain("Este relatório é o registro completo");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Obrigação PENDENTE: o motor RECALCULA antes de emitir — o sombra também
// ═════════════════════════════════════════════════════════════════════════════

describe("obrigação PLANNED é reavaliada, não lida como está gravada", () => {
  function pendente(over: Record<string, unknown> = {}) {
    return {
      id: "obl-1",
      subscriptionId: SUB_ID,
      sequence: 1,
      state: "PLANNED",
      disposition: "CHARGE",
      periodStart: ANCHOR,
      periodEnd: ANCHOR_END,
      priceCents: 18990,
      cycle: "MONTHLY",
      invoiceId: null,
      ...over,
    };
  }

  it("LEGACY_WAIVED gravada: NUNCA cobra — o motor quita e devolve settled", async () => {
    // 🔑 O passado que o dono declarou encerrado. O motor lê a disposição
    // GRAVADA antes de recalcular qualquer coisa e devolve `settled`. Recalcular
    // por cima devolveria "CHARGE" e o relatório prometeria uma cobrança que o
    // motor não faria — justamente na janela bootstrap → sombra → emissão, em
    // que o bootstrap acabou de escrever LEGACY_WAIVED em massa.
    state.obligations = [pendente({ disposition: "LEGACY_WAIVED" })];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.disposition).toBe("LEGACY_WAIVED");
    expect(d.reason).toBe("legacy_waived");
    expect(d.note).not.toContain("COBRARIA");
  });

  it("COURTESY gravada à mão numa linha PLANNED: não cobra", async () => {
    // Sem cortesia vigente na tabela — só a disposição escrita direto pelo
    // bootstrap ou pelas ferramentas de operação. O recálculo sozinho diria
    // CHARGE; a guarda da disposição gravada é o que impede.
    state.obligations = [pendente({ disposition: "COURTESY" })];
    state.courtesies = [];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.disposition).toBe("COURTESY");
    expect(d.reason).toBe("courtesy");
  });

  it("INTERNAL gravada preserva o preço GRAVADO, não recalcula", async () => {
    // Numa linha isenta o preço é registro histórico do que se deixou de
    // faturar; refazer a conta com o plano de hoje reescreveria esse número.
    state.obligations = [pendente({ disposition: "INTERNAL", priceCents: 0 })];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-1", name: "Clinica", priceMonthly: 24990, priceYearly: 249900 },
      }),
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.priceCents).toBe(0);
  });

  it("isenta gravada vence até a guarda de ciclo trocado", async () => {
    // No motor a guarda da disposição vem antes de tudo: numa linha isenta o
    // ciclo é irrelevante porque não há preço a recalcular.
    state.obligations = [
      pendente({ disposition: "LEGACY_WAIVED", cycle: "MONTHLY" }),
    ];
    state.subscriptions = [defaultSubscription({ billingCycle: "YEARLY" })];

    const [d] = (await run()).decisions;
    expect(d.reason).toBe("legacy_waived");
    expect(d.wouldCharge).toBe(false);
  });

  it("cortesia concedida DEPOIS da materialização: o motor quitaria, então não cobraria", async () => {
    // 🔑 O furo que a revisão pegou. Lendo `disposition` gravado ("CHARGE"), o
    // relatório diria COBRARIA para quem o dono acabou de isentar.
    state.obligations = [pendente()];
    state.courtesies = [
      { startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: null, revokedAt: null },
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.disposition).toBe("COURTESY");
    expect(d.reason).toBe("courtesy");
  });

  it("plano que virou preço zero: vira conta interna, não cobra o preço congelado", async () => {
    state.obligations = [pendente()];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-1", name: "Interno", priceMonthly: 0, priceYearly: 0 },
      }),
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.disposition).toBe("INTERNAL");
    expect(d.priceCents).toBe(0);
  });

  it("preço reajustado no intervalo: usa o preço de HOJE, não o congelado", async () => {
    state.obligations = [pendente({ priceCents: 18990 })];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-1", name: "Clinica", priceMonthly: 24990, priceYearly: 249900 },
      }),
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(true);
    expect(d.priceCents).toBe(24990);
  });

  it("ciclo trocado depois do período fechado: revisão humana, não recálculo silencioso", async () => {
    // Cobrar um ANO pelo período de um MÊS é o que esta guarda evita.
    state.obligations = [pendente({ cycle: "MONTHLY" })];
    state.subscriptions = [defaultSubscription({ billingCycle: "YEARLY" })];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("needs_review");
    expect(d.note).toContain("ANULAR");
  });

  it("fatura DRAFT não é cobrável — o motor real exige revisão", async () => {
    // 🔑 `decideOnExistingCharge` só reaproveita PENDING/OVERDUE. Listar apenas
    // CANCELED/REFUNDED deixaria DRAFT passar como cobrável.
    state.obligations = [pendente({ invoiceId: "inv-draft" })];
    state.invoices = [
      {
        id: "inv-draft",
        number: "INV-000010",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "DRAFT",
        total: 18990,
        asaasPaymentId: null,
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("needs_review");
  });

  it("fatura vinculada a OUTRA obrigação: ponteiro torto vira revisão humana", async () => {
    state.obligations = [pendente({ invoiceId: "inv-torta" })];
    state.invoices = [
      {
        id: "inv-torta",
        number: "INV-000011",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-OUTRA",
        isManual: false,
        status: "PENDING",
        total: 18990,
        asaasPaymentId: null,
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("needs_review");
    expect(d.note).toContain("não pertence a esta obrigação");
  });

  it("preço mudou DEPOIS de a cobrança ir ao gateway: anular e refazer", async () => {
    state.obligations = [pendente({ invoiceId: "inv-gw" })];
    state.subscriptions = [
      defaultSubscription({
        plan: { id: "plan-1", name: "Clinica", priceMonthly: 24990, priceYearly: 249900 },
      }),
    ];
    state.invoices = [
      {
        id: "inv-gw",
        number: "INV-000012",
        subscriptionId: SUB_ID,
        billingObligationId: "obl-1",
        isManual: false,
        status: "PENDING",
        total: 18990,
        asaasPaymentId: "pay_123",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
      },
    ];

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(false);
    expect(d.reason).toBe("needs_review");
    expect(d.note).toContain("gateway");
  });

  it("fatura PENDING coerente: cobraria normalmente", async () => {
    state.obligations = [pendente({ invoiceId: "inv-ok" })];
    state.invoices = [
      {
        id: "inv-ok",
        number: "INV-000013",
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

    const [d] = (await run()).decisions;
    expect(d.wouldCharge).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// wouldRestrict — I1 + I3
// ═════════════════════════════════════════════════════════════════════════════

describe("wouldRestrict", () => {
  it("sem obrigação nenhuma (hoje): false, e o relatório NÃO inventa a causa do zero", async () => {
    // 🔑 Zero pode ser cinco coisas diferentes (não há dívida / não venceu /
    // venceu sem aviso / falha de leitura / empresa nem avaliada). Afirmar uma
    // delas seria apresentar palpite como fato para quem vai decidir cobrar.
    const rel = await run();
    expect(rel.decisions[0].wouldRestrict).toBe(false);
    expect(rel.restringiria).toBe(0);
    expect(rel.resumo).toContain("Isso não distingue");
    expect(rel.resumo).not.toContain("hoje não existe obrigação emitida");
  });

  it("o relatório avisa que wouldRestrict mede a regra PRETENDIDA, não o cadeado atual", async () => {
    // O gate em produção ainda restringe por status da assinatura, sem ler
    // obrigação nenhuma. Sem esta ressalva o dono leria o número como se fosse
    // o comportamento de hoje.
    const rel = await run();
    expect(rel.resumo).toContain("regra PRETENDIDA da etapa 5");
    expect(rel.resumo).toContain("sem ler obrigação nenhuma");
  });

  it("obrigação EMITIDA e VENCIDA mas sem aviso despachado: NÃO restringe (I3)", async () => {
    // 🔑 O caso MedFacil: o e-mail foi redirecionado pelo modo de teste e nunca
    // chegou. Restringir aqui puniria o cliente por problema nosso.
    state.obligations = [
      {
        id: "obl-v",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "ISSUED",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
        priceCents: 18990,
        cycle: "MONTHLY",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        invoiceId: null,
      },
    ];
    hasDispatchedNoticeFn.mockResolvedValue(false);

    const [d] = (await run()).decisions;
    expect(d.wouldRestrict).toBe(false);
  });

  it("emitida, vencida E avisada: restringe", async () => {
    state.obligations = [
      {
        id: "obl-v",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "ISSUED",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
        priceCents: 18990,
        cycle: "MONTHLY",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        invoiceId: null,
      },
    ];
    hasDispatchedNoticeFn.mockResolvedValue(true);

    const rel = await run();
    expect(rel.decisions[0].wouldRestrict).toBe(true);
    expect(rel.restringiria).toBe(1);
  });

  it("emitida mas AINDA NÃO vencida: não restringe mesmo com aviso", async () => {
    // 🔑 I1 exige emitida **e vencida**. Sem o `dueAt < now`, uma cobrança criada
    // hoje com vencimento amanhã restringiria o cliente hoje.
    state.obligations = [
      {
        id: "obl-f",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "ISSUED",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
        priceCents: 18990,
        cycle: "MONTHLY",
        dueAt: new Date("2026-12-01T00:00:00Z"),
        invoiceId: null,
      },
    ];
    hasDispatchedNoticeFn.mockResolvedValue(true);

    const [d] = (await run()).decisions;
    expect(d.wouldRestrict).toBe(false);
  });

  it("obrigação PLANNED (não emitida) nunca restringe", async () => {
    state.obligations = [
      {
        id: "obl-p",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "PLANNED",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
        priceCents: 18990,
        cycle: "MONTHLY",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        invoiceId: null,
      },
    ];
    hasDispatchedNoticeFn.mockResolvedValue(true);

    const [d] = (await run()).decisions;
    expect(d.wouldRestrict).toBe(false);
  });

  it("erro ao ler a trilha: fail-closed a favor do cliente (não restringe)", async () => {
    state.obligations = [
      {
        id: "obl-v",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "ISSUED",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: ANCHOR_END,
        priceCents: 18990,
        cycle: "MONTHLY",
        dueAt: new Date("2026-08-01T00:00:00Z"),
        invoiceId: null,
      },
    ];
    hasDispatchedNoticeFn.mockRejectedValue(new Error("banco fora do ar"));

    const [d] = (await run()).decisions;
    expect(d.wouldRestrict).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Isolamento e persistência
// ═════════════════════════════════════════════════════════════════════════════

describe("isolamento por empresa", () => {
  it("uma empresa com dado corrompido não derruba a rodada das outras", async () => {
    // Obrigação anterior com periodEnd inválido → os módulos puros LANÇAM.
    state.obligations = [
      {
        id: "obl-ruim",
        subscriptionId: SUB_ID,
        sequence: 1,
        state: "PAID",
        disposition: "CHARGE",
        periodStart: ANCHOR,
        periodEnd: new Date("data-que-nao-existe"),
        priceCents: 18990,
        cycle: "MONTHLY",
        invoiceId: null,
      },
    ];

    const rel = await runShadowForCompanies([COMPANY_ID, "co-inexistente"], deps());

    expect(rel.avaliadas).toBe(2);
    expect(rel.decisions[0].reason).toBe("invalid_data");
    expect(rel.decisions[1].reason).toBe("company_not_found");
    // 🔑 Nunca lança: a rodada terminou e o relatório saiu.
    expect(rel.resumo).toContain("MODO SOMBRA");
  });
});

describe("persistência no artefato descartável", () => {
  it("grava uma linha por decisão com período, com os campos da decisão", async () => {
    await run();

    expect(shadowCreateMany).toHaveBeenCalledTimes(1);
    const { data } = shadowCreateMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      companyId: COMPANY_ID,
      subscriptionId: SUB_ID,
      wouldCharge: true,
      wouldRestrict: false,
      priceCents: 18990,
      disposition: "CHARGE",
      runAt: NOW,
    });
  });

  it("rodar duas vezes grava DUAS linhas — o artefato é histórico, não estado", async () => {
    // 🔑 Decisão consciente: deduplicar por dia esconderia a decisão MUDANDO
    // entre rodadas, que é justamente o que se quer observar antes de ligar a
    // emissão. E sem unique na tabela, deduplicar exigiria apagar evidência.
    await run();
    await run();
    expect(shadowCreateMany).toHaveBeenCalledTimes(2);
  });

  it("persist: false calcula sem gravar nada", async () => {
    const rel = await runShadowForCompanies([COMPANY_ID], deps({ persist: false }));
    expect(rel.decisions).toHaveLength(1);
    expect(shadowCreateMany).not.toHaveBeenCalled();
  });

  it("falha ao gravar NÃO derruba a rodada — o relatório continua válido", async () => {
    const prisma = makePrisma() as unknown as {
      billingShadowDecision: { createMany: () => Promise<unknown> };
    };
    prisma.billingShadowDecision.createMany = async () => {
      throw new Error("tabela não existe");
    };

    const rel = await runShadowForCompanies(
      [COMPANY_ID],
      deps({ prismaClient: prisma as unknown as ShadowDeps["prismaClient"] }),
    );
    expect(rel.cobraria.empresas).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O relatório para humano
// ═════════════════════════════════════════════════════════════════════════════

describe("relatório", () => {
  it("declara o que NÃO prova", async () => {
    const rel = await run();
    expect(rel.resumo).toContain("O QUE ESTA RODADA NÃO PROVA");
    for (const item of SHADOW_NAO_PROVA) {
      expect(rel.resumo).toContain(item);
    }
    expect(rel.resumo).toContain("gateway");
    expect(rel.resumo).toContain("webhook");
  });

  it("abre afirmando que nada aconteceu de verdade", async () => {
    const rel = await run();
    expect(rel.resumo).toContain("Nada foi cobrado, nada foi enviado, ninguém foi restringido");
  });

  it('não deixa "COBRARIA" ser lido como "a cobrança sairia"', async () => {
    // O modo sombra prova que o motor CHEGARIA à tentativa — não que o Asaas
    // aceitaria. Sem esta ressalva, o total vira uma promessa de receita.
    const rel = await run();
    expect(rel.resumo).toContain("chegaria à tentativa de emissão");
    expect(rel.resumo).toContain("recusar");
  });

  it("agrupa os motivos do não, com rótulo legível", async () => {
    state.company = { id: COMPANY_ID, name: "Sem Doc", cnpj: null };
    const rel = await run();

    expect(rel.porMotivo).toEqual({ missing_document: 1 });
    expect(rel.resumo).toContain("SEM CPF/CNPJ");
  });

  it("soma o total só de quem seria cobrado", async () => {
    const rel = await runShadowForCompanies([COMPANY_ID, "co-inexistente"], deps());
    expect(rel.cobraria).toEqual({ empresas: 1, totalCents: 18990 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Uma empresa isolada
// ═════════════════════════════════════════════════════════════════════════════

describe("shadowDecisionForCompany", () => {
  it("empresa inexistente devolve decisão, não exceção", async () => {
    const d = await shadowDecisionForCompany("co-fantasma", deps());
    expect(d.reason).toBe("company_not_found");
    expect(d.wouldCharge).toBe(false);
  });

  it("sem assinatura viva: ausência, não erro", async () => {
    state.subscriptions = [defaultSubscription({ status: "CANCELED" })];
    const d = await shadowDecisionForCompany(COMPANY_ID, deps());
    expect(d.reason).toBe("no_effective_subscription");
  });
});
