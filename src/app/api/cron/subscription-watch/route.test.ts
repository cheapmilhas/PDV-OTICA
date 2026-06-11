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
});
