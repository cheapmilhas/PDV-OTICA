import { beforeEach, describe, expect, it, vi } from "vitest";

import { signVisProvision } from "@/lib/vis-provision-hmac";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

const companyFindFirst = vi.fn();
const subscriptionFindMany = vi.fn();
const invoiceFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findFirst: (...a: unknown[]) => companyFindFirst(...a) },
    subscription: { findMany: (...a: unknown[]) => subscriptionFindMany(...a) },
    invoice: { findFirst: (...a: unknown[]) => invoiceFindFirst(...a) },
  },
}));

import { GET } from "./route";

const SECRET = "segredo-de-teste";
const PATH = "/api/internal/domus/billing";
const CLINIC_ID = "11111111-2222-3333-4444-555555555555";

function req(over: { clinicId?: string; ts?: number; signature?: string } = {}) {
  const clinicId = over.clinicId ?? CLINIC_ID;
  const ts = over.ts ?? Date.now();
  const nonce = "nonce-1";
  const signature =
    over.signature ??
    signVisProvision(SECRET, {
      version: 1,
      method: "GET",
      path: PATH,
      nonce,
      ts,
      body: clinicId,
    });

  return new Request(`http://localhost${PATH}`, {
    headers: {
      "x-vis-clinic-id": clinicId,
      "x-vis-timestamp": String(ts),
      "x-vis-nonce": nonce,
      "x-vis-signature": signature,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DOMUS_VIS_BILLING_SECRET = SECRET;
  companyFindFirst.mockResolvedValue({ id: "co-1" });
  subscriptionFindMany.mockResolvedValue([
    {
      id: "sub-1",
      status: "TRIAL",
      trialEndsAt: new Date("2026-08-07T11:01:20Z"),
      currentPeriodEnd: null,
      plan: { name: "Clinica" },
    },
  ]);
  invoiceFindFirst.mockResolvedValue({
    id: "inv-1",
    status: "PENDING",
    total: 18990,
    dueDate: new Date("2026-08-06T12:00:00Z"),
    periodStart: new Date("2026-08-07T11:01:20Z"),
    periodEnd: new Date("2026-09-07T11:01:20Z"),
    paymentUrl: "https://www.asaas.com/i/abc",
    pixCode: "0002012636",
    boletoUrl: null,
  });
});

describe("GET /api/internal/domus/billing — autenticação", () => {
  it("401 sem headers de assinatura", async () => {
    const res = await GET(new Request(`http://localhost${PATH}`));
    expect(res.status).toBe(401);
    expect(companyFindFirst).not.toHaveBeenCalled();
  });

  it("401 com assinatura inválida", async () => {
    const res = await GET(req({ signature: "00".repeat(32) }));
    expect(res.status).toBe(401);
    expect(companyFindFirst).not.toHaveBeenCalled();
  });

  it("401 quando o timestamp está fora da janela (replay velho)", async () => {
    const res = await GET(req({ ts: Date.now() - 10 * 60 * 1000 }));
    expect(res.status).toBe(401);
  });

  it("401 se o clinicId for TROCADO sem reassinar (o header entra na assinatura)", async () => {
    // Impede IDOR cross-tenant: quem captura uma assinatura válida não consegue
    // apontá-la para outra clínica.
    const ts = Date.now();
    const assinadoParaOutra = signVisProvision(SECRET, {
      version: 1,
      method: "GET",
      path: PATH,
      nonce: "nonce-1",
      ts,
      body: "outra-clinica",
    });

    const res = await GET(req({ ts, signature: assinadoParaOutra }));

    expect(res.status).toBe(401);
    expect(companyFindFirst).not.toHaveBeenCalled();
  });

  it("503 quando o segredo não está configurado (não passa batido)", async () => {
    delete process.env.DOMUS_VIS_BILLING_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(503);
  });
});

describe("GET /api/internal/domus/billing — resolução e resposta", () => {
  it("resolve a empresa SÓ por domusClinicId + produto medical", async () => {
    await GET(req());
    expect(companyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { domusClinicId: CLINIC_ID, platformProduct: "VIS_MEDICAL" },
      })
    );
  });

  it("devolve os valores da FATURA congelada (não o preço atual do plano)", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      state: "pending",
      amountCents: 18990,
      planName: "Clinica",
      pixCode: "0002012636",
      paymentUrl: "https://www.asaas.com/i/abc",
    });
  });

  it("só considera fatura de MENSALIDADE (isManual false)", async () => {
    // Uma taxa avulsa não é a cobrança da assinatura e não pode aparecer aqui.
    await GET(req());
    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscriptionId: "sub-1", isManual: false }),
      })
    );
  });

  it("sem cobrança emitida → state no_charge (não finge pendência)", async () => {
    invoiceFindFirst.mockResolvedValue(null);
    const body = await (await GET(req())).json();
    expect(body.state).toBe("no_charge");
    expect(body.amountCents).toBeNull();
  });

  it("fatura paga → state paid", async () => {
    invoiceFindFirst.mockResolvedValue({ status: "PAID", total: 18990 });
    const body = await (await GET(req())).json();
    expect(body.state).toBe("paid");
  });

  it("só consulta fatura em estado PAGÁVEL (não serve cancelada como atual)", async () => {
    await GET(req());
    expect(invoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING", "OVERDUE", "PAID"] },
        }),
      })
    );
  });

  it("status não-pagável NUNCA vira 'pending' (senão a tela ofereceria PIX)", async () => {
    // 🔥 Um `else return "pending"` faria fatura CANCELADA/ESTORNADA aparecer
    // como cobrança a pagar — o cliente pagaria algo que não existe mais.
    for (const status of ["CANCELED", "REFUNDED", "DRAFT", "QUALQUER_COISA"]) {
      invoiceFindFirst.mockResolvedValue({ status, total: 18990 });
      const body = await (await GET(req())).json();
      expect(body.state).toBe("no_charge");
    }
  });

  it("404 quando a clínica não tem par no Vis", async () => {
    companyFindFirst.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
  });

  it("409 com mais de uma assinatura — não escolhe a errada sozinho", async () => {
    subscriptionFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    expect((await GET(req())).status).toBe(409);
  });
});
