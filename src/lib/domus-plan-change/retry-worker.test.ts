import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SagaResult, ClaimedSagaOp } from "./executor";

// Mocks hoistados (vi.mock é içado ao topo; variáveis top-level não podem ser
// referenciadas na factory sem vi.hoisted).
const { queryRaw, claimOp, scheduleRetry, releaseLease, runSaga } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  claimOp: vi.fn(),
  scheduleRetry: vi.fn(async () => ({ applied: true })),
  releaseLease: vi.fn(async () => ({ applied: true })),
  runSaga: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));
vi.mock("./deps", () => ({ claimOp, buildSagaDeps: () => ({ scheduleRetry, releaseLease }) }));
vi.mock("./executor", () => ({ runSaga }));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), child: () => ({ error: vi.fn(), info: vi.fn() }) },
}));

import { runRetryBatch } from "./retry-worker";

const TOKEN = "lease-1";
function claimed(id: string, state: ClaimedSagaOp["state"] = "BILLING_CONFIRMED"): ClaimedSagaOp {
  return {
    id, eventId: `ev-${id}`, visCompanyId: "co1", requestedTier: "clinic_full",
    targetPlanId: "plan_x", state, asaasRef: null, expiresAt: new Date(4102444800000),
    leaseToken: TOKEN, claimedAt: new Date(1_700_000_000_000), attemptCount: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduleRetry.mockResolvedValue({ applied: true });
  releaseLease.mockResolvedValue({ applied: true });
  process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true"; // default: switch ON
});

describe("runRetryBatch — worker de retry (Fase E)", () => {
  it("batch vazio → não claima nada, retorna zeros", async () => {
    queryRaw.mockResolvedValue([]);
    const r = await runRetryBatch();
    expect(r.scanned).toBe(0);
    expect(claimOp).not.toHaveBeenCalled();
  });

  it("candidato reclamado e COMPLETED → conta completed, NÃO agenda retry", async () => {
    queryRaw.mockResolvedValue([{ id: "op1" }]);
    claimOp.mockResolvedValue(claimed("op1"));
    runSaga.mockResolvedValue({ kind: "completed", state: "COMPLETED", asaasRef: "a" } satisfies SagaResult);

    const r = await runRetryBatch();
    expect(r.claimed).toBe(1);
    expect(r.completed).toBe(1);
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it("retryable_failure → agenda backoff (scheduleRetry) com o estado do checkpoint", async () => {
    queryRaw.mockResolvedValue([{ id: "op1" }]);
    claimOp.mockResolvedValue(claimed("op1", "BILLING_REQUESTED"));
    runSaga.mockResolvedValue({
      kind: "retryable_failure", state: "BILLING_REQUESTED", asaasRef: null, lastError: "asaas down",
    } satisfies SagaResult);

    const r = await runRetryBatch();
    expect(r.retried).toBe(1);
    expect(scheduleRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "op1" }), "BILLING_REQUESTED");
  });

  it("terminal e lost_lease → NÃO agendam retry", async () => {
    queryRaw.mockResolvedValue([{ id: "t1" }, { id: "l1" }]);
    claimOp.mockImplementation(async (id: string) => claimed(id));
    runSaga
      .mockResolvedValueOnce({ kind: "terminal", state: "CHARGED_NOT_APPLIED", asaasRef: null } satisfies SagaResult)
      .mockResolvedValueOnce({ kind: "lost_lease", state: "BILLING_CONFIRMED", asaasRef: null } satisfies SagaResult);

    const r = await runRetryBatch();
    expect(r.terminal).toBe(1);
    expect(r.lostLease).toBe(1);
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it("claimOp null (outro reclamou / backoff / terminal) → pula sem erro", async () => {
    queryRaw.mockResolvedValue([{ id: "op1" }]);
    claimOp.mockResolvedValue(null);
    const r = await runRetryBatch();
    expect(r.scanned).toBe(1);
    expect(r.claimed).toBe(0);
    expect(runSaga).not.toHaveBeenCalled();
  });

  it("ISOLAMENTO: erro ANTES do claim (claimOp lança) não derruba o batch", async () => {
    queryRaw.mockResolvedValue([{ id: "bad" }, { id: "good" }]);
    claimOp.mockImplementation(async (id: string) => {
      if (id === "bad") throw new Error("db intermitente");
      return claimed(id);
    });
    runSaga.mockResolvedValue({ kind: "completed", state: "COMPLETED", asaasRef: null } satisfies SagaResult);

    const r = await runRetryBatch();
    expect(r.errored).toBe(1);
    expect(r.completed).toBe(1); // a "good" processou apesar do erro na "bad"
  });

  it("ISOLAMENTO: erro DEPOIS do claim (runSaga lança) → releaseLease (solta o lease p/ estado real)", async () => {
    // Achado Codex #catch 2ª rodada: se runSaga lança APÓS o claim (podendo ter
    // avançado o estado no banco), o catch usa releaseLease — CAS fenced só por
    // token, aceitando qualquer estado retomável — senão a op reaparece como "poison
    // NULL" no topo do batch. Não usa scheduleRetry(claimed.state) (estado velho).
    queryRaw.mockResolvedValue([{ id: "op1" }, { id: "op2" }]);
    claimOp.mockImplementation(async (id: string) => claimed(id, "BILLING_CONFIRMED"));
    runSaga
      .mockRejectedValueOnce(new Error("db caiu no meio do runSaga"))
      .mockResolvedValueOnce({ kind: "completed", state: "COMPLETED", asaasRef: null } satisfies SagaResult);

    const r = await runRetryBatch();
    expect(r.errored).toBe(1);
    expect(r.completed).toBe(1); // op2 processou
    // op1: o catch liberou o lease pelo token (independe do estado do claim).
    expect(releaseLease).toHaveBeenCalledWith(expect.objectContaining({ id: "op1" }));
    expect(scheduleRetry).not.toHaveBeenCalled(); // não agenda por estado velho
  });

  it("retryable_failure com scheduleRetry applied:false (perdi a posse) → conta lostLease, não retried", async () => {
    queryRaw.mockResolvedValue([{ id: "op1" }]);
    claimOp.mockResolvedValue(claimed("op1", "BILLING_REQUESTED"));
    runSaga.mockResolvedValue({
      kind: "retryable_failure", state: "BILLING_REQUESTED", asaasRef: null, lastError: "x",
    } satisfies SagaResult);
    scheduleRetry.mockResolvedValue({ applied: false }); // CAS não pegou (perdi o lease)

    const r = await runRetryBatch();
    expect(r.retried).toBe(0);
    expect(r.lostLease).toBe(1); // métrica honesta (achado Codex P2)
  });

  // O pré-filtro usa cláusulas SQL ESTÁTICAS por switch (index-friendly, Codex): os
  // nomes de estado ficam no texto do SQL (Prisma.sql.strings), não em `.values`.
  const sqlText = () => {
    const sql = queryRaw.mock.calls[0][0];
    return (sql.strings ?? []).join(" ");
  };

  it("KILL-SWITCH ON → pré-filtro inclui os 4 estados (pré e pós-cobrança)", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "true";
    queryRaw.mockResolvedValue([]);
    await runRetryBatch();
    const t = sqlText();
    expect(t).toContain("'RECEIVED', 'BILLING_REQUESTED', 'BILLING_CONFIRMED', 'LOCAL_APPLIED'");
    expect(t).not.toContain("expiresAt"); // ON não filtra por expiração no estado
  });

  it("KILL-SWITCH OFF → pós-cobrança sempre + pré-cobrança SÓ se vencida (P0 Codex 2 rodadas)", async () => {
    // Com OFF: BILLING_CONFIRMED/LOCAL_APPLIED completam; RECEIVED/BILLING_REQUESTED
    // entram APENAS vencidas (expiresAt<=now) — só para classificar no terminal SEM
    // tocar o Asaas (senão uma cobrada cuja resposta se perdeu ficaria invisível).
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "false";
    queryRaw.mockResolvedValue([]);
    await runRetryBatch();
    const t = sqlText();
    expect(t).toContain("'BILLING_CONFIRMED', 'LOCAL_APPLIED'"); // pós-cobrança sempre
    // pré-cobrança condicionada à expiração (a lane de classificação-sem-Asaas).
    expect(t).toContain("'RECEIVED', 'BILLING_REQUESTED'");
    expect(t).toContain("expiresAt");
  });

  it("KILL-SWITCH OFF → op cobrada (BILLING_CONFIRMED) AINDA completa", async () => {
    process.env.VIS_TIER_SELF_SERVICE_ENABLED = "false";
    queryRaw.mockResolvedValue([{ id: "op1" }]);
    claimOp.mockResolvedValue(claimed("op1", "BILLING_CONFIRMED"));
    runSaga.mockResolvedValue({ kind: "completed", state: "COMPLETED", asaasRef: null } satisfies SagaResult);
    const r = await runRetryBatch();
    expect(r.completed).toBe(1); // cobrada completa mesmo com o switch OFF
  });
});
