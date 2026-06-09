import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailQueue: {
      findMany: (...a: unknown[]) => findMany(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));

const sendEmail = vi.fn();
vi.mock("@/lib/emails/resend", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const renderEmailTemplate = vi.fn();
vi.mock("@/lib/emails/templates", () => ({
  renderEmailTemplate: (...a: unknown[]) => renderEmailTemplate(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { processEmailQueue } from "./email-queue.service";

function email(over: Partial<{ id: string; attempts: number }> = {}) {
  return {
    id: over.id ?? "e1",
    to: "dest@x.com",
    subject: "Assunto",
    template: "invite",
    data: { name: "Ana" },
    status: "PENDING",
    attempts: over.attempts ?? 0,
  };
}

describe("processEmailQueue", () => {
  beforeEach(() => {
    findMany.mockReset();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    update.mockReset().mockResolvedValue({});
    sendEmail.mockReset().mockResolvedValue({ id: "resend-1" });
    renderEmailTemplate.mockReset().mockReturnValue({ html: "<p>oi</p>", text: "oi" });
  });

  it("envia e marca como SENT em caso de sucesso", async () => {
    findMany.mockResolvedValue([email()]);
    const r = await processEmailQueue(10);

    expect(r).toMatchObject({ picked: 1, sent: 1, failed: 0, retryable: 0, skipped: 0 });
    expect(sendEmail).toHaveBeenCalledOnce();
    // idempotency key derivada do id da fila
    expect(sendEmail.mock.calls[0][0].idempotencyKey).toBe("email-queue/e1");
    const finalUpdate = update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe("SENT");
    expect(finalUpdate.data.sentAt).toBeInstanceOf(Date);
  });

  it("pula (skipped) quando o lock otimista não pega a linha", async () => {
    findMany.mockResolvedValue([email()]);
    updateMany.mockResolvedValue({ count: 0 }); // outro worker pegou

    const r = await processEmailQueue(10);

    expect(r.skipped).toBe(1);
    expect(r.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("falha não-final volta para PENDING (retryable)", async () => {
    findMany.mockResolvedValue([email({ attempts: 0 })]); // attempt vira 1, max 3
    sendEmail.mockRejectedValue(new Error("Resend 500"));

    const r = await processEmailQueue(10);

    expect(r.retryable).toBe(1);
    expect(r.failed).toBe(0);
    const finalUpdate = update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe("PENDING");
    expect(finalUpdate.data.lastError).toContain("Resend 500");
  });

  it("falha na última tentativa marca como FAILED", async () => {
    findMany.mockResolvedValue([email({ attempts: 2 })]); // attempt vira 3 == max
    sendEmail.mockRejectedValue(new Error("Resend 500"));

    const r = await processEmailQueue(10);

    expect(r.failed).toBe(1);
    expect(r.retryable).toBe(0);
    const finalUpdate = update.mock.calls.at(-1)![0];
    expect(finalUpdate.data.status).toBe("FAILED");
  });

  it("filtra apenas PENDING abaixo do maxAttempts no findMany", async () => {
    findMany.mockResolvedValue([]);
    await processEmailQueue(10);

    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe("PENDING");
    expect(where.attempts).toEqual({ lt: 3 });
  });
});
