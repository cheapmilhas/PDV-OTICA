import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemEvent: { findMany: vi.fn(), updateMany: vi.fn() },
    emailQueue: { create: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock("@/services/saas-email-config.service", () => ({ getResendConfig: vi.fn() }));
vi.mock("@/services/email-queue.service", () => ({ processEmailQueue: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getResendConfig } from "@/services/saas-email-config.service";
import { maybeSendAlert } from "./system-alert.service";

const findMany = prisma.systemEvent.findMany as unknown as ReturnType<typeof vi.fn>;
const updateMany = prisma.systemEvent.updateMany as unknown as ReturnType<typeof vi.fn>;
const queueCreate = prisma.emailQueue.create as unknown as ReturnType<typeof vi.fn>;
const resendCfg = getResendConfig as unknown as ReturnType<typeof vi.fn>;

const ev = (over: Partial<{ id: string; title: string; detail: string | null; severity: string }> = {}) => ({
  id: over.id ?? "e1",
  title: over.title ?? "Banco caiu",
  detail: over.detail ?? null,
  severity: over.severity ?? "critical",
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SYSTEM_ALERT_EMAIL;
  resendCfg.mockResolvedValue({ apiKey: "k", from: "Vis <no-reply@vis.app.br>", replyTo: "dono@vis.app.br", baseUrl: "https://api.resend.com" });
  queueCreate.mockResolvedValue({ id: "q1" });
  updateMany.mockResolvedValue({ count: 1 });
});

describe("maybeSendAlert", () => {
  it("sem incidentes abertos não-alertados → não envia", async () => {
    findMany.mockResolvedValue([]);
    const r = await maybeSendAlert("crítico");
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("no_open_unalerted");
    expect(queueCreate).not.toHaveBeenCalled();
  });

  it("filtra por status=open, alertedAt=null e severity in warning/critical", async () => {
    findMany.mockResolvedValue([ev()]);
    await maybeSendAlert("crítico");
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe("open");
    expect(where.alertedAt).toBeNull();
    expect(where.severity).toEqual({ in: ["warning", "critical"] });
  });

  it("enfileira e-mail system-alert e marca alertedAt (idempotência)", async () => {
    findMany.mockResolvedValue([ev({ id: "e1" }), ev({ id: "e2", title: "Cron morto" })]);
    const r = await maybeSendAlert("crítico");
    expect(r.sent).toBe(true);
    expect(r.alertedEventIds).toEqual(["e1", "e2"]);
    expect(queueCreate.mock.calls[0][0].data.template).toBe("system-alert");
    // marca os DOIS eventos como alertados
    expect(updateMany.mock.calls[0][0].where.id).toEqual({ in: ["e1", "e2"] });
    expect(updateMany.mock.calls[0][0].data.alertedAt).toBeInstanceOf(Date);
  });

  it("usa SYSTEM_ALERT_EMAIL quando presente (prioridade sobre config)", async () => {
    process.env.SYSTEM_ALERT_EMAIL = "alertas@empresa.com";
    findMany.mockResolvedValue([ev()]);
    await maybeSendAlert("crítico");
    expect(queueCreate.mock.calls[0][0].data.to).toBe("alertas@empresa.com");
    expect(resendCfg).not.toHaveBeenCalled();
  });

  it("cai no replyTo da config quando não há env dedicada", async () => {
    findMany.mockResolvedValue([ev()]);
    await maybeSendAlert("crítico");
    expect(queueCreate.mock.calls[0][0].data.to).toBe("dono@vis.app.br");
  });

  it("sem destinatário e sem config → não envia, não marca", async () => {
    resendCfg.mockRejectedValue(new Error("no email config"));
    findMany.mockResolvedValue([ev()]);
    const r = await maybeSendAlert("crítico");
    expect(r.sent).toBe(false);
    expect(r.reason).toBe("no_recipient");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("assunto no singular quando é 1 incidente", async () => {
    findMany.mockResolvedValue([ev({ title: "Banco caiu" })]);
    await maybeSendAlert("crítico");
    expect(queueCreate.mock.calls[0][0].data.subject).toContain("Banco caiu");
  });
});
