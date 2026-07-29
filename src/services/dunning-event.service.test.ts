import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordDunningNotice, hasDispatchedNotice, noticeActionFor } from "./dunning-event.service";

const create = vi.fn();
const findFirst = vi.fn();
const db = { dunningEvent: { create, findFirst } } as never;

beforeEach(() => {
  create.mockReset();
  findFirst.mockReset();
  create.mockResolvedValue({ id: "evt_1" });
});

describe("noticeActionFor", () => {
  it("marcos 3 e 7 são lembrete; o 14 é o último aviso antes de restringir", () => {
    expect(noticeActionFor(3)).toBe("REMINDER_EMAIL");
    expect(noticeActionFor(7)).toBe("REMINDER_EMAIL");
    expect(noticeActionFor(14)).toBe("WARNING_EMAIL");
  });
});

describe("recordDunningNotice", () => {
  it("aviso entregue → grava SENT com sentAt", async () => {
    await recordDunningNotice(
      { companyId: "c1", invoiceId: "i1", stage: 3, delivered: true },
      { db }
    );
    const data = create.mock.calls[0][0].data;
    expect(data.status).toBe("SENT");
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(data.companyId).toBe("c1");
  });

  it("aviso NÃO entregue → grava FAILED, sem sentAt", async () => {
    await recordDunningNotice(
      { companyId: "c1", invoiceId: "i1", stage: 3, delivered: false, error: "smtp caiu" },
      { db }
    );
    const data = create.mock.calls[0][0].data;
    expect(data.status).toBe("FAILED");
    expect(data.sentAt).toBeNull();
    expect(data.errorDetail).toBe("smtp caiu");
  });

  it("aviso suprimido → grava SKIPPED (não é falha, mas também não avisou)", async () => {
    await recordDunningNotice(
      { companyId: "c1", invoiceId: "i1", stage: 3, delivered: false, skipped: true, error: "testMode" },
      { db }
    );
    expect(create.mock.calls[0][0].data.status).toBe("SKIPPED");
  });

  it("falha ao gravar a trilha NÃO derruba o cron", async () => {
    create.mockRejectedValue(new Error("banco fora"));
    await expect(
      recordDunningNotice({ companyId: "c1", invoiceId: "i1", stage: 3, delivered: true }, { db })
    ).resolves.toBe(false);
  });
});

describe("hasDispatchedNotice", () => {
  it("há evento SENT do marco → true", async () => {
    findFirst.mockResolvedValue({ id: "evt_1" });
    expect(await hasDispatchedNotice("c1", 14, { db })).toBe(true);
  });

  it("nenhum evento despachado → false (não pode restringir)", async () => {
    findFirst.mockResolvedValue(null);
    expect(await hasDispatchedNotice("c1", 14, { db })).toBe(false);
  });

  it("consulta exige status despachado, não qualquer evento", async () => {
    findFirst.mockResolvedValue(null);
    await hasDispatchedNotice("c1", 14, { db });
    const where = findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["SENT", "DELIVERED"] });
    expect(where.companyId).toBe("c1");
  });

  it("consulta o aviso DO MARCO pedido, não qualquer aviso", async () => {
    // Sem isto, um lembrete do dia 3 autorizaria a restrição do dia 14 —
    // I3 viraria "foi avisado alguma vez".
    findFirst.mockResolvedValue(null);
    await hasDispatchedNotice("c1", 14, { db });
    expect(findFirst.mock.calls[0][0].where.action).toBe("WARNING_EMAIL");

    findFirst.mockClear();
    await hasDispatchedNotice("c1", 3, { db });
    expect(findFirst.mock.calls[0][0].where.action).toBe("REMINDER_EMAIL");
  });

  it("erro de leitura → false (fail-closed: na dúvida, não restringe)", async () => {
    findFirst.mockRejectedValue(new Error("banco fora"));
    expect(await hasDispatchedNotice("c1", 14, { db })).toBe(false);
  });
});
