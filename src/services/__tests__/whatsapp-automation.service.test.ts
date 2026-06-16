import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testa o motor das automações: só processa óticas habilitadas+conectadas,
 * respeita as flags por tipo, consulta os gatilhos certos e chama
 * sendWhatsappMessage com periodKey/referenceId corretos (idempotência).
 */

const isEnabled = vi.fn();
vi.mock("@/lib/whatsapp-flag", () => ({
  isWhatsappEnabledForCompany: (...a: unknown[]) => isEnabled(...a),
}));

const send = vi.fn();
const checkElig = vi.fn();
vi.mock("@/lib/whatsapp-send", () => ({
  sendWhatsappMessage: (...a: unknown[]) => send(...a),
  checkWhatsappEligibility: (...a: unknown[]) => checkElig(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const connFindMany = vi.fn();
const settingsFindUnique = vi.fn();
const companyFindUnique = vi.fn();
const soFindMany = vi.fn();
const arFindMany = vi.fn();
const custFindMany = vi.fn();
const logCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConnection: { findMany: (...a: unknown[]) => connFindMany(...a) },
    companySettings: { findUnique: (...a: unknown[]) => settingsFindUnique(...a) },
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    serviceOrder: { findMany: (...a: unknown[]) => soFindMany(...a) },
    accountReceivable: { findMany: (...a: unknown[]) => arFindMany(...a) },
    customer: { findMany: (...a: unknown[]) => custFindMany(...a) },
    whatsappMessageLog: { create: (...a: unknown[]) => logCreate(...a) },
  },
}));

// P2002 (Prisma) p/ provar que o enqueue só engole conflito de unique.
// A classe vai DENTRO do factory: vi.mock é hoisted ao topo do arquivo, então
// não pode referenciar variáveis de escopo externo.
vi.mock("@prisma/client", () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(message: string, opts: { code: string; clientVersion: string }) {
      super(message);
      this.code = opts.code;
      this.clientVersion = opts.clientVersion;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

import { Prisma } from "@prisma/client";
const makeP2002 = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });

import { runWhatsappAutomations } from "@/services/whatsapp-automation.service";

const ALL_OFF = {
  displayName: "Ótica X",
  waOsReadyEnabled: false, waPostSaleEnabled: false, waBirthdayEnabled: false, waInstallmentDueEnabled: false,
  waOsReadyTemplate: null, waPostSaleTemplate: null, waBirthdayTemplate: null, waInstallmentDueTemplate: null,
  waPostSaleDays: 7,
};

const customer = { id: "cust1", name: "João", phone: "11999999999", acceptsMarketing: true };

describe("runWhatsappAutomations", () => {
  beforeEach(() => {
    isEnabled.mockReset().mockReturnValue(true);
    send.mockReset().mockResolvedValue({ status: "SENT" });
    checkElig.mockReset().mockResolvedValue({ eligible: true, number: "5511999999999", content: "msg" });
    connFindMany.mockReset().mockResolvedValue([{ companyId: "co1" }]);
    settingsFindUnique.mockReset().mockResolvedValue({ ...ALL_OFF });
    companyFindUnique.mockReset().mockResolvedValue({ name: "Ótica X" });
    soFindMany.mockReset().mockResolvedValue([]);
    arFindMany.mockReset().mockResolvedValue([]);
    custFindMany.mockReset().mockResolvedValue([]);
    logCreate.mockReset().mockResolvedValue({ id: "log1" });
  });

  it("pula óticas não habilitadas pela flag", async () => {
    isEnabled.mockReturnValue(false);
    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(r.companiesProcessed).toBe(0);
    expect(settingsFindUnique).not.toHaveBeenCalled();
  });

  it("só busca óticas CONNECTED", async () => {
    await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(connFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "CONNECTED" },
    }));
  });

  it("com options.companyId → restringe a varredura àquela ótica", async () => {
    await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"), { companyId: "co1" });
    expect(connFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "CONNECTED", companyId: "co1" },
    }));
  });

  it("dryRun → NÃO envia, coleta a prévia só dos elegíveis", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waOsReadyEnabled: true });
    soFindMany.mockResolvedValueOnce([
      { id: "os1", number: 1234, readyAt: new Date("2026-06-15T10:00:00Z"), customer },
    ]);
    checkElig.mockResolvedValue({ eligible: true, number: "5511999999999", content: "Seu óculos está pronto" });

    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"), { dryRun: true });

    expect(send).not.toHaveBeenCalled();      // não envia
    expect(checkElig).toHaveBeenCalledTimes(1); // checou elegibilidade
    expect(r.sent).toBe(0);
    expect(r.preview).toHaveLength(1);
    expect(r.preview[0]).toMatchObject({
      type: "OS_READY",
      customerName: "João",
      phone: "5511999999999",
      content: "Seu óculos está pronto",
    });
  });

  it("dryRun → não elegível é OMITIDO da prévia", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waOsReadyEnabled: true });
    soFindMany.mockResolvedValueOnce([
      { id: "os1", number: 1234, readyAt: new Date("2026-06-15T10:00:00Z"), customer },
    ]);
    checkElig.mockResolvedValue({ eligible: false, skipReason: "no_consent", content: "x" });

    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"), { dryRun: true });

    expect(send).not.toHaveBeenCalled();
    expect(r.preview).toHaveLength(0);
  });

  it("todas as flags OFF → não envia nada", async () => {
    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(r.companiesProcessed).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(soFindMany).not.toHaveBeenCalled();
  });

  it("OS_READY ligado → envia com type OS_READY transacional + periodKey do readyAt", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waOsReadyEnabled: true });
    soFindMany.mockResolvedValueOnce([
      { id: "os1", number: 1234, readyAt: new Date("2026-06-15T10:00:00Z"), customer },
    ]);
    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.type).toBe("OS_READY");
    expect(arg.transactional).toBe(true);
    expect(arg.referenceId).toBe("os1");
    expect(arg.periodKey).toBe("2026-06-15");
    expect(arg.variables.validade).toContain("001234"); // osDisplayNumber
    expect(r.byType.OS_READY.sent).toBe(1);
  });

  it("INSTALLMENT_DUE ligado → query PENDING + dueDate na janela; periodKey=dueDate", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waInstallmentDueEnabled: true });
    arFindMany.mockResolvedValueOnce([
      { id: "ar1", amount: 199.9, dueDate: new Date("2026-06-17T03:00:00Z"), installmentNumber: 2, totalInstallments: 6, customer },
    ]);
    await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(arFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
    }));
    const arg = send.mock.calls[0][0];
    expect(arg.type).toBe("INSTALLMENT_DUE");
    expect(arg.transactional).toBe(true);
    expect(arg.referenceId).toBe("ar1");
    expect(arg.periodKey).toBe("2026-06-17"); // dia do vencimento (BRT)
    expect(arg.variables.produto).toBe("2/6");
  });

  it("BIRTHDAY: só envia para quem faz aniversário hoje (mês+dia), marketing", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waBirthdayEnabled: true });
    custFindMany.mockResolvedValueOnce([
      { ...customer, id: "aniv", birthDate: new Date("1990-06-15T12:00:00Z") },   // hoje
      { ...customer, id: "outro", birthDate: new Date("1990-07-20T12:00:00Z") },  // outro dia
    ]);
    await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.type).toBe("BIRTHDAY");
    expect(arg.transactional).toBe(false); // marketing → respeita consentimento
    expect(arg.referenceId).toBe("aniv");
  });

  it("POST_SALE: transacional=false (marketing)", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waPostSaleEnabled: true });
    soFindMany.mockResolvedValueOnce([{ id: "os9", customer }]);
    await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    const arg = send.mock.calls[0][0];
    expect(arg.type).toBe("POST_SALE");
    expect(arg.transactional).toBe(false);
  });

  it("falha numa ótica não interrompe as demais", async () => {
    connFindMany.mockResolvedValue([{ companyId: "co1" }, { companyId: "co2" }]);
    settingsFindUnique
      .mockResolvedValueOnce({ ...ALL_OFF, waOsReadyEnabled: true })
      .mockResolvedValueOnce({ ...ALL_OFF });
    soFindMany.mockRejectedValueOnce(new Error("db blip"));
    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"));
    expect(r.companiesProcessed).toBe(2); // ambas processadas, sem throw
  });

  // --- Modo enqueue (fila anti-bloqueio): cria PENDING sem enviar ---

  it("enqueue → NÃO envia; cria PENDING para o elegível", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waOsReadyEnabled: true });
    soFindMany.mockResolvedValueOnce([
      { id: "os1", number: 1234, readyAt: new Date("2026-06-15T10:00:00Z"), customer },
    ]);
    checkElig.mockResolvedValue({ eligible: true, number: "5511999999999", content: "Seu óculos está pronto" });

    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"), { enqueue: true });

    expect(send).not.toHaveBeenCalled();        // não envia direto
    expect(checkElig).toHaveBeenCalledTimes(1);   // checou elegibilidade
    expect(logCreate).toHaveBeenCalledTimes(1);
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PENDING",
        type: "OS_READY",
        referenceId: "os1",
        periodKey: "2026-06-15",
        phone: "5511999999999",
        content: "Seu óculos está pronto",
      }),
    }));
    // enqueue não faz tally (a contagem real vem do processador)
    expect(r.sent).toBe(0);
  });

  it("enqueue → inelegível NÃO cria linha", async () => {
    settingsFindUnique.mockResolvedValue({ ...ALL_OFF, waOsReadyEnabled: true });
    soFindMany.mockResolvedValueOnce([
      { id: "os1", number: 1234, readyAt: new Date("2026-06-15T10:00:00Z"), customer },
    ]);
    checkElig.mockResolvedValue({ eligible: false, skipReason: "no_phone", content: "x" });

    await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"), { enqueue: true });

    expect(send).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("enqueue → P2002 (duplicata em corrida) é engolido, não derruba a varredura", async () => {
    connFindMany.mockResolvedValue([{ companyId: "co1" }, { companyId: "co2" }]);
    settingsFindUnique
      .mockResolvedValueOnce({ ...ALL_OFF, waOsReadyEnabled: true })
      .mockResolvedValueOnce({ ...ALL_OFF, waOsReadyEnabled: true });
    soFindMany
      .mockResolvedValueOnce([{ id: "os1", number: 1, readyAt: new Date("2026-06-15T10:00:00Z"), customer }])
      .mockResolvedValueOnce([{ id: "os2", number: 2, readyAt: new Date("2026-06-15T10:00:00Z"), customer }]);
    checkElig.mockResolvedValue({ eligible: true, number: "5511999999999", content: "msg" });
    logCreate.mockRejectedValue(makeP2002());

    const r = await runWhatsappAutomations(new Date("2026-06-15T12:00:00Z"), { enqueue: true });

    expect(r.companiesProcessed).toBe(2); // P2002 não interrompe ninguém
  });
});
