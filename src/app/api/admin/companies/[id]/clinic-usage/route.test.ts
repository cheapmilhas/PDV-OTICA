import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSession(...a),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const companyFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) } },
}));

const getClinicUsage = vi.fn();
vi.mock("@/lib/vis-usage-client", () => ({
  getClinicUsageFromDomus: (...a: unknown[]) => getClinicUsage(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

import { GET } from "./route";

const params = Promise.resolve({ id: "co1" });
const req = () => new Request("http://x/api/admin/companies/co1/clinic-usage");

const USO = {
  doctorsActive: 2,
  staffActive: 3,
  patients: 118,
  appointments: 40,
  appointmentsLast30d: 5,
  medicalRecords: 7,
  workingHoursDays: 5,
  onlineBookingEnabled: 1,
  legalFieldsFilled: 1,
};

beforeEach(() => {
  getAdminSession.mockReset().mockResolvedValue({ id: "a1", role: "ADMIN" });
  requireCompanyScope.mockReset().mockResolvedValue({ id: "a1" });
  companyFindUnique
    .mockReset()
    .mockResolvedValue({ platformProduct: "VIS_MEDICAL", domusClinicId: "uuid-clinica" });
  getClinicUsage.mockReset().mockResolvedValue({ kind: "ok", usage: USO });
});

describe("autorização — o ÚNICO ponto de gate do canal", () => {
  it("401 sem sessão", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await GET(req(), { params })).status).toBe(401);
  });

  it("404 (não 403) quando o admin está FORA do escopo da empresa", async () => {
    // 🔑 O defeito que eu cometi na N5: papel não é escopo. 404 e não 403
    // para não confirmar a existência do id a quem não pode vê-lo.
    requireCompanyScope.mockResolvedValue(null);
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });

  it("checa o escopo ANTES de ler a empresa", async () => {
    // Ler primeiro e gatear depois já teria vazado a existência pelo timing.
    const ordem: string[] = [];
    requireCompanyScope.mockImplementation(async () => {
      ordem.push("escopo");
      return null;
    });
    companyFindUnique.mockImplementation(async () => {
      ordem.push("empresa");
      return null;
    });
    await GET(req(), { params });
    expect(ordem).toEqual(["escopo"]);
  });

  it("NUNCA chama o Domus quando o escopo nega", async () => {
    requireCompanyScope.mockResolvedValue(null);
    await GET(req(), { params });
    expect(getClinicUsage).not.toHaveBeenCalled();
  });

  it("404 para empresa que não é medical", async () => {
    companyFindUnique.mockResolvedValue({ platformProduct: "VIS_APP", domusClinicId: null });
    expect((await GET(req(), { params })).status).toBe(404);
  });
});

describe("o clinicId vem do BANCO, nunca do operador", () => {
  it("usa Company.domusClinicId na chamada ao Domus", async () => {
    // Aceitar id vindo da requisição tornaria o gate de escopo decorativo:
    // bastaria pedir a clínica de outro tenant.
    await GET(req(), { params });
    expect(getClinicUsage).toHaveBeenCalledWith("uuid-clinica");
  });
});

describe("estados — falha NUNCA vira zero", () => {
  it("clínica sem provisionamento tem estado PRÓPRIO", async () => {
    companyFindUnique.mockResolvedValue({
      platformProduct: "VIS_MEDICAL",
      domusClinicId: null,
    });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).data.state).toBe("nao_provisionada");
    expect(getClinicUsage).not.toHaveBeenCalled();
  });

  it("canal indisponível → estado 'indisponivel', SEM usage e SEM zeros", async () => {
    // 🔑 Zeros aqui fariam a tela dizer "a clínica não usa o produto" quando a
    // verdade é "não sei" — e o operador desistiria de um cliente ativo.
    getClinicUsage.mockResolvedValue({ kind: "unavailable", reason: "http_503" });
    const res = await GET(req(), { params });
    const body = await res.json();
    expect(res.status).toBe(200); // estado previsto, não erro da requisição
    expect(body.data.state).toBe("indisponivel");
    expect(body.data.usage).toBeUndefined();
    expect(body.data.onboarding).toBeUndefined();
  });

  it("o motivo técnico da falha NÃO vaza na resposta", async () => {
    getClinicUsage.mockResolvedValue({
      kind: "unavailable",
      reason: "falha_de_rede: getaddrinfo ENOTFOUND interno.example",
    });
    const texto = JSON.stringify(await (await GET(req(), { params })).json());
    expect(texto).not.toContain("ENOTFOUND");
    expect(texto).not.toContain("falha_de_rede");
  });

  it("sucesso devolve uso E checklist derivado", async () => {
    const body = await (await GET(req(), { params })).json();
    expect(body.data.state).toBe("ok");
    expect(body.data.usage.patients).toBe(118);
    expect(body.data.onboarding.percent).toBe(100);
    expect(body.data.onboarding.ativa).toBe(true);
  });
});
