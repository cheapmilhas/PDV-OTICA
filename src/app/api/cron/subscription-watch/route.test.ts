import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
const findMany = vi.fn();
const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
    },
  },
}));

// Mock notifyCompany
const notifyCompany = vi.fn().mockResolvedValue({ status: "SENT" });
vi.mock("@/services/saas-notification.service", () => ({
  notifyCompany: (...a: unknown[]) => notifyCompany(...a),
}));

// N5: alerta ao operador. Mockado no limite do SERVIÇO (não do prisma) — o que
// este teste verifica é QUANDO o cron alerta, não como a notificação é gravada.
const alertOperators = vi.fn().mockResolvedValue(1);
vi.mock("@/services/trial-alert.service", () => ({
  alertOperators: (...a: unknown[]) => alertOperators(...a),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

// Import after mocks
import { GET } from "./route";

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers["authorization"] = authHeader;
  return new Request("http://localhost/api/cron/subscription-watch", { headers });
}

beforeEach(() => {
  vi.resetAllMocks();
  notifyCompany.mockResolvedValue({ status: "SENT" });
  updateMany.mockResolvedValue({ count: 1 });
  findMany.mockResolvedValue([]);
  alertOperators.mockResolvedValue(1);
  process.env.CRON_SECRET = "test-secret";
});

describe("GET /api/cron/subscription-watch", () => {
  it("401 sem Authorization header (fail-closed)", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("401 com secret errado", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("401 quando CRON_SECRET não está setado (mesmo com header)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(401);
  });

  it("com secret correto e sub TRIAL expirada → chama notifyCompany(TRIAL_EXPIRED) ANTES do updateMany", async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // ontem
    findMany.mockResolvedValue([
      {
        id: "sub-1",
        companyId: "company-1",
        trialEndsAt: pastDate,
        company: { name: "Ótica Teste" },
      },
    ]);

    const callOrder: string[] = [];
    notifyCompany.mockImplementation(async () => {
      callOrder.push("notify");
      return { status: "SENT" };
    });
    updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);

    // notifyCompany deve ter sido chamado com TRIAL_EXPIRED
    expect(notifyCompany).toHaveBeenCalledWith(
      "company-1",
      "TRIAL_EXPIRED",
      expect.objectContaining({ name: "Ótica Teste" }),
      expect.objectContaining({ periodKey: "trial-expired", channels: ["email", "inapp"] })
    );

    // updateMany deve ter virado o status para TRIAL_EXPIRED
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1", status: "TRIAL" },
        data: { status: "TRIAL_EXPIRED" },
      })
    );

    // ORDERING CRÍTICO: notify ANTES do updateMany
    expect(callOrder[0]).toBe("notify");
    expect(callOrder[1]).toBe("updateMany");
  });

  it("com sub TRIAL ending em 2 dias → chama notifyCompany(TRIAL_ENDING), NÃO chama updateMany", async () => {
    const soonDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 dias
    findMany.mockResolvedValue([
      {
        id: "sub-2",
        companyId: "company-2",
        trialEndsAt: soonDate,
        company: { name: "Ótica XYZ" },
      },
    ]);

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);

    expect(notifyCompany).toHaveBeenCalledWith(
      "company-2",
      "TRIAL_ENDING",
      expect.objectContaining({ name: "Ótica XYZ" }),
      expect.objectContaining({ periodKey: "trial-ending", channels: ["email", "inapp"] })
    );

    // TRIAL_ENDING não muda o status
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("retorna summary com ok:true", async () => {
    findMany.mockResolvedValue([]);
    const res = await GET(makeRequest("Bearer test-secret"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  // ── N5: alerta ao OPERADOR ────────────────────────────────────────────────
  describe("N5 — alerta ao operador", () => {
    function trialTerminando() {
      const em2Dias = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      findMany.mockResolvedValue([
        { id: "sub-2", companyId: "company-2", trialEndsAt: em2Dias, company: { name: "Clínica Vida" } },
      ]);
      return em2Dias;
    }

    it("alerta o operador quando o trial está TERMINANDO", async () => {
      const fim = trialTerminando();
      const res = await GET(makeRequest("Bearer test-secret"));
      expect(res.status).toBe(200);
      expect(alertOperators).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: "sub-2",
          companyId: "company-2",
          companyName: "Clínica Vida",
          trialEndsAt: fim,
        })
      );
      expect((await res.json()).alerted).toBe(1);
    });

    it("NÃO alerta no ramo que EXPIRA — alerta não pode se acoplar à virada de status", async () => {
      // 🔑 A propriedade central da fatia. O ramo de expiração muda o STATUS do
      // cliente; se o alerta vivesse ali, uma falha ao notificar o operador
      // poderia interromper a transição de estado de uma assinatura (ou, na
      // ordem inversa, o alerta se perderia para sempre).
      const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
      findMany.mockResolvedValue([
        { id: "sub-1", companyId: "company-1", trialEndsAt: ontem, company: { name: "Ótica Teste" } },
      ]);
      const res = await GET(makeRequest("Bearer test-secret"));
      expect(res.status).toBe(200);
      expect(updateMany).toHaveBeenCalled(); // o status VIRA
      expect(alertOperators).not.toHaveBeenCalled(); // e o alerta não entra aqui
    });

    it("falha do alerta NÃO derruba o cron nem os trials seguintes", async () => {
      // alertOperators é contratado para nunca lançar, mas o cron não pode
      // depender disso: se um dia lançar, o processamento tem que continuar.
      const em2Dias = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      findMany.mockResolvedValue([
        { id: "sub-a", companyId: "co-a", trialEndsAt: em2Dias, company: { name: "A" } },
        { id: "sub-b", companyId: "co-b", trialEndsAt: em2Dias, company: { name: "B" } },
      ]);
      alertOperators.mockRejectedValueOnce(new Error("banco fora"));

      const res = await GET(makeRequest("Bearer test-secret"));
      expect(res.status).toBe(200);
      // o segundo trial foi processado mesmo com o primeiro alerta falhando
      expect(alertOperators).toHaveBeenCalledTimes(2);
      expect(notifyCompany).toHaveBeenCalledTimes(2);
    });

    it("summary.alerted conta notificações CRIADAS, não trials", async () => {
      // Quando o alerta já existe (dedupe), alertOperators devolve 0 — o cron
      // roda igual, mas o resumo distingue "avisei agora" de "já avisado".
      trialTerminando();
      alertOperators.mockResolvedValue(0);
      const res = await GET(makeRequest("Bearer test-secret"));
      const body = await res.json();
      expect(body.ending).toBe(1); // o trial foi processado
      expect(body.alerted).toBe(0); // mas nada de novo foi criado
    });
  });
});
