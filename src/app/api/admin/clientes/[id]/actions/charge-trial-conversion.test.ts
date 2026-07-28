import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ação `charge_trial_conversion` — cobrança que converte o trial da clínica.
 *
 * O que estes testes travam: o kill switch, a tradução de recusa de negócio em
 * 422 (não 500), e a auditoria. A lógica de cobrança em si é testada em
 * `trial-conversion-charge.service.test.ts`; aqui o serviço é mockado de
 * propósito — o que importa é o CONTRATO da rota.
 */

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const createTrialConversionCharge = vi.fn();
vi.mock("@/services/trial-conversion-charge.service", () => ({
  createTrialConversionCharge: (...a: unknown[]) => createTrialConversionCharge(...a),
}));

const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
    company: { update: vi.fn(), findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    emailQueue: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("@/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({ invalidatePlanFeaturesCache: vi.fn() }));
vi.mock("@/lib/asaas", () => ({ asaas: {} }));
vi.mock("@/lib/plan-pricing", () => ({ planValueForCycle: vi.fn() }));
vi.mock("@/lib/vis-domus-publisher", () => ({ schedulePublishEntitlement: vi.fn() }));
vi.mock("../resend-invite-guard", () => ({ checkCanResendMedicalInvite: vi.fn() }));

import { POST } from "./route";

const params = Promise.resolve({ id: "co-medical" });

function req() {
  return new Request("http://x/api/admin/clientes/co-medical/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "charge_trial_conversion" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminSession.mockResolvedValue({ id: "admin-1", name: "Admin", role: "SUPER_ADMIN" });
  requireCompanyScope.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
  auditCreate.mockResolvedValue({});
  process.env.VIS_MEDICAL_TRIAL_BILLING_ENABLED = "true";
  createTrialConversionCharge.mockResolvedValue({
    kind: "ok",
    invoiceId: "inv-1",
    amountCents: 18990,
    reused: false,
    paymentUrl: "https://www.asaas.com/i/abc",
    pixCode: "0002012636",
    dueDate: new Date("2026-08-06T12:00:00Z"),
  });
});

describe("charge_trial_conversion", () => {
  it("503 com o kill switch DESLIGADO, sem tocar no serviço de cobrança", async () => {
    delete process.env.VIS_MEDICAL_TRIAL_BILLING_ENABLED;

    const res = await POST(req(), { params });

    expect(res.status).toBe(503);
    expect(createTrialConversionCharge).not.toHaveBeenCalled();
  });

  it("gera a cobrança e devolve o link de pagamento", async () => {
    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      invoiceId: "inv-1",
      amountCents: 18990,
      reused: false,
    });
    expect(createTrialConversionCharge).toHaveBeenCalledWith("co-medical");
  });

  it("registra auditoria com valor e se a cobrança foi REUSADA", async () => {
    // `reused` na trilha evita que dois cliques pareçam duas cobranças.
    createTrialConversionCharge.mockResolvedValue({
      kind: "ok",
      invoiceId: "inv-1",
      amountCents: 18990,
      reused: true,
      paymentUrl: null,
      pixCode: null,
      dueDate: null,
    });

    await POST(req(), { params });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TRIAL_CONVERSION_CHARGED",
          companyId: "co-medical",
          metadata: expect.objectContaining({ invoiceId: "inv-1", reused: true }),
        }),
      })
    );
  });

  it("recusa de NEGÓCIO vira 422 com código acionável, não 500", async () => {
    // "Cadastre o CPF/CNPJ" é acionável; 500 mandaria o operador olhar log.
    createTrialConversionCharge.mockResolvedValue({
      kind: "error",
      code: "missing_document",
      message: "Cadastre o CPF ou CNPJ da clínica antes de cobrar",
    });

    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("missing_document");
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("cobrança já paga responde sucesso sem cobrar de novo", async () => {
    createTrialConversionCharge.mockResolvedValue({
      kind: "already_paid",
      invoiceId: "inv-paga",
    });

    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadyPaid).toBe(true);
  });

  it("401 sem sessão de admin e 403 fora do escopo da empresa", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await POST(req(), { params })).status).toBe(401);

    getAdminSession.mockResolvedValue({ id: "a", name: "A", role: "SUPPORT" });
    requireCompanyScope.mockResolvedValue(null);
    expect((await POST(req(), { params })).status).toBe(403);

    expect(createTrialConversionCharge).not.toHaveBeenCalled();
  });
});
