import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Auth helpers: mockados para simular um usuário autenticado com permissão ---
const requireAuth = vi.fn();
const requirePermission = vi.fn();
const getCompanyId = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: () => requireAuth(),
  requirePermission: (...a: unknown[]) => requirePermission(...a),
  getCompanyId: () => getCompanyId(),
}));

// --- Serviço do funil: mock parcial (mantém o resto do módulo) ---
const listStages = vi.fn();
const ensureDefaultStages = vi.fn();
const ensureOpticalStages = vi.fn();
const createStage = vi.fn();
vi.mock("@/services/lead-stage.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/lead-stage.service")>();
  return {
    ...actual,
    listStages: (...a: unknown[]) => listStages(...a),
    ensureDefaultStages: (...a: unknown[]) => ensureDefaultStages(...a),
    ensureOpticalStages: (...a: unknown[]) => ensureOpticalStages(...a),
    createStage: (...a: unknown[]) => createStage(...a),
  };
});

// Silencia o logger para não poluir a saída dos testes.
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import { GET } from "./route";

const COMPANY_ID = "company-1";
const STAGES = [
  { id: "s1", name: "Novo", order: 0 },
  { id: "s2", name: "Exame agendado", order: 1 },
];

describe("GET /api/lead-stages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: "u1" } });
    requirePermission.mockResolvedValue(undefined);
    getCompanyId.mockResolvedValue(COMPANY_ID);
    ensureDefaultStages.mockResolvedValue(undefined);
    ensureOpticalStages.mockResolvedValue(0);
    listStages.mockResolvedValue(STAGES);
  });

  it("caminho feliz: roda os dois seeds e devolve os estágios", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual(STAGES);

    expect(ensureDefaultStages).toHaveBeenCalledWith(COMPANY_ID);
    expect(ensureOpticalStages).toHaveBeenCalledWith(COMPANY_ID);
    expect(listStages).toHaveBeenCalledWith(COMPANY_ID);
  });

  // Regressão: um seed aditivo (best-effort) NUNCA pode derrubar o board.
  it("tolera falha de seed: mesmo com ensureOpticalStages rejeitando, o board carrega (200)", async () => {
    ensureOpticalStages.mockRejectedValue(new Error("tx timeout"));

    const res = await GET();

    // O board AINDA carrega com os estágios existentes.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(STAGES);

    // listStages ainda rodou apesar do seed ter falhado.
    expect(listStages).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("tolera falha de seed: ensureDefaultStages rejeitando também não derruba o board", async () => {
    ensureDefaultStages.mockRejectedValue(new Error("db blip"));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(STAGES);
    expect(listStages).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("falha de auth ainda propaga para handleApiError (não é best-effort)", async () => {
    requireAuth.mockRejectedValue(new Error("Não autenticado"));

    const res = await GET();

    // O caminho de auth NÃO é tolerado: não deve chegar a listStages.
    expect(res.status).not.toBe(200);
    expect(listStages).not.toHaveBeenCalled();
  });
});
