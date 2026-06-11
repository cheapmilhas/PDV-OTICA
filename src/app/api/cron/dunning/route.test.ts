/**
 * Tests for Task 9: dunning cron dispara emails (overdue/suspended/canceled, só email).
 *
 * Verifica que notifyCompany é chamado com channels:["email"] (nunca inapp) nos 3
 * blocos do cron: aviso de marco, suspensão e cancelamento.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks declarados ANTES de vi.mock (hoisting safety) ────────────────────────
// Funções de mock FORA do factory (vi.mock é hoisted; as variáveis devem ser
// declaradas antes via vi.fn() para o hoisting não as tornar undefined).

const subscriptionFindMany = vi.fn();
const subscriptionUpdate = vi.fn();
const globalAuditCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findMany: (...a: unknown[]) => subscriptionFindMany(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
    },
    globalAudit: {
      create: (...a: unknown[]) => globalAuditCreate(...a),
    },
  },
}));

// logger (silence)
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

// createCompanyNotification (in-app — existing dunning behaviour)
const createCompanyNotification = vi.fn();
vi.mock("@/services/company-notification.service", () => ({
  createCompanyNotification: (...a: unknown[]) => createCompanyNotification(...a),
}));

// createAdminNotification
const createAdminNotification = vi.fn();
vi.mock("@/services/admin-notification.service", () => ({
  createAdminNotification: (...a: unknown[]) => createAdminNotification(...a),
}));

// logActivity
const logActivity = vi.fn();
vi.mock("@/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

// ── KEY MOCK: saas-notification.service ────────────────────────────────────────
const notifyCompany = vi.fn();
vi.mock("@/services/saas-notification.service", () => ({
  notifyCompany: (...a: unknown[]) => notifyCompany(...a),
}));

// ── Import AFTER mocks ─────────────────────────────────────────────────────────
import { GET } from "./route";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a fake Next.js Request with CRON_SECRET auth header. */
function makeRequest(): Request {
  return {
    headers: {
      get: (key: string) => (key === "authorization" ? `Bearer test-secret` : null),
    },
  } as unknown as Request;
}

/** Returns a Date that is `daysAgo` days in the past. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  subscriptionFindMany.mockReset();
  subscriptionUpdate.mockResolvedValue({});
  globalAuditCreate.mockResolvedValue({});
  createCompanyNotification.mockReset().mockResolvedValue(true);
  createAdminNotification.mockReset().mockResolvedValue(true);
  logActivity.mockReset().mockResolvedValue(undefined);
  notifyCompany.mockReset().mockResolvedValue({ status: "SENT" });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/cron/dunning — notifyCompany email integration", () => {
  // ── Auth guard ─────────────────────────────────────────────────────────────

  it("retorna 401 sem CRON_SECRET configurado", async () => {
    delete process.env.CRON_SECRET;
    subscriptionFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("retorna 401 com token errado", async () => {
    subscriptionFindMany.mockResolvedValue([]);
    const badReq = {
      headers: { get: (k: string) => (k === "authorization" ? "Bearer wrong" : null) },
    } as unknown as Request;
    const res = await GET(badReq);
    expect(res.status).toBe(401);
  });

  // ── Block 1: INVOICE_OVERDUE (stage 7) ────────────────────────────────────

  it("aviso stage:7 → notifyCompany com INVOICE_OVERDUE, channels:['email']", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        companyId: "co-1",
        pastDueSince: daysAgo(8), // 8 dias → nextDunningStage = 7
        status: "PAST_DUE",
        lastDunningStage: null, // nenhum aviso ainda
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    expect(notifyCompany).toHaveBeenCalledTimes(1);
    expect(notifyCompany).toHaveBeenCalledWith(
      "co-1",
      "INVOICE_OVERDUE",
      expect.objectContaining({ daysOverdue: 8 }),
      expect.objectContaining({ periodKey: "stage:7", channels: ["email"] })
    );

    // Garantir que NÃO passa inapp junto
    const opts = notifyCompany.mock.calls[0][3] as { channels: string[] };
    expect(opts.channels).toEqual(["email"]);
    expect(opts.channels).not.toContain("inapp");
  });

  it("aviso stage:3 → notifyCompany com periodKey stage:3, channels:['email']", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-2",
        companyId: "co-2",
        pastDueSince: daysAgo(4), // 4 dias → stage 3
        status: "PAST_DUE",
        lastDunningStage: null,
      },
    ]);

    await GET(makeRequest());

    expect(notifyCompany).toHaveBeenCalledWith(
      "co-2",
      "INVOICE_OVERDUE",
      expect.objectContaining({ daysOverdue: 4 }),
      expect.objectContaining({ periodKey: "stage:3", channels: ["email"] })
    );
  });

  it("stage já avisado (lastDunningStage=7, 8 dias) → notifyCompany NÃO chamado", async () => {
    // nextDunningStage(8, 7) = null (7 já foi enviado, 14 ainda não atingido)
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-3",
        companyId: "co-3",
        pastDueSince: daysAgo(8),
        status: "PAST_DUE",
        lastDunningStage: 7, // já avisado
      },
    ]);

    await GET(makeRequest());
    expect(notifyCompany).not.toHaveBeenCalled();
  });

  // ── Block 2: SUBSCRIPTION_SUSPENDED ───────────────────────────────────────

  it("suspensão (>=14d, lastStage>=14) → notifyCompany com SUBSCRIPTION_SUSPENDED, channels:['email']", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-4",
        companyId: "co-4",
        pastDueSince: daysAgo(15), // 15 dias
        status: "PAST_DUE",       // ainda não SUSPENDED → vai suspender
        lastDunningStage: 14,     // aviso de 14d já enviado
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const suspendedCall = notifyCompany.mock.calls.find(
      (c) => c[1] === "SUBSCRIPTION_SUSPENDED"
    );
    expect(suspendedCall).toBeDefined();
    expect(suspendedCall![0]).toBe("co-4");
    expect(suspendedCall![3]).toMatchObject({
      periodKey: "suspended",
      channels: ["email"],
    });
    const opts = suspendedCall![3] as { channels: string[] };
    expect(opts.channels).not.toContain("inapp");
  });

  it("já SUSPENDED → não dispara SUBSCRIPTION_SUSPENDED novamente", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-5",
        companyId: "co-5",
        pastDueSince: daysAgo(16),
        status: "SUSPENDED",  // já suspensa → bloco 2 não re-suspende
        lastDunningStage: 14,
      },
    ]);

    await GET(makeRequest());

    const suspendedCall = notifyCompany.mock.calls.find(
      (c) => c[1] === "SUBSCRIPTION_SUSPENDED"
    );
    expect(suspendedCall).toBeUndefined();
  });

  // ── Block 3: SUBSCRIPTION_CANCELED ────────────────────────────────────────

  it("cancelamento (>=30d, canCancel=true) → notifyCompany com SUBSCRIPTION_CANCELED, channels:['email']", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-6",
        companyId: "co-6",
        pastDueSince: daysAgo(31), // 31 dias
        status: "SUSPENDED",
        lastDunningStage: 14, // canCancel(31, 14) = true
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const canceledCall = notifyCompany.mock.calls.find(
      (c) => c[1] === "SUBSCRIPTION_CANCELED"
    );
    expect(canceledCall).toBeDefined();
    expect(canceledCall![0]).toBe("co-6");
    expect(canceledCall![3]).toMatchObject({
      periodKey: "canceled",
      channels: ["email"],
    });
    const opts = canceledCall![3] as { channels: string[] };
    expect(opts.channels).not.toContain("inapp");
  });

  it(">=30d mas lastStage=7 (canCancel=false) e createCompanyNotification falha → cancelamento ADIADO, NÃO dispara SUBSCRIPTION_CANCELED", async () => {
    // canCancel(31, 7) = false (lastStage < 14) → deferred.
    // createCompanyNotification retorna false → aviso do stage 14 não avança lastStage.
    // Resultado: canCancel ainda false → Block 3 não cancela → SUBSCRIPTION_CANCELED não dispara.
    createCompanyNotification.mockResolvedValue(false); // in-app falha → stage não avança
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-7",
        companyId: "co-7",
        pastDueSince: daysAgo(31),
        status: "PAST_DUE",
        lastDunningStage: 7, // canCancel(31, 7) = false; Block 1 tentaria 14 mas inapp falha → não avança
      },
    ]);

    await GET(makeRequest());

    const canceledCall = notifyCompany.mock.calls.find(
      (c) => c[1] === "SUBSCRIPTION_CANCELED"
    );
    expect(canceledCall).toBeUndefined();
  });

  // ── Cross-cutting: channels sempre ["email"], nunca inapp ──────────────────

  it("todas as chamadas notifyCompany usam EXCLUSIVAMENTE channels:['email']", async () => {
    // sub-A: 8 days → aviso stage:7  (Block 1)
    // sub-B: 31 days + lastStage 14 → cancelamento  (Block 3)
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-A",
        companyId: "co-A",
        pastDueSince: daysAgo(8),
        status: "PAST_DUE",
        lastDunningStage: null,
      },
      {
        id: "sub-B",
        companyId: "co-B",
        pastDueSince: daysAgo(31),
        status: "SUSPENDED",
        lastDunningStage: 14,
      },
    ]);

    await GET(makeRequest());

    // Every single notifyCompany call must use ["email"] only
    for (const call of notifyCompany.mock.calls) {
      const opts = call[3] as { channels: string[] };
      expect(opts.channels).toEqual(["email"]);
      expect(opts.channels).not.toContain("inapp");
    }

    // Must have fired for sub-A (INVOICE_OVERDUE) and sub-B (SUBSCRIPTION_CANCELED)
    const types = notifyCompany.mock.calls.map((c) => c[1]);
    expect(types).toContain("INVOICE_OVERDUE");
    expect(types).toContain("SUBSCRIPTION_CANCELED");
  });

  // ── notifyCompany is fail-silent (route does not throw) ───────────────────

  it("notifyCompany lançando erro não quebra o cron (fail-silent via try/catch da rota)", async () => {
    notifyCompany.mockRejectedValue(new Error("email service down"));
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-8",
        companyId: "co-8",
        pastDueSince: daysAgo(8),
        status: "PAST_DUE",
        lastDunningStage: null,
      },
    ]);

    // Should still return 200 (errors counted in summary.errors, not thrown)
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  // ── Summary response ──────────────────────────────────────────────────────

  it("resposta inclui ok:true + sumário quando não há assinaturas vencidas", async () => {
    subscriptionFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBe(0);
  });
});
