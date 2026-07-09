import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";

const setupCompanyFinance = vi.fn();
vi.mock("@/services/finance-setup.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/finance-setup.service")>();
  return { ...actual, setupCompanyFinance: (...a: unknown[]) => setupCompanyFinance(...a) };
});

const ensureDefaultStages = vi.fn();
const ensureOpticalStages = vi.fn();
vi.mock("@/services/lead-stage.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/lead-stage.service")>();
  return {
    ...actual,
    ensureDefaultStages: (...a: unknown[]) => ensureDefaultStages(...a),
    ensureOpticalStages: (...a: unknown[]) => ensureOpticalStages(...a),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

// HISTORICAL_DEFAULTS é congelado (Object.freeze) — para testar o fio B2.1
// injetamos um histórico com um default antigo via mock parcial do módulo.
vi.mock("@/lib/default-messages-history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/default-messages-history")>();
  return {
    ...actual,
    HISTORICAL_DEFAULTS: {
      ...actual.HISTORICAL_DEFAULTS,
      quote: ["Texto default antigo v1"],
    },
  };
});

const companyFindUnique = vi.fn();
const companyFindMany = vi.fn();
const branchFindFirst = vi.fn();
const chartCount = vi.fn();
const financeCount = vi.fn();
const templateCount = vi.fn();
const chartFindMany = vi.fn();
const financeFindMany = vi.fn();
const templateFindMany = vi.fn();
const settingsFindUnique = vi.fn();
const settingsCreate = vi.fn();
const settingsUpdate = vi.fn();
const auditCreate = vi.fn();
const configUpsert = vi.fn();
const configUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique: (...a: unknown[]) => companyFindUnique(...a),
      findMany: (...a: unknown[]) => companyFindMany(...a),
    },
    branch: { findFirst: (...a: unknown[]) => branchFindFirst(...a) },
    chartOfAccounts: {
      count: (...a: unknown[]) => chartCount(...a),
      findMany: (...a: unknown[]) => chartFindMany(...a),
    },
    financeAccount: {
      count: (...a: unknown[]) => financeCount(...a),
      findMany: (...a: unknown[]) => financeFindMany(...a),
    },
    reconciliationTemplate: {
      count: (...a: unknown[]) => templateCount(...a),
      findMany: (...a: unknown[]) => templateFindMany(...a),
    },
    companySettings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      create: (...a: unknown[]) => settingsCreate(...a),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
    globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
    autoSyncConfig: {
      upsert: (...a: unknown[]) => configUpsert(...a),
      update: (...a: unknown[]) => configUpdate(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
}));

import { resyncCompanySetup, syncAllCompanies } from "./company-resync.service";

const fullSettings = {
  messageThankYou: DEFAULT_MESSAGES.thankYou,
  messageQuote: DEFAULT_MESSAGES.quote,
  messageReminder: DEFAULT_MESSAGES.reminder,
  messageBirthday: DEFAULT_MESSAGES.birthday,
};

describe("resyncCompanySetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyFindUnique.mockResolvedValue({ id: "co-1", name: "Ótica X" });
    branchFindFirst.mockResolvedValue({ id: "br-1" });
    chartCount.mockResolvedValue(28);
    financeCount.mockResolvedValue(4);
    templateCount.mockResolvedValue(4);
    settingsFindUnique.mockResolvedValue(fullSettings);
    auditCreate.mockResolvedValue({});
    settingsUpdate.mockResolvedValue({});
    settingsCreate.mockResolvedValue({});
  });

  it("retorna null quando a empresa não existe", async () => {
    companyFindUnique.mockResolvedValue(null);
    const r = await resyncCompanySetup("nope", { actorType: "SYSTEM" });
    expect(r).toBeNull();
    expect(setupCompanyFinance).not.toHaveBeenCalled();
  });

  it("modo REAL: roda setupCompanyFinance na transação e reporta created via before/after", async () => {
    chartCount.mockResolvedValueOnce(26).mockResolvedValueOnce(28);
    const r = await resyncCompanySetup("co-1", { actorType: "ADMIN_USER", actorId: "adm-1" });
    expect(setupCompanyFinance).toHaveBeenCalledWith({}, "co-1", "br-1", { additiveOnly: true });
    expect(r?.created.chartOfAccounts).toBe(2);
    expect(r?.changed).toBe(true);
    expect(auditCreate.mock.calls[0][0].data.action).toBe("COMPANY_RESYNCED");
  });

  it("modo DRY-RUN: NÃO chama setupCompanyFinance nem grava settings; calcula faltantes via seeds", async () => {
    chartFindMany.mockResolvedValue([{ code: "1" }]);
    financeFindMany.mockResolvedValue([{ name: "Caixa" }]);
    templateFindMany.mockResolvedValue([]);
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM", dryRun: true });
    expect(setupCompanyFinance).not.toHaveBeenCalled();
    expect(settingsUpdate).not.toHaveBeenCalled();
    expect(settingsCreate).not.toHaveBeenCalled();
    expect(r?.created.chartOfAccounts).toBeGreaterThan(0);
    expect(r?.dryRun).toBe(true);
    expect(auditCreate.mock.calls[0][0].data.action).toBe("COMPANY_AUTO_SYNCED");
    expect(auditCreate.mock.calls[0][0].data.metadata.dryRun).toBe(true);
    expect(auditCreate.mock.calls[0][0].data.actorId).toBeNull();
  });

  it("mensagens: preenche NULL e NÃO toca em texto personalizado", async () => {
    settingsFindUnique.mockResolvedValue({
      ...fullSettings,
      messageThankYou: null,
      messageBirthday: "Texto personalizado da ótica",
    });
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM" });
    expect(r?.messages.filled).toEqual(["thankYou"]);
    expect(r?.messages.updated).toEqual([]);
    const patch = settingsUpdate.mock.calls[0][0].data;
    expect(patch.messageThankYou).toBe(DEFAULT_MESSAGES.thankYou);
    expect(patch.messageBirthday).toBeUndefined();
  });

  it("mensagens: ATUALIZA default antigo intacto (B2.1)", async () => {
    settingsFindUnique.mockResolvedValue({
      ...fullSettings,
      messageQuote: "Texto default antigo v1",
    });
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM" });
    expect(r?.messages.updated).toEqual(["quote"]);
    const patch = settingsUpdate.mock.calls[0][0].data;
    expect(patch.messageQuote).toBe(DEFAULT_MESSAGES.quote);
  });

  it("sem NENHUMA mudança: changed=false e NÃO grava auditoria", async () => {
    const r = await resyncCompanySetup("co-1", { actorType: "SYSTEM" });
    expect(r?.changed).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe("syncAllCompanies", () => {
  // beforeEach PRÓPRIO e completo — NÃO depender do describe anterior.
  beforeEach(() => {
    vi.clearAllMocks();
    configUpsert.mockResolvedValue({ id: "singleton", isEnabled: true, dryRun: false });
    configUpdate.mockResolvedValue({});
    companyFindMany.mockResolvedValue([]);
    companyFindUnique.mockResolvedValue({ id: "co-x", name: "X" });
    branchFindFirst.mockResolvedValue({ id: "br-1" });
    chartCount.mockResolvedValue(28);
    financeCount.mockResolvedValue(4);
    templateCount.mockResolvedValue(4);
    settingsFindUnique.mockResolvedValue(fullSettings);
    auditCreate.mockResolvedValue({});
  });

  it("desligado → no-op (não consulta empresas)", async () => {
    configUpsert.mockResolvedValue({ id: "singleton", isEnabled: false, dryRun: true });
    const r = await syncAllCompanies();
    expect(r.skipped).toBe(true);
    expect(companyFindMany).not.toHaveBeenCalled();
  });

  it("erro em UMA empresa não para as outras + grava lastRunSummary", async () => {
    companyFindMany.mockResolvedValue([{ id: "co-1" }, { id: "co-2" }]);
    companyFindUnique
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ id: "co-2", name: "Ok" });
    const r = await syncAllCompanies();
    expect(r).toMatchObject({ total: 2, errors: 1, changed: 0, unchanged: 1 });
    expect(configUpdate).toHaveBeenCalledOnce();
  });
});
