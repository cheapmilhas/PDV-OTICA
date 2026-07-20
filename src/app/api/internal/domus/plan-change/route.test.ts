import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findFirst: vi.fn() },
    subscription: { findMany: vi.fn() },
    domusPlanChangeOp: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/resolve-plan-for-tier", async () => {
  const actual = await vi.importActual<typeof import("@/lib/resolve-plan-for-tier")>(
    "@/lib/resolve-plan-for-tier",
  );
  return { ...actual, resolvePlanForTier: vi.fn().mockResolvedValue({ id: "plan_x", slug: "medical-clinica", tier: "clinic_full", priceMonthly: 18990, priceYearly: 189900 }) };
});
// deps reais fazem I/O (Asaas/prisma) — mock. runSaga é testado à parte (executor.test).
// claimOp (Fase C) também é do módulo deps — mock retornando a op reclamada.
// scheduleRetry (Fase E): o endpoint o chama no retryable_failure (backoff +
// release do lease). Spy COMPARTILHADO (hoistado) para asserção nos testes.
const { scheduleRetrySpy } = vi.hoisted(() => ({
  scheduleRetrySpy: vi.fn(async () => ({ applied: true })),
}));
vi.mock("@/lib/domus-plan-change/deps", () => ({
  buildSagaDeps: vi.fn(() => ({ scheduleRetry: scheduleRetrySpy })),
  claimOp: vi.fn(),
}));
vi.mock("@/lib/domus-plan-change/executor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domus-plan-change/executor")>(
    "@/lib/domus-plan-change/executor",
  );
  return { ...actual, runSaga: vi.fn().mockResolvedValue({ kind: "completed", state: "COMPLETED", asaasRef: "a1" }) };
});

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { signVisDomus } from "@/lib/vis-domus-hmac";
import { runSaga } from "@/lib/domus-plan-change/executor";
import { claimOp } from "@/lib/domus-plan-change/deps";

const companyFindFirst = prisma.company.findFirst as unknown as ReturnType<typeof vi.fn>;
const subFindMany = prisma.subscription.findMany as unknown as ReturnType<typeof vi.fn>;
const opFindUnique = prisma.domusPlanChangeOp.findUnique as unknown as ReturnType<typeof vi.fn>;
const opCreate = prisma.domusPlanChangeOp.create as unknown as ReturnType<typeof vi.fn>;
const runSagaMock = runSaga as unknown as ReturnType<typeof vi.fn>;
const claimOpMock = claimOp as unknown as ReturnType<typeof vi.fn>;

// Op reclamada padrão que o claimOp devolve nos testes de execução.
const CLAIMED = {
  id: "op1", eventId: "ev1", visCompanyId: "co1", requestedTier: "clinic_full",
  targetPlanId: "plan_x", state: "RECEIVED", asaasRef: null,
  expiresAt: new Date(4102444800000), leaseToken: "tok1", claimedAt: new Date(1_700_000_000_000),
};

const SECRET = "test-secret";

function makeReq(bodyObj: unknown, opts: { badSig?: boolean; ts?: number } = {}) {
  const raw = JSON.stringify(bodyObj);
  const ts = opts.ts ?? Date.now();
  const sig = opts.badSig ? "deadbeef" : signVisDomus(SECRET, ts, raw);
  return new Request("http://x/api/internal/domus/plan-change", {
    method: "POST",
    headers: { "x-domus-timestamp": String(ts), "x-domus-signature": sig, "content-type": "application/json" },
    body: raw,
  });
}

const validBody = {
  visCompanyId: "co1",
  requestedTier: "clinic_full",
  idempotencyKey: "co1:clinic_full",
  requestedBy: "user1",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOMUS_VIS_API_SECRET = SECRET;
  delete process.env.VIS_TIER_SELF_SERVICE_ENABLED;
  companyFindFirst.mockResolvedValue({ id: "co1" });
  // subscription atual = plano barato (8990) → alvo clínica (18990) é UPGRADE.
  // Fase B: o endpoint busca ATÉ 2 elegíveis (fail-closed) e congela id/asaas/ciclo.
  subFindMany.mockResolvedValue([
    {
      id: "sub1",
      asaasSubscriptionId: "asaas_sub_1",
      billingCycle: "MONTHLY",
      plan: { priceMonthly: 8990 },
    },
  ]);
  opFindUnique.mockResolvedValue(null);
  opCreate.mockResolvedValue({});
  claimOpMock.mockResolvedValue(CLAIMED); // por padrão, o claim vence
});

describe("plan-change — gates de segurança", () => {
  it("sem DOMUS_VIS_API_SECRET → 503 fail-closed", async () => {
    delete process.env.DOMUS_VIS_API_SECRET;
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
  });

  it("assinatura inválida → 401", async () => {
    const res = await POST(makeReq(validBody, { badSig: true }));
    expect(res.status).toBe(401);
  });

  it("timestamp fora da janela (stale) → 401", async () => {
    const res = await POST(makeReq(validBody, { ts: Date.now() - 10 * 60 * 1000 }));
    expect(res.status).toBe(401);
  });

  it("tier inválido → 400", async () => {
    const res = await POST(makeReq({ ...validBody, requestedTier: "enterprise" }));
    expect(res.status).toBe(400);
  });

  it("company não VIS_MEDICAL vinculada → 404 genérico (anti-oráculo)", async () => {
    companyFindFirst.mockResolvedValue(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(404);
  });

  it("kill-switch OFF → 503, NÃO cria op nem cobra", async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("self_service_disabled");
    expect(opCreate).not.toHaveBeenCalled();
  });
});

describe("plan-change — idempotência + execução (com kill-switch ON)", () => {
  beforeEach(() => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    // 1ª leitura = decisão (null=fresh); 2ª leitura = só {id} p/ claimOp.
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValue({ id: "op1" });
  });

  it("op nova (fresh) → cria, claima, roda a saga → 200 completed", async () => {
    // 1ª leitura (decisão) = null (nova); 2ª (id p/ claim) = {id}.
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "op1" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(opCreate).toHaveBeenCalledOnce();
    expect(claimOpMock).toHaveBeenCalledWith("op1");
    expect(runSagaMock).toHaveBeenCalledOnce();
    // runSaga recebeu a op RECLAMADA (com leaseToken).
    expect(runSagaMock.mock.calls[0][0]).toMatchObject({ id: "op1", leaseToken: "tok1" });
  });

  it("claimOp null + op ainda retomável (ocupada por outro executor) → 202, NÃO roda saga", async () => {
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)          // decisão: fresh
      .mockResolvedValueOnce({ id: "op1" }) // {id} p/ claim
      .mockResolvedValueOnce({ state: "BILLING_REQUESTED" }); // releitura pós-claim-null
    claimOpMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  // Achado Codex Fase C: claimOp null NÃO pode virar 202 pra tudo. Se a op foi
  // movida a um terminal HUMANO entre a decisão e o claim → 409 (não mascarar).
  it("claimOp null + op em terminal humano → 409 manual_review, NÃO 202", async () => {
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "op1" })
      .mockResolvedValueOnce({ state: "MANUAL_REVIEW" }); // releitura pós-claim-null
    claimOpMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("manual_review_required");
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  it("claimOp null + op já COMPLETED → 200 already_applied", async () => {
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "op1" })
      .mockResolvedValueOnce({ state: "COMPLETED" });
    claimOpMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  it("DOWNGRADE (plano atual mais caro que o alvo) → 501, NÃO cria op nem roda saga", async () => {
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null);
    // subscription atual mais cara que o alvo → downgrade.
    subFindMany.mockResolvedValueOnce([{ id: "sub1", asaasSubscriptionId: "asaas_sub_1", billingCycle: "MONTHLY", plan: { priceMonthly: 99999 } }]);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(501);
    expect(opCreate).not.toHaveBeenCalled();
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  it("saga falha (checkpoint) → 502 not_completed, agenda backoff+libera lease (Fase E)", async () => {
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "op1" });
    const claimedOp = { ...CLAIMED, state: "BILLING_REQUESTED" };
    claimOpMock.mockResolvedValueOnce(claimedOp);
    runSagaMock.mockResolvedValueOnce({ kind: "retryable_failure", state: "BILLING_REQUESTED", asaasRef: null, lastError: "asaas down" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(502);
    expect(opCreate).toHaveBeenCalledOnce();
    // Fase E (Codex #4): o endpoint DEVE agendar o retry com o estado do checkpoint.
    expect(scheduleRetrySpy).toHaveBeenCalledWith(claimedOp, "BILLING_REQUESTED");
  });

  it("saga falha e scheduleRetry LANÇA → resposta segue 502 (best-effort, não vira 500)", async () => {
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "op1" });
    claimOpMock.mockResolvedValueOnce({ ...CLAIMED, state: "BILLING_CONFIRMED" });
    runSagaMock.mockResolvedValueOnce({ kind: "retryable_failure", state: "BILLING_CONFIRMED", asaasRef: null, lastError: "x" });
    scheduleRetrySpy.mockRejectedValueOnce(new Error("banco fora"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(502); // achado Codex P2: agendamento falho não vira 500
  });

  it("op COMPLETED mesmo hash → 200 already_applied, NÃO recria nem roda saga", async () => {
    const raw = JSON.stringify(validBody);
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(raw).digest("hex");
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValue({ state: "COMPLETED", payloadHash: hash });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(opCreate).not.toHaveBeenCalled();
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  it("mesmo eventId com corpo diferente → 409 conflict", async () => {
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValue({ state: "COMPLETED", payloadHash: "hash-diferente" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
  });

  it("corrida no create (P2002) → relê vencedor, NÃO 500", async () => {
    const raw = JSON.stringify(validBody);
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(raw).digest("hex");
    // findUnique inicial null (fresh) → create falha P2002 → relê o vencedor.
    opFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "RECEIVED", payloadHash: hash });
    opCreate.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202); // reconhece, não duplica, não 500
  });

  it("corrida no create (P2002) com hash diferente → 409", async () => {
    opFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "RECEIVED", payloadHash: "outro-hash" });
    opCreate.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
  });

  // Fase A — terminais humanos (achados Codex): op parada de propósito NÃO pode
  // virar sucesso nem accepted num replay.
  it("replay de op em terminal humano (CHARGED_NOT_APPLIED) → 409 manual_review", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    const raw = JSON.stringify(validBody);
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(raw).digest("hex");
    opFindUnique.mockResolvedValue({ state: "CHARGED_NOT_APPLIED", payloadHash: hash });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    expect(runSagaMock).not.toHaveBeenCalled(); // não reanima
  });

  it("P2002 com vencedor em terminal humano → 409 (não 202 accepted)", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    const raw = JSON.stringify(validBody);
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(raw).digest("hex");
    opFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ state: "MANUAL_REVIEW", payloadHash: hash });
    opCreate.mockRejectedValue({ code: "P2002" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
  });

  it("runSaga retorna kind=terminal (esgotou/já terminal) → 409, NÃO 200", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    const raw = JSON.stringify(validBody);
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(raw).digest("hex");
    opFindUnique
      .mockResolvedValueOnce({ state: "RECEIVED", payloadHash: hash })
      .mockResolvedValueOnce({ id: "op1" });
    runSagaMock.mockResolvedValue({ kind: "terminal", state: "CHARGED_NOT_APPLIED", asaasRef: null });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
  });

  it("runSaga retorna kind=lost_lease → 202 (outro executor conduz)", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "op1" });
    runSagaMock.mockResolvedValue({ kind: "lost_lease", state: "BILLING_CONFIRMED", asaasRef: null });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(202);
  });

  // Fase B — trava "1 op ativa por company". P2002 RESOLVIDO POR ESTADO, não por
  // meta.target (achado Codex #4): eventId LIVRE após P2002 → foi o índice de op
  // ativa → 409 change_in_progress. NÃO depende do nome do índice.
  it("P2002 com eventId livre (op ativa por company) → 409 change_in_progress", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null) // decisão: fresh
      .mockResolvedValueOnce(null); // relê por eventId após P2002 → LIVRE
    opCreate.mockRejectedValue({ code: "P2002" }); // sem meta.target
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("change_in_progress");
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  // Fail-closed (achado Codex #2): sem assinatura elegível NÃO cria op.
  it("nenhuma assinatura elegível → 409 no_active_subscription, NÃO cria op", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null);
    subFindMany.mockResolvedValueOnce([]);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_active_subscription");
    expect(opCreate).not.toHaveBeenCalled();
  });

  it("MÚLTIPLAS assinaturas elegíveis (ambíguo) → 409 ambiguous_subscription, NÃO cria op", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null);
    subFindMany.mockResolvedValueOnce([
      { id: "sub1", asaasSubscriptionId: "a1", billingCycle: "MONTHLY", plan: { priceMonthly: 8990 } },
      { id: "sub2", asaasSubscriptionId: "a2", billingCycle: "MONTHLY", plan: { priceMonthly: 8990 } },
    ]);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ambiguous_subscription");
    expect(opCreate).not.toHaveBeenCalled();
  });

  it("assinatura sem asaasSubscriptionId → 409 no_recurring_billing, NÃO cria op", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null);
    subFindMany.mockResolvedValueOnce([{ id: "sub1", asaasSubscriptionId: null, billingCycle: "MONTHLY", plan: { priceMonthly: 8990 } }]);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("no_recurring_billing");
    expect(opCreate).not.toHaveBeenCalled();
  });

  // Fase B — o fresh CONGELA a identidade da assinatura na op (subscriptionId/
  // asaasSubscriptionId/billingCycle/priceApplied) antes de qualquer cobrança.
  it("fresh congela a identidade da assinatura no create", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "op1", eventId: "ev1", visCompanyId: "co1", requestedTier: "clinic_full", targetPlanId: "plan_x", state: "RECEIVED", asaasRef: null });
    await POST(makeReq(validBody));
    expect(opCreate).toHaveBeenCalledOnce();
    const data = opCreate.mock.calls[0][0].data;
    expect(data.subscriptionId).toBe("sub1");
    expect(data.asaasSubscriptionId).toBe("asaas_sub_1");
    expect(data.billingCycle).toBe("MONTHLY");
    // ciclo MONTHLY → priceApplied = priceMonthly do alvo (18990 centavos).
    expect(data.priceApplied).toBe(18990);
  });
});
