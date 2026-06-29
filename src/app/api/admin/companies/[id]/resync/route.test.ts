import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  // Fase 1 segurança: a rota agora exige escopo de empresa. O mock espelha a
  // lógica real de requireCompanyScope — só ADMIN/SUPER_ADMIN passam (escopo ok);
  // SUPPORT/BILLING retornam null (403), preservando o teste de papel insuficiente.
  requireCompanyScope: async (adminId: string) => {
    const session = await getAdminSession();
    if (session && ["ADMIN", "SUPER_ADMIN"].includes(session.role)) {
      return { id: adminId, role: session.role };
    }
    return null;
  },
}));

const setupCompanyFinance = vi.fn();
// Mock PARCIAL: o service de resync importa também os seeds (CHART_OF_ACCOUNTS_SEED etc.)
vi.mock("@/services/finance-setup.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/finance-setup.service")>();
  return { ...actual, setupCompanyFinance: (...a: unknown[]) => setupCompanyFinance(...a) };
});

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

const ensureDefaultStages = vi.fn();
vi.mock("@/services/lead-stage.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/lead-stage.service")>();
  return { ...actual, ensureDefaultStages: (...a: unknown[]) => ensureDefaultStages(...a) };
});

// Contadores controláveis: before usa o 1º valor de cada count, after o 2º.
const counts = {
  chartOfAccounts: [0, 0],
  financeAccount: [0, 0],
  reconciliationTemplate: [0, 0],
};

const companyFindUnique = vi.fn();
const branchFindFirst = vi.fn();
const globalAuditCreate = vi.fn();

function makeCounter(key: keyof typeof counts) {
  let call = 0;
  return vi.fn(async () => counts[key][call++ % 2]);
}

let chartCount = makeCounter("chartOfAccounts");
let financeCount = makeCounter("financeAccount");
let templateCount = makeCounter("reconciliationTemplate");

// Settings completos com os defaults ATUAIS → sync de mensagens é no-op nos testes.
const fullSettings = {
  messageThankYou: DEFAULT_MESSAGES.thankYou,
  messageQuote: DEFAULT_MESSAGES.quote,
  messageReminder: DEFAULT_MESSAGES.reminder,
  messageBirthday: DEFAULT_MESSAGES.birthday,
};
const settingsFindUnique = vi.fn(async (..._a: unknown[]) => fullSettings);
const settingsCreate = vi.fn();
const settingsUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    branch: { findFirst: (...a: unknown[]) => branchFindFirst(...a) },
    chartOfAccounts: { count: () => chartCount(), findMany: vi.fn(async () => []) },
    financeAccount: { count: () => financeCount(), findMany: vi.fn(async () => []) },
    reconciliationTemplate: { count: () => templateCount(), findMany: vi.fn(async () => []) },
    companySettings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      create: (...a: unknown[]) => settingsCreate(...a),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
    globalAudit: { create: (...a: unknown[]) => globalAuditCreate(...a) },
    // $transaction repassa um "tx" (aqui o próprio objeto) para o callback.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

import { POST } from "./route";

function ctx(id = "co-1") {
  return { params: Promise.resolve({ id }) };
}
function req() {
  return new Request("http://x/api/admin/companies/co-1/resync", { method: "POST" });
}

describe("POST /api/admin/companies/[id]/resync", () => {
  beforeEach(() => {
    getAdminSession.mockReset();
    setupCompanyFinance.mockReset().mockResolvedValue(undefined);
    companyFindUnique.mockReset().mockResolvedValue({ id: "co-1", name: "Ótica X" });
    branchFindFirst.mockReset().mockResolvedValue({ id: "br-1" });
    globalAuditCreate.mockReset().mockResolvedValue({});
    counts.chartOfAccounts = [0, 0];
    counts.financeAccount = [0, 0];
    counts.reconciliationTemplate = [0, 0];
    chartCount = makeCounter("chartOfAccounts");
    financeCount = makeCounter("financeAccount");
    templateCount = makeCounter("reconciliationTemplate");
  });

  it("retorna 401 sem sessão admin", async () => {
    getAdminSession.mockResolvedValue(null);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(setupCompanyFinance).not.toHaveBeenCalled();
  });

  it("retorna 403 para papel sem permissão", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPPORT" });
    const res = await POST(req(), ctx());
    expect(res.status).toBe(403);
    expect(setupCompanyFinance).not.toHaveBeenCalled();
  });

  it("retorna 404 quando a empresa não existe", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "ADMIN" });
    companyFindUnique.mockResolvedValue(null);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(404);
    expect(setupCompanyFinance).not.toHaveBeenCalled();
  });

  it("é idempotente: re-rodar sem mudança retorna created=0 e não duplica", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "ADMIN" });
    // before == after em tudo → nada foi criado (idempotência)
    counts.chartOfAccounts = [12, 12];
    counts.financeAccount = [5, 5];
    counts.reconciliationTemplate = [3, 3];
    chartCount = makeCounter("chartOfAccounts");
    financeCount = makeCounter("financeAccount");
    templateCount = makeCounter("reconciliationTemplate");

    const res = await POST(req(), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(setupCompanyFinance).toHaveBeenCalledOnce();
    // passa o tx, o branchId resolvido e o modo aditivo (nunca toca registro existente)
    expect(setupCompanyFinance).toHaveBeenCalledWith({}, "co-1", "br-1", { additiveOnly: true });
    expect(json.data.created).toEqual({
      chartOfAccounts: 0,
      financeAccounts: 0,
      reconciliationTemplates: 0,
    });
  });

  it("reporta o que foi criado quando a empresa estava desatualizada", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPER_ADMIN" });
    counts.chartOfAccounts = [10, 12]; // +2
    counts.financeAccount = [4, 5]; // +1
    counts.reconciliationTemplate = [3, 3]; // +0
    chartCount = makeCounter("chartOfAccounts");
    financeCount = makeCounter("financeAccount");
    templateCount = makeCounter("reconciliationTemplate");

    const res = await POST(req(), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.created).toEqual({
      chartOfAccounts: 2,
      financeAccounts: 1,
      reconciliationTemplates: 0,
    });
    // grava trilha de auditoria com before/after
    expect(globalAuditCreate).toHaveBeenCalledOnce();
    const auditArg = globalAuditCreate.mock.calls[0][0];
    expect(auditArg.data.action).toBe("COMPANY_RESYNCED");
    expect(auditArg.data.companyId).toBe("co-1");
  });
});
