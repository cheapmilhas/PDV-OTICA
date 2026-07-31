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
const invoiceFindFirst = vi.fn();
const dunningEventCreate = vi.fn();
const dunningEventFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findMany: (...a: unknown[]) => subscriptionFindMany(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
    },
    globalAudit: {
      create: (...a: unknown[]) => globalAuditCreate(...a),
    },
    invoice: {
      findFirst: (...a: unknown[]) => invoiceFindFirst(...a),
    },
    dunningEvent: {
      create: (...a: unknown[]) => dunningEventCreate(...a),
      findFirst: (...a: unknown[]) => dunningEventFindFirst(...a),
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

// vis-domus-publisher — no-op stub (evita I/O real do publisher no cron)
const publishEntitlementForCompany = vi.fn();
vi.mock("@/lib/vis-domus-publisher", () => ({
  publishEntitlementForCompany: (...a: unknown[]) => publishEntitlementForCompany(...a),
}));

// Varredura de obrigações vencidas (I2) — mockada para testar a POSIÇÃO da
// chamada dentro do cron, que é a garantia de segurança da entrega.
const sweepOverdueObligations = vi.fn();
vi.mock("@/services/overdue-obligation-sweep.service", () => ({
  sweepOverdueObligations: (...a: unknown[]) => sweepOverdueObligations(...a),
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
  publishEntitlementForCompany.mockReset().mockResolvedValue(undefined);
  invoiceFindFirst.mockReset().mockResolvedValue({ id: "inv-1" });
  dunningEventCreate.mockReset().mockResolvedValue({ id: "evt-1" });
  dunningEventFindFirst.mockReset().mockResolvedValue({ id: "evt-1" });
  sweepOverdueObligations
    .mockReset()
    .mockResolvedValue({ marked: [], skipped: 0, errors: 0 });
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
        pastDueSince: daysAgo(8), // 8 dias → nextDunningStage = 7 (já avisou o 3)
        status: "PAST_DUE",
        lastDunningStage: 3, // marco 3 já avisado; próximo pendente é o 7
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

    // Cadeado: a suspensão deve propagar writeAllowed=false ao Domus na hora.
    expect(publishEntitlementForCompany).toHaveBeenCalledWith("co-4");
  });

  it("sem trilha de aviso despachado → NÃO suspende, adia e contabiliza", async () => {
    // I3 (spec §4.6.3): 'nem tentamos avisar' não pode virar bloqueio.
    // Foi o caso da MedFacil — e-mail suprimido por testMode, cliente sem saber.
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-9",
        companyId: "co-9",
        pastDueSince: daysAgo(15),
        status: "PAST_DUE",
        lastDunningStage: 14, // já avisou pela régua...
      },
    ]);
    dunningEventFindFirst.mockResolvedValue(null); // ...mas o aviso NÃO foi despachado

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.suspended).toBe(0);
    expect(body.suspendDeferred).toBe(1);
  });

  it("caso MedFacil: notifyCompany redirecionado (testMode+testEmail) → trilha NÃO conta como avisado e NÃO suspende", async () => {
    // I3 (spec §4.6.3): notifyCompany devolve SENT quando o testMode troca o
    // destinatário pelo do operador — o e-mail saiu, mas não pro cliente. A
    // trilha tem que tratar isso como NÃO despachado, senão o cliente é
    // suspenso sem nunca ter sido avisado de verdade (o bug real da MedFacil).
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-medfacil",
        companyId: "co-medfacil",
        pastDueSince: daysAgo(15),
        status: "PAST_DUE",
        lastDunningStage: 7, // marco 7 já avisado; o pendente desta rodada é o 14
      },
    ]);
    // notifyCompany devolve SENT+redirected para a chamada de aviso (stage 14).
    notifyCompany.mockImplementation(
      async (_companyId: string, eventType: string) => {
        if (eventType === "INVOICE_OVERDUE") {
          return { status: "SENT", redirected: true };
        }
        return { status: "SENT" };
      }
    );
    // Sem trilha prévia de aviso despachado (dunningEvent real não existe, já
    // que o único envio foi redirecionado — hasDispatchedNotice não acha nada).
    dunningEventFindFirst.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    // A trilha (recordDunningNotice) tem que gravar como NÃO despachado.
    expect(dunningEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SKIPPED",
          sentAt: null,
          errorDetail: "test_mode_redirected",
        }),
      })
    );

    // E a suspensão tem que ser ADIADA — não pode restringir quem nunca soube.
    expect(body.suspended).toBe(0);
    expect(body.suspendDeferred).toBe(1);
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

    // Cadeado: o cancelamento deve propagar writeAllowed=false ao Domus na hora.
    expect(publishEntitlementForCompany).toHaveBeenCalledWith("co-6");

    // Telemetria honesta: reporta attempted (não published) — publish é best-effort/void.
    const body = await res.json();
    expect(body.entitlementsAttempted).toBe(1);
    expect(body).not.toHaveProperty("entitlementsPublished");
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
        lastDunningStage: 3, // marco 3 já avisado; próximo pendente é o 7
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
        lastDunningStage: 3, // marco 3 já avisado; próximo pendente é o 7
      },
    ]);

    // Should still return 200 (errors counted in summary.errors, not thrown)
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  // ── Regression guard: composição nextDunningStage + guarda de suspensão ────

  // Guarda de regressão da promessa "três avisos antes de perder acesso"
  // (spec 2026-07-29 §4.6.2). Os testes de bloco acima cobrem a régua
  // (nextDunningStage) isolada e a integração com notifyCompany, mas nenhum
  // deles prova a COMPOSIÇÃO real do cron: cliente achado já fundo em atraso,
  // sem nenhum aviso registrado, não pode ser avisado E suspenso na mesma
  // execução. Este teste DEVE falhar contra a implementação antiga de
  // nextDunningStage (que retornava o MAIOR marco atingido em vez do primeiro
  // pendente) — se não falhar, não está travando o comportamento certo.
  it("cliente 20d atrasado sem nenhum aviso → avisa o marco 3 e NÃO suspende na mesma rodada", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-20d",
        companyId: "co-9",
        pastDueSince: daysAgo(20), // bem além dos 14d de suspensão
        status: "PAST_DUE",
        lastDunningStage: null, // nenhum aviso jamais enviado
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    // Promessa: um degrau por execução — não pode suspender quem nunca foi avisado.
    expect(body.suspended).toBe(0);

    // E o aviso disparado tem que ser o PRIMEIRO pendente (marco 3), não o último (14).
    expect(notifyCompany).toHaveBeenCalledWith(
      "co-9",
      "INVOICE_OVERDUE",
      expect.objectContaining({ daysOverdue: 20 }),
      expect.objectContaining({ periodKey: "stage:3", channels: ["email"] })
    );

    const suspendedCall = notifyCompany.mock.calls.find(
      (c) => c[1] === "SUBSCRIPTION_SUSPENDED"
    );
    expect(suspendedCall).toBeUndefined();
  });

  // ── I2: a varredura de obrigações vencidas e a sua POSIÇÃO ────────────────

  /**
   * 🚨 O TESTE QUE TRAVA A DECISÃO DE SEGURANÇA DA FORJA.
   *
   * A varredura carimba `pastDueSince` com o `dueAt` da obrigação — que pode
   * estar MESES no passado. Se ela rodasse ANTES do `findMany`, a assinatura
   * recém-carimbada entraria no conjunto no MESMO tick já com `daysOverdue`
   * alto, e a régua poderia avisar e suspender na mesma execução: os 14 dias
   * atravessados de uma vez. O crítico de segurança matou a abordagem que fazia
   * isso.
   *
   * Aqui a ordem é provada por gravação: quem chamou primeiro deixa marca.
   */
  it("🚨 a varredura roda DEPOIS do findMany — a transição só restringe no tick SEGUINTE", async () => {
    const ordem: string[] = [];
    subscriptionFindMany.mockImplementation(async () => {
      ordem.push("findMany");
      return [];
    });
    sweepOverdueObligations.mockImplementation(async () => {
      ordem.push("sweep");
      return { marked: [], skipped: 0, errors: 0 };
    });

    await GET(makeRequest());

    expect(ordem).toEqual(["findMany", "sweep"]);
  });

  it("assinatura carimbada NESTA rodada NÃO é processada pela régua na mesma execução", async () => {
    // A prova de consequência, não só de ordem: o conjunto `overdue` foi lido
    // ANTES, então a recém-marcada não está nele. Nada de aviso, nada de
    // suspensão, nada de publish para ela hoje.
    subscriptionFindMany.mockResolvedValue([]); // ninguém marcado ANTES da varredura
    sweepOverdueObligations.mockResolvedValue({
      marked: [
        {
          subscriptionId: "sub-ultra",
          companyId: "co-oticas-ultra",
          // 90 dias no passado: se ela entrasse no conjunto deste tick, passaria
          // dos 14 (suspensão) E dos 30 (cancelamento) numa execução só.
          pastDueSince: daysAgo(90),
        },
      ],
      skipped: 0,
      errors: 0,
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.swept).toBe(1);
    expect(body.total).toBe(0);
    expect(body.suspended).toBe(0);
    expect(body.canceled).toBe(0);
    expect(body.noticeSent).toBe(0);
    expect(notifyCompany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("a varredura recebe o MESMO `now` da rodada (um só relógio por execução)", async () => {
    subscriptionFindMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const body = await res.json();

    const arg = sweepOverdueObligations.mock.calls[0][0] as { now: Date };
    expect(arg.now).toBeInstanceOf(Date);
    expect(arg.now.toISOString()).toBe(body.runAt);
  });

  it("varredura falhando não derruba a régua de quem já está marcado", async () => {
    // O serviço nunca lança, mas o cron não pode DEPENDER disso: se um dia
    // lançar, a suspensão de quem já está na régua não pode ser cancelada junto.
    subscriptionFindMany.mockResolvedValue([
      {
        id: "sub-ja-marcado",
        companyId: "co-ja-marcado",
        pastDueSince: daysAgo(15),
        status: "PAST_DUE",
        lastDunningStage: 14,
      },
    ]);
    sweepOverdueObligations.mockResolvedValue({ marked: [], skipped: 0, errors: 1 });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sweepErrors).toBe(1);
    expect(body.suspended).toBe(1);
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
