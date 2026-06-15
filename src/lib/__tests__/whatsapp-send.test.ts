import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Testes do serviço central de envio (Fase B2). Mocks: prisma, evolution, flag.
 * Cobre cada caminho de SKIP, o envio feliz (SENT) e o FAILED — e confirma que
 * o serviço NUNCA lança e SEMPRE registra no outbox.
 */

const flagMock = vi.fn();
vi.mock("@/lib/whatsapp-flag", () => ({
  isWhatsappEnabledForCompany: (...a: unknown[]) => flagMock(...a),
}));

const connFindUnique = vi.fn();
const logFindFirst = vi.fn();
const logCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappConnection: { findUnique: (...a: unknown[]) => connFindUnique(...a) },
    whatsappMessageLog: {
      findFirst: (...a: unknown[]) => logFindFirst(...a),
      create: (...a: unknown[]) => logCreate(...a),
    },
  },
}));

const sendText = vi.fn();
vi.mock("@/lib/evolution", () => ({
  evolution: { sendText: (...a: unknown[]) => sendText(...a) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

import { sendWhatsappMessage } from "@/lib/whatsapp-send";

const baseCustomer = {
  id: "cust1",
  name: "João",
  phone: "(11) 99999-9999",
  acceptsMarketing: true,
};

describe("sendWhatsappMessage", () => {
  beforeEach(() => {
    flagMock.mockReset().mockReturnValue(true);
    connFindUnique.mockReset().mockResolvedValue({ status: "CONNECTED" });
    logFindFirst.mockReset().mockResolvedValue(null);
    logCreate.mockReset().mockImplementation(async ({ data }: any) => ({ id: "log1", ...data }));
    sendText.mockReset().mockResolvedValue({ key: { id: "EVO1" } });
  });
  afterEach(() => vi.clearAllMocks());

  it("SKIP feature_off quando o flag está desligado", async () => {
    flagMock.mockReturnValue(false);
    const r = await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "SHARE_LINK", template: "oi",
    });
    expect(r.status).toBe("SKIPPED");
    expect(r.skipReason).toBe("feature_off");
    expect(sendText).not.toHaveBeenCalled();
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "SKIPPED", skipReason: "feature_off" }),
    }));
  });

  it("SKIP not_connected quando a conexão não está CONNECTED", async () => {
    connFindUnique.mockResolvedValue({ status: "DISCONNECTED" });
    const r = await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "OS_READY", template: "oi",
    });
    expect(r.skipReason).toBe("not_connected");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("SKIP not_connected quando não há registro de conexão", async () => {
    connFindUnique.mockResolvedValue(null);
    const r = await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "SHARE_LINK", template: "oi",
    });
    expect(r.skipReason).toBe("not_connected");
  });

  it("SKIP no_consent para tipo de marketing sem acceptsMarketing", async () => {
    const r = await sendWhatsappMessage({
      companyId: "co1",
      customer: { ...baseCustomer, acceptsMarketing: false },
      type: "BIRTHDAY", // marketing → exige consentimento
      template: "Parabéns!",
    });
    expect(r.skipReason).toBe("no_consent");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("tipo transacional (OS_READY) NÃO exige consentimento", async () => {
    const r = await sendWhatsappMessage({
      companyId: "co1",
      customer: { ...baseCustomer, acceptsMarketing: false },
      type: "OS_READY",
      template: "Sua OS está pronta",
    });
    expect(r.status).toBe("SENT");
    expect(sendText).toHaveBeenCalled();
  });

  it("SKIP no_phone quando o telefone não normaliza", async () => {
    const r = await sendWhatsappMessage({
      companyId: "co1",
      customer: { ...baseCustomer, phone: "123" },
      type: "SHARE_LINK",
      template: "oi",
    });
    expect(r.skipReason).toBe("no_phone");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("SKIP already_sent quando há SENT com a mesma chave (periodKey preenchido)", async () => {
    logFindFirst.mockResolvedValue({ id: "prev" });
    const r = await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "BIRTHDAY",
      template: "oi", referenceId: "cust1", periodKey: "2026-06-15",
    });
    expect(r.skipReason).toBe("already_sent");
    expect(sendText).not.toHaveBeenCalled();
  });

  it("envio manual (periodKey null) NÃO checa idempotência", async () => {
    await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "SHARE_LINK",
      template: "oi", referenceId: "sale1", periodKey: null,
    });
    expect(logFindFirst).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalled();
  });

  it("SENT: renderiza placeholders, normaliza telefone, registra outbox", async () => {
    const r = await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "POST_SALE",
      transactional: true,
      template: "Olá {cliente}, obrigado!",
      variables: { cliente: "João" },
      referenceId: "sale9",
    });
    expect(r.status).toBe("SENT");
    expect(r.evolutionMessageId).toBe("EVO1");
    // número normalizado para 55+DDD+numero
    expect(sendText).toHaveBeenCalledWith("vis_co1", "5511999999999", "Olá João, obrigado!");
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "SENT", phone: "5511999999999", content: "Olá João, obrigado!",
        evolutionMessageId: "EVO1", referenceId: "sale9",
      }),
    }));
  });

  it("FAILED quando a Evolution lança — registra FAILED e NÃO propaga exceção", async () => {
    sendText.mockRejectedValue(new Error("network down"));
    const r = await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "SHARE_LINK", template: "oi",
    });
    expect(r.status).toBe("FAILED");
    expect(r.error).toContain("network down");
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "FAILED" }),
    }));
  });

  it("texto pronto (sem variables) é enviado verbatim", async () => {
    await sendWhatsappMessage({
      companyId: "co1", customer: baseCustomer, type: "SHARE_LINK",
      template: "Texto já pronto {cliente}", // sem variables → não substitui
    });
    expect(sendText).toHaveBeenCalledWith("vis_co1", "5511999999999", "Texto já pronto {cliente}");
  });
});
