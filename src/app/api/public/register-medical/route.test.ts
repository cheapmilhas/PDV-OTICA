import { describe, it, expect, vi, beforeEach } from "vitest";

const companyFindFirst = vi.fn();
const companyFindUnique = vi.fn();
const planFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findFirst: (...a: unknown[]) => companyFindFirst(...a),
      findUnique: (...a: unknown[]) => companyFindUnique(...a),
    },
    plan: { findFirst: (...a: unknown[]) => planFindFirst(...a) },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimitResponse: vi.fn(() => null) }));
vi.mock("@/services/provisioning-outbox.service", () => ({
  enqueueProvisioning: vi.fn(),
  runProvisioningOnce: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/public/register-medical", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

const valid = { name: "Dra. Ana", email: "ana@clinica.test", companyName: "Clínica Ana", document: "12345678901" };

describe("POST /api/public/register-medical", () => {
  beforeEach(() => vi.clearAllMocks());

  it("400 se faltam campos obrigatórios", async () => {
    const res = await POST(req({ name: "Ana" }));
    expect(res.status).toBe(400);
  });

  it("400 se documento não é CPF (11) nem CNPJ (14)", async () => {
    const res = await POST(req({ ...valid, document: "123" }));
    expect(res.status).toBe(400);
  });

  it("409 se email já cadastrado", async () => {
    companyFindFirst.mockResolvedValueOnce({ id: "existing" }); // email check
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
  });

  it("busca plano SÓ VIS_MEDICAL self-service (guard do P0)", async () => {
    companyFindFirst.mockResolvedValue(null); // email + doc livres
    planFindFirst.mockResolvedValue(null); // sem plano → 500, mas o que importa é a WHERE
    await POST(req(valid));
    // a 2ª chamada (fallback) filtra por produto medical + selfService
    const call = planFindFirst.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
    expect(call.where.platformProduct).toBe("VIS_MEDICAL");
    expect(call.where.selfServiceSelectable).toBe(true);
  });

  it("aceita CPF (11 dígitos) — clínica pode ser PF", async () => {
    companyFindFirst.mockResolvedValue(null);
    planFindFirst.mockResolvedValue(null); // para no 500, mas passou da validação de doc
    const res = await POST(req({ ...valid, document: "12345678901" }));
    // não é 400 (documento válido); é 500 por falta de plano no mock
    expect(res.status).not.toBe(400);
  });

  it("plano medical SEM tier válido → 500 (fail-closed, não provisiona)", async () => {
    companyFindFirst.mockResolvedValue(null);
    // plano existe mas com tier nulo → gating do Domus abriria tudo; deve barrar.
    planFindFirst.mockResolvedValue({ id: "p1", tier: null, trialDays: 14 });
    const res = await POST(req(valid));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tier/i);
    // nunca chegou a enfileirar o provisionamento
    const { enqueueProvisioning } = await import("@/services/provisioning-outbox.service");
    expect(enqueueProvisioning).not.toHaveBeenCalled();
  });

  it("plano com tier desconhecido → 500 (não confia em 'não vazio')", async () => {
    companyFindFirst.mockResolvedValue(null);
    planFindFirst.mockResolvedValue({ id: "p1", tier: "premium_typo", trialDays: 14 });
    const res = await POST(req(valid));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/tier/i);
  });
});
