import { describe, it, expect } from "vitest";
import { detectSystemIssues, detectErrorRateIssue, detectCompanyIssues, detectIssues, sortIssues, type ProblemCompany } from "./issues";
import type { SystemPulse } from "./system-pulse";

function pulse(over: Partial<SystemPulse> = {}): SystemPulse {
  return {
    status: "ok",
    db: { status: "ok", latencyMs: 40 },
    uptimeS: 100, version: "abc", timestamp: "2026-06-05T00:00:00.000Z",
    reqCount: 100, errorCount: 0, errorRatePct: 0,
    p50Ms: 50, p95Ms: 200, slowQueries: 0,
    cacheHits: 0, cacheMisses: 0, cacheHitRatePct: null,
    memoryRssMb: 100, memoryHeapUsedMb: 60,
    ...over,
  };
}

describe("detectSystemIssues — sistema lento/fora do ar", () => {
  it("não dispara quando db ok e status ok", () => {
    expect(detectSystemIssues(pulse())).toEqual([]);
  });
  it("dispara warning quando db degraded", () => {
    const issues = detectSystemIssues(pulse({ db: { status: "degraded", latencyMs: 900 }, status: "degraded" }));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].category).toBe("system");
    expect(issues[0].id).toBe("system_slow");
  });
  it("dispara critical quando sistema down", () => {
    const issues = detectSystemIssues(pulse({ db: { status: "down", latencyMs: null }, status: "down" }));
    expect(issues[0].severity).toBe("critical");
  });
});

describe("detectErrorRateIssue", () => {
  it("não dispara abaixo do limiar", () => {
    expect(detectErrorRateIssue(pulse({ reqCount: 100, errorRatePct: 2 }))).toBeNull();
  });
  it("não dispara com poucas requests (evita falso positivo)", () => {
    expect(detectErrorRateIssue(pulse({ reqCount: 5, errorRatePct: 50 }))).toBeNull();
  });
  it("dispara critical quando erro >= 5% com requests suficientes", () => {
    const i = detectErrorRateIssue(pulse({ reqCount: 100, errorRatePct: 8 }));
    expect(i?.severity).toBe("critical");
    expect(i?.id).toBe("error_rate");
    expect(i?.action?.kind).toBe("link");
  });
});

const NOW = new Date("2026-06-05T12:00:00.000Z");

function company(over: Partial<ProblemCompany> = {}): ProblemCompany {
  return {
    id: "c1", name: "Ótica Teste",
    isBlocked: false, healthCategory: "HEALTHY",
    subscriptionStatus: "ACTIVE", trialEndsAt: null, pastDueSince: null,
    billingSyncPending: false, overdueInvoiceCount: 0, overdueTotalCents: 0,
    ...over,
  };
}

describe("detectCompanyIssues", () => {
  it("empresa saudável e ativa → nenhum problema", () => {
    expect(detectCompanyIssues(company(), NOW)).toEqual([]);
  });
  it("billing sync pendente → warning, link p/ cliente", () => {
    const [i] = detectCompanyIssues(company({ billingSyncPending: true }), NOW);
    expect(i.id).toBe("billing_sync:c1");
    expect(i.severity).toBe("warning");
    expect(i.action?.kind).toBe("link");
    expect(i.action?.href).toBe("/admin/clientes/c1");
  });
  it("inadimplência → critical, link", () => {
    const [i] = detectCompanyIssues(company({ overdueInvoiceCount: 2, overdueTotalCents: 30000 }), NOW);
    expect(i.id).toBe("overdue:c1");
    expect(i.severity).toBe("critical");
    expect(i.explanation).toContain("R$");
  });
  it("trial vencendo (status TRIAL, <=3 dias) → info + blueprint extend_trial", () => {
    const trialEndsAt = new Date("2026-06-07T12:00:00.000Z");
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "TRIAL", trialEndsAt }), NOW);
    expect(i.id).toBe("trial_ending:c1");
    expect(i.severity).toBe("info");
    expect(i.action?.kind).toBe("blueprint");
    expect(i.action?.blueprintId).toBe("extend_trial");
  });
  it("trial vencido (TRIAL_EXPIRED) → warning + link (não extend_trial)", () => {
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "TRIAL_EXPIRED" }), NOW);
    expect(i.id).toBe("trial_expired:c1");
    expect(i.severity).toBe("warning");
    expect(i.action?.kind).toBe("link");
  });
  it("trial com status TRIAL mas data já passada → vencido (link)", () => {
    const trialEndsAt = new Date("2026-06-01T12:00:00.000Z");
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "TRIAL", trialEndsAt }), NOW);
    expect(i.id).toBe("trial_expired:c1");
    expect(i.action?.kind).toBe("link");
  });
  it("saúde crítica → warning + link", () => {
    const [i] = detectCompanyIssues(company({ healthCategory: "CRITICAL" }), NOW);
    expect(i.id).toBe("health_critical:c1");
    expect(i.action?.href).toBe("/admin/clientes/c1");
  });
  it("suspensa → warning + blueprint reactivate", () => {
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "SUSPENDED" }), NOW);
    expect(i.id).toBe("suspended:c1");
    expect(i.action?.blueprintId).toBe("reactivate");
  });
  it("pagamento atrasado (PAST_DUE) → warning + link", () => {
    const [i] = detectCompanyIssues(company({ subscriptionStatus: "PAST_DUE" }), NOW);
    expect(i.id).toBe("past_due:c1");
    expect(i.severity).toBe("warning");
    expect(i.action?.kind).toBe("link");
  });
  it("empresa com 2 problemas gera 2 cards distintos", () => {
    const issues = detectCompanyIssues(company({ subscriptionStatus: "SUSPENDED", healthCategory: "CRITICAL" }), NOW);
    const ids = issues.map((i) => i.id);
    expect(ids).toContain("suspended:c1");
    expect(ids).toContain("health_critical:c1");
  });
});

describe("detectIssues + ordenação", () => {
  it("combina sistema + clientes", () => {
    const issues = detectIssues({
      pulse: pulse({ db: { status: "degraded", latencyMs: 900 }, status: "degraded" }),
      trends: {} as any,
      problemCompanies: [company({ subscriptionStatus: "SUSPENDED" })],
    }, NOW);
    expect(issues.length).toBe(2);
  });
  it("ordena critical → warning → info; system antes de client no empate", () => {
    const sorted = sortIssues([
      { id: "a", severity: "info", category: "client", title: "", explanation: "" },
      { id: "b", severity: "critical", category: "client", title: "", explanation: "" },
      { id: "c", severity: "warning", category: "client", title: "", explanation: "" },
      { id: "d", severity: "warning", category: "system", title: "", explanation: "" },
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["b", "d", "c", "a"]);
  });
});
