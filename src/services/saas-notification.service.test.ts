import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client"; // necessário para o teste de idempotência (P2002)

// Funções de mock declaradas ANTES do vi.mock (evita erro de hoisting)
const configUpsert = vi.fn();
const companyFindUnique = vi.fn();
const userFindFirst = vi.fn();
const logCreate = vi.fn();
const logUpdate = vi.fn();
const queueCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    saasEmailConfig: { upsert: (...a: unknown[]) => configUpsert(...a) },
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    saasEmailLog: {
      create: (...a: unknown[]) => logCreate(...a),
      update: (...a: unknown[]) => logUpdate(...a),
    },
    emailQueue: { create: (...a: unknown[]) => queueCreate(...a) },
  },
}));

const createCompanyNotification = vi.fn();
vi.mock("@/services/company-notification.service", () => ({
  createCompanyNotification: (...a: unknown[]) => createCompanyNotification(...a),
}));

import { notifyCompany } from "./saas-notification.service";

const fullConfig = {
  masterEnabled: true,
  testMode: false,
  testEmail: null,
  welcomeEnabled: true,
  invoiceOverdueEnabled: true,
};

beforeEach(() => {
  configUpsert.mockReset();
  companyFindUnique.mockReset();
  userFindFirst.mockReset();
  logCreate.mockReset();
  logUpdate.mockReset();
  queueCreate.mockReset();
  createCompanyNotification.mockReset().mockResolvedValue(true);
  configUpsert.mockResolvedValue(fullConfig);
  companyFindUnique.mockResolvedValue({ billingEmail: "bill@x.com", email: null });
  logCreate.mockResolvedValue({ id: "log-1" });
  queueCreate.mockResolvedValue({ id: "q-1" });
});

describe("notifyCompany", () => {
  it("master desligado → SKIPPED, não enfileira", async () => {
    configUpsert.mockResolvedValue({ ...fullConfig, masterEnabled: false });
    const r = await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome" });
    expect(r.status).toBe("SKIPPED");
    expect(queueCreate).not.toHaveBeenCalled();
  });

  it("tipo desligado → SKIPPED", async () => {
    configUpsert.mockResolvedValue({ ...fullConfig, welcomeEnabled: false });
    const r = await notifyCompany("c1", "WELCOME" as never, {}, { periodKey: "welcome" });
    expect(r.status).toBe("SKIPPED");
    expect(r.reason).toBe("type_off");
  });

  it("resolve billingEmail → email → dono (fallback)", async () => {
    companyFindUnique.mockResolvedValue({ billingEmail: null, email: null });
    userFindFirst.mockResolvedValue({ email: "dono@x.com" });
    await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome", channels: ["email"] });
    // `data` aqui é o WRAPPER do Prisma create; `data.to` é a COLUNA `to` da EmailQueue
    // (NÃO o payload do template). A chamada real é
    //   prisma.emailQueue.create({ data: { to, subject, template, data: payload } })
    expect(queueCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: "dono@x.com", template: "saas-welcome" }) })
    );
  });

  it("sem email nenhum → SKIPPED no_recipient", async () => {
    companyFindUnique.mockResolvedValue({ billingEmail: null, email: null });
    userFindFirst.mockResolvedValue(null);
    const r = await notifyCompany("c1", "WELCOME" as never, {}, { periodKey: "welcome" });
    expect(r.reason).toBe("no_recipient");
  });

  it("testMode → manda pro testEmail, não pro cliente", async () => {
    configUpsert.mockResolvedValue({ ...fullConfig, testMode: true, testEmail: "dono@vis.com" });
    await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome", channels: ["email"] });
    expect(queueCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ to: "dono@vis.com" }) })
    );
  });

  it("idempotência: P2002 no log → SKIPPED duplicate, não enfileira", async () => {
    // IMPORTANTE: rejeitar com a CLASSE real de erro do Prisma — a implementação
    // checa `instanceof Prisma.PrismaClientKnownRequestError`; um objeto plano
    // `{ code: "P2002" }` NÃO passaria nesse instanceof e cairia no fail-silent
    // (FAILED), quebrando este teste. Importar `Prisma` no topo do arquivo de teste:
    //   import { Prisma } from "@prisma/client";
    const dupErr = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test",
    });
    logCreate.mockRejectedValue(dupErr);
    const r = await notifyCompany("c1", "INVOICE_OVERDUE" as never, {}, { periodKey: "stage:7", channels: ["email"] });
    expect(r.status).toBe("SKIPPED");
    expect(r.reason).toBe("duplicate");
    expect(queueCreate).not.toHaveBeenCalled();
  });

  it("channels ['email'] não cria in-app", async () => {
    await notifyCompany("c1", "INVOICE_OVERDUE" as never, {}, { periodKey: "stage:7", channels: ["email"] });
    expect(createCompanyNotification).not.toHaveBeenCalled();
  });

  it("channels padrão cria email + in-app", async () => {
    await notifyCompany(
      "c1",
      "PAYMENT_CONFIRMED" as never,
      { name: "J", amountLabel: "R$ 1" },
      { periodKey: "pay:1", inapp: { title: "Pago", message: "ok" } }
    );
    expect(queueCreate).toHaveBeenCalled();
    expect(createCompanyNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "c1",
        userId: null,
        type: "BILLING",
        title: "Pago",
        message: "ok",
      })
    );
  });

  it("fail-silent: erro inesperado não propaga", async () => {
    queueCreate.mockRejectedValue(new Error("boom"));
    const r = await notifyCompany("c1", "WELCOME" as never, { name: "J", loginUrl: "https://a" }, { periodKey: "welcome", channels: ["email"] });
    expect(r.status).toBe("FAILED");
  });
});
