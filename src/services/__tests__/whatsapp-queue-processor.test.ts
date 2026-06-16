import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testa o processador da fila anti-bloqueio. Mocks: prisma, whatsapp-send
 * (checkWhatsappEligibility + sendExistingQueued) e whatsapp-business-hours.
 *
 * O claim atômico é de 2 passos (findFirst PENDING → updateMany WHERE
 * status=PENDING). Os testes provam que o WHERE status=PENDING é passado e que
 * count===0 aborta o envio — a ATOMICIDADE real depende do Postgres, não do mock
 * (documentado no plano).
 */

const isWithinBusinessHours = vi.fn();
const spDayRange = vi.fn();
vi.mock("@/lib/whatsapp-business-hours", () => ({
  isWithinBusinessHours: (...a: unknown[]) => isWithinBusinessHours(...a),
  spDayRange: (...a: unknown[]) => spDayRange(...a),
}));

const checkElig = vi.fn();
const sendExistingQueued = vi.fn();
vi.mock("@/lib/whatsapp-send", () => ({
  checkWhatsappEligibility: (...a: unknown[]) => checkElig(...a),
  sendExistingQueued: (...a: unknown[]) => sendExistingQueued(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const logFindMany = vi.fn();
const logFindFirst = vi.fn();
const logFindUnique = vi.fn();
const logUpdateMany = vi.fn();
const logUpdate = vi.fn();
const logCount = vi.fn();
const custFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappMessageLog: {
      findMany: (...a: unknown[]) => logFindMany(...a),
      findFirst: (...a: unknown[]) => logFindFirst(...a),
      findUnique: (...a: unknown[]) => logFindUnique(...a),
      updateMany: (...a: unknown[]) => logUpdateMany(...a),
      update: (...a: unknown[]) => logUpdate(...a),
      count: (...a: unknown[]) => logCount(...a),
    },
    customer: { findUnique: (...a: unknown[]) => custFindUnique(...a) },
  },
}));

import { processWhatsappQueue } from "@/services/whatsapp-queue-processor";

const NOW = new Date("2026-06-15T13:00:00Z"); // seg 10h BRT (horário comercial)

// linha PENDING padrão
const pendingRow = {
  id: "log1",
  companyId: "co1",
  customerId: "cust1",
  type: "OS_READY",
  phone: "5511999999999",
  content: "Seu óculos está pronto",
  referenceId: "os1",
  periodKey: "2026-06-15",
};

describe("processWhatsappQueue", () => {
  beforeEach(() => {
    isWithinBusinessHours.mockReset().mockReturnValue(true);
    spDayRange.mockReset().mockReturnValue({
      start: new Date("2026-06-15T03:00:00Z"),
      end: new Date("2026-06-16T03:00:00Z"),
    });
    checkElig.mockReset().mockResolvedValue({ eligible: true, number: "5511999999999", content: "Seu óculos está pronto" });
    sendExistingQueued.mockReset().mockResolvedValue("SENT");

    // óticas com PENDING (distinct companyId)
    logFindMany.mockReset().mockResolvedValue([{ companyId: "co1" }]);
    // teto do dia (count SENT) e pendingRestantes (count final)
    logCount.mockReset().mockResolvedValue(0);
    // alvo do claim
    logFindFirst.mockReset().mockResolvedValue(pendingRow);
    // claim bem-sucedido (1 linha)
    logUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    // relê linha travada
    logFindUnique.mockReset().mockResolvedValue(pendingRow);
    logUpdate.mockReset().mockResolvedValue({ id: "log1" });
    custFindUnique.mockReset().mockResolvedValue({ id: "cust1", name: "João", phone: "5511999999999", acceptsMarketing: true });
  });

  it("fora do horário comercial → não faz claim, retorna skippedOutOfHours", async () => {
    isWithinBusinessHours.mockReturnValue(false);
    const r = await processWhatsappQueue(NOW);
    expect(r.skippedOutOfHours).toBe(true);
    expect(logFindFirst).not.toHaveBeenCalled();
    expect(logUpdateMany).not.toHaveBeenCalled();
    expect(sendExistingQueued).not.toHaveBeenCalled();
  });

  it("recupera PROCESSING preso → PENDING no início, mirando processingAt (não createdAt)", async () => {
    await processWhatsappQueue(NOW);
    // primeiro updateMany é a recuperação de PROCESSING preso
    const recovery = logUpdateMany.mock.calls[0][0];
    expect(recovery.where.status).toBe("PROCESSING");
    expect(recovery.data.status).toBe("PENDING");
    // HIGH-fix: stale mira processingAt (hora do claim), NÃO createdAt — senão
    // linhas que só esperaram muito na fila seriam recuperadas mid-envio.
    expect(recovery.where.processingAt).toBeDefined();
    expect(recovery.where.createdAt).toBeUndefined();
  });

  it("o claim seta processingAt = now (p/ a recuperação de stale funcionar)", async () => {
    await processWhatsappQueue(NOW);
    const claim = logUpdateMany.mock.calls[1][0]; // 2º updateMany = claim
    expect(claim.data.status).toBe("PROCESSING");
    expect(claim.data.processingAt).toEqual(NOW);
  });

  it("teto diário atingido → pula a ótica (sem claim, sem envio)", async () => {
    // count: 1ª chamada = SENT do dia (>= TETO), depois pendingRestantes
    logCount.mockResolvedValueOnce(50).mockResolvedValue(3);
    const r = await processWhatsappQueue(NOW);
    expect(logFindFirst).not.toHaveBeenCalled();
    expect(sendExistingQueued).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("claim atômico: updateMany com WHERE status=PENDING; se count=0, não envia", async () => {
    logUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // recuperação de stale (irrelevante)
      .mockResolvedValueOnce({ count: 0 }); // claim perdido (outra invocação pegou)
    const r = await processWhatsappQueue(NOW);
    // o claim (2º updateMany) tem WHERE status=PENDING
    const claim = logUpdateMany.mock.calls[1][0];
    expect(claim.where.status).toBe("PENDING");
    expect(claim.where.id).toBe("log1");
    expect(claim.data.status).toBe("PROCESSING");
    expect(sendExistingQueued).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("reavalia: inelegível → marca SKIPPED, não envia, incrementa skipped", async () => {
    checkElig.mockResolvedValue({ eligible: false, skipReason: "no_consent", content: "x" });
    const r = await processWhatsappQueue(NOW);
    expect(sendExistingQueued).not.toHaveBeenCalled();
    expect(logUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "log1" },
      data: expect.objectContaining({ status: "SKIPPED", skipReason: "no_consent" }),
    }));
    expect(r.skipped).toBe(1);
  });

  it("elegível → chama sendExistingQueued 1×; SENT incrementa sent", async () => {
    const r = await processWhatsappQueue(NOW);
    expect(sendExistingQueued).toHaveBeenCalledTimes(1);
    expect(sendExistingQueued).toHaveBeenCalledWith(expect.objectContaining({
      logId: "log1",
      companyId: "co1",
      number: "5511999999999",
    }));
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(0);
  });

  it("envio FAILED incrementa failed", async () => {
    sendExistingQueued.mockResolvedValue("FAILED");
    const r = await processWhatsappQueue(NOW);
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(0);
  });

  it("reavaliação NÃO deve deduplicar contra a própria linha (periodKey null)", async () => {
    await processWhatsappQueue(NOW);
    // checkElig recebe um input com periodKey null → pula o dedupe que acharia
    // a própria linha PROCESSING e marcaria already_sent indevidamente.
    const arg = checkElig.mock.calls[0][0];
    expect(arg.periodKey).toBeNull();
  });

  it("pendingRestantes: reflete a contagem final de PENDING", async () => {
    // count: 1ª=teto SENT (0), 2ª=pendingRestantes (7)
    logCount.mockResolvedValueOnce(0).mockResolvedValue(7);
    const r = await processWhatsappQueue(NOW);
    expect(r.pendingRestantes).toBe(7);
  });

  it("options.companyId → filtra a query de óticas só por essa", async () => {
    await processWhatsappQueue(NOW, { companyId: "co1" });
    // a query de óticas com PENDING inclui companyId no where
    const call = logFindMany.mock.calls.find((c) => c[0]?.where?.status === "PENDING");
    expect(call).toBeTruthy();
    expect(call![0].where.companyId).toBe("co1");
  });
});
