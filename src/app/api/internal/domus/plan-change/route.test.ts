import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findFirst: vi.fn() },
    subscription: { findFirst: vi.fn() },
    domusPlanChangeOp: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/resolve-plan-for-tier", async () => {
  const actual = await vi.importActual<typeof import("@/lib/resolve-plan-for-tier")>(
    "@/lib/resolve-plan-for-tier",
  );
  return { ...actual, resolvePlanForTier: vi.fn().mockResolvedValue({ id: "plan_x", slug: "medical-clinica", tier: "clinic_full", priceMonthly: 18990 }) };
});
// deps reais fazem I/O (Asaas/prisma) — mock. runSaga é testado à parte (executor.test).
vi.mock("@/lib/domus-plan-change/deps", () => ({ buildSagaDeps: vi.fn(() => ({})) }));
vi.mock("@/lib/domus-plan-change/executor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/domus-plan-change/executor")>(
    "@/lib/domus-plan-change/executor",
  );
  return { ...actual, runSaga: vi.fn().mockResolvedValue({ state: "COMPLETED", asaasRef: "a1" }) };
});

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { signVisDomus } from "@/lib/vis-domus-hmac";
import { runSaga } from "@/lib/domus-plan-change/executor";

const companyFindFirst = prisma.company.findFirst as unknown as ReturnType<typeof vi.fn>;
const subFindFirst = prisma.subscription.findFirst as unknown as ReturnType<typeof vi.fn>;
const opFindUnique = prisma.domusPlanChangeOp.findUnique as unknown as ReturnType<typeof vi.fn>;
const opCreate = prisma.domusPlanChangeOp.create as unknown as ReturnType<typeof vi.fn>;
const runSagaMock = runSaga as unknown as ReturnType<typeof vi.fn>;

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
  subFindFirst.mockResolvedValue({ plan: { priceMonthly: 8990 } });
  opFindUnique.mockResolvedValue(null);
  opCreate.mockResolvedValue({});
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
    // após o create, o endpoint carrega a op completa pra rodar a saga.
    opFindUnique.mockResolvedValue({
      id: "op1", eventId: "ev1", visCompanyId: "co1", requestedTier: "clinic_full",
      targetPlanId: "plan_x", state: "RECEIVED", asaasRef: null,
    });
  });

  it("op nova (fresh) → cria, roda a saga → 200 completed", async () => {
    // 1ª leitura (decisão) = null (nova); 2ª (carregar op p/ saga) = op completa.
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "op1", eventId: "ev1", visCompanyId: "co1", requestedTier: "clinic_full", targetPlanId: "plan_x", state: "RECEIVED", asaasRef: null });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(opCreate).toHaveBeenCalledOnce();
    expect(runSagaMock).toHaveBeenCalledOnce();
  });

  it("DOWNGRADE (plano atual mais caro que o alvo) → 501, NÃO cria op nem roda saga", async () => {
    opFindUnique.mockReset();
    opFindUnique.mockResolvedValueOnce(null);
    // subscription atual = clínica (18990) > alvo (18990 no mock)? não. Forço maior:
    subFindFirst.mockResolvedValueOnce({ plan: { priceMonthly: 99999 } });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(501);
    expect(opCreate).not.toHaveBeenCalled();
    expect(runSagaMock).not.toHaveBeenCalled();
  });

  it("saga falha (checkpoint) → 502 not_completed, retomável", async () => {
    opFindUnique.mockReset();
    opFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "op1", eventId: "ev1", visCompanyId: "co1", requestedTier: "clinic_full", targetPlanId: "plan_x", state: "BILLING_REQUESTED", asaasRef: null });
    runSagaMock.mockResolvedValueOnce({ state: "BILLING_REQUESTED", asaasRef: null, failed: true, lastError: "asaas down" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(502);
    expect(opCreate).toHaveBeenCalledOnce();
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
});
