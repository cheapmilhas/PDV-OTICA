import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Auth helpers: mockados para simular sessão/permissão ---
const requireAuth = vi.fn();
const requirePermission = vi.fn();
const getCompanyId = vi.fn();
const getUserId = vi.fn();
const getBranchId = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: () => requireAuth(),
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  getCompanyId: () => getCompanyId(),
  getUserId: () => getUserId(),
  getBranchId: () => getBranchId(),
}));

// --- Serviço de agendamento de exame: mock total ---
const createExamAppointment = vi.fn();
const listExamAppointmentsForDay = vi.fn();
vi.mock("@/services/exam-appointment.service", () => ({
  createExamAppointment: (...a: unknown[]) => createExamAppointment(...a),
  listExamAppointmentsForDay: (...a: unknown[]) => listExamAppointmentsForDay(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import { POST, GET } from "./route";
import { unauthorizedError, forbiddenError } from "@/lib/error-handler";

const COMPANY_ID = "company-1";
const USER_ID = "user-1";
const BRANCH_ID = "branch-1";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/exam-appointments", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function makeGetRequest(query = "") {
  return new Request(
    `http://localhost/api/exam-appointments${query}`,
    { method: "GET" }
  ) as unknown as Parameters<typeof GET>[0];
}

describe("POST /api/exam-appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: USER_ID } });
    requirePermission.mockResolvedValue(undefined);
    getCompanyId.mockResolvedValue(COMPANY_ID);
    getUserId.mockResolvedValue(USER_ID);
    getBranchId.mockResolvedValue(BRANCH_ID);
    createExamAppointment.mockResolvedValue({ id: "appt-1", leadId: "lead-1" });
    listExamAppointmentsForDay.mockResolvedValue([]);
  });

  it("sem auth (requireAuth lança) -> 401", async () => {
    requireAuth.mockRejectedValue(unauthorizedError());

    const res = await POST(makeRequest({ leadId: "lead-1", scheduledAt: "2026-07-15T10:00:00Z" }));

    expect(res.status).toBe(401);
    expect(createExamAppointment).not.toHaveBeenCalled();
  });

  it("sem permissão (requirePermission lança) -> 403", async () => {
    requirePermission.mockRejectedValue(forbiddenError("Sem permissão: leads.edit"));

    const res = await POST(makeRequest({ leadId: "lead-1", scheduledAt: "2026-07-15T10:00:00Z" }));

    expect(res.status).toBe(403);
    expect(createExamAppointment).not.toHaveBeenCalled();
  });

  it("caminho feliz -> 201 e companyId/userId vêm da SESSÃO, não do body", async () => {
    const body = {
      leadId: "lead-1",
      scheduledAt: "2026-07-15T10:00:00Z",
      // Tentativa maliciosa/enganosa de mandar companyId/userId no body — deve
      // ser ignorada; o service tem que receber os valores da sessão mockada.
      companyId: "attacker-company",
      createdByUserId: "attacker-user",
    };

    const res = await POST(makeRequest(body));

    expect(res.status).toBe(201);
    expect(createExamAppointment).toHaveBeenCalledTimes(1);
    const [input, companyIdArg, userIdArg] = createExamAppointment.mock.calls[0];
    expect(companyIdArg).toBe(COMPANY_ID);
    expect(userIdArg).toBe(USER_ID);
    expect(input.leadId).toBe("lead-1");
  });
});

describe("GET /api/exam-appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: USER_ID } });
    requirePermission.mockResolvedValue(undefined);
    getCompanyId.mockResolvedValue(COMPANY_ID);
    getUserId.mockResolvedValue(USER_ID);
    getBranchId.mockResolvedValue(BRANCH_ID);
    listExamAppointmentsForDay.mockResolvedValue([{ id: "appt-1" }]);
  });

  it("caminho feliz -> 200, chama listExamAppointmentsForDay com companyId da sessão", async () => {
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([{ id: "appt-1" }]);
    expect(listExamAppointmentsForDay).toHaveBeenCalledTimes(1);
    const [, companyIdArg] = listExamAppointmentsForDay.mock.calls[0];
    expect(companyIdArg).toBe(COMPANY_ID);
  });

  it("sem ?branchId (Todas as filiais) -> branchId=null, NÃO usa a filial da sessão", async () => {
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(listExamAppointmentsForDay).toHaveBeenCalledTimes(1);
    const [, , branchIdArg] = listExamAppointmentsForDay.mock.calls[0];
    expect(branchIdArg).toBeNull();
    expect(branchIdArg).not.toBe(BRANCH_ID);
  });

  it("?branchId=ALL -> branchId=null", async () => {
    const res = await GET(makeGetRequest("?branchId=ALL"));

    expect(res.status).toBe(200);
    const [, , branchIdArg] = listExamAppointmentsForDay.mock.calls[0];
    expect(branchIdArg).toBeNull();
  });

  it("?branchId=branch-2 -> chama com 'branch-2' (seletor do cliente manda)", async () => {
    const res = await GET(makeGetRequest("?branchId=branch-2"));

    expect(res.status).toBe(200);
    const [, , branchIdArg] = listExamAppointmentsForDay.mock.calls[0];
    expect(branchIdArg).toBe("branch-2");
  });
});
