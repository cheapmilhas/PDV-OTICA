import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Migração do share-link (B2): a geração do link DEVE continuar funcionando; o
 * envio por WhatsApp passou a usar o motor central sendWhatsappMessage (type
 * SHARE_LINK, transacional) e só sai pra ótica habilitada/conectada.
 */

process.env.AUTH_SECRET = "test-secret";
process.env.NEXT_PUBLIC_APP_URL = "https://app.test";

vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
  getCompanyId: vi.fn().mockResolvedValue("co1"),
}));

const saleFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { sale: { findFirst: (...a: unknown[]) => saleFindFirst(...a) } },
}));

const sendWhatsappMessage = vi.fn();
vi.mock("@/lib/whatsapp-send", () => ({
  sendWhatsappMessage: (...a: unknown[]) => sendWhatsappMessage(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { POST } from "./route";

const SALE = {
  id: "sale1",
  customerId: "cust1",
  total: 199.9,
  customer: { name: "João", phone: "(11) 99999-9999", acceptsMarketing: true },
  company: { name: "Ótica Teste", phone: "1133334444" },
};

function makeReq(body?: unknown) {
  return new Request("https://app.test/api/sales/sale1/share-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = { params: Promise.resolve({ id: "sale1" }) };

describe("POST /api/sales/[id]/share-link (B2)", () => {
  beforeEach(() => {
    saleFindFirst.mockReset().mockResolvedValue(SALE);
    sendWhatsappMessage.mockReset().mockResolvedValue({ status: "SENT" });
  });

  it("gera o link mesmo SEM enviar WhatsApp (sem body)", async () => {
    const res = await POST(makeReq(), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.receiptUrl).toMatch(/^https:\/\/app\.test\/recibo\//);
    expect(json.data.whatsappSent).toBe(false);
    expect(sendWhatsappMessage).not.toHaveBeenCalled();
  });

  it("com sendWhatsApp:true → chama o motor com type SHARE_LINK transacional", async () => {
    const res = await POST(makeReq({ sendWhatsApp: true }), ctx);
    const json = await res.json();
    expect(json.data.receiptUrl).toBeTruthy(); // link continua
    expect(json.data.whatsappSent).toBe(true);
    expect(sendWhatsappMessage).toHaveBeenCalledTimes(1);
    const arg = sendWhatsappMessage.mock.calls[0][0];
    expect(arg.companyId).toBe("co1");
    expect(arg.type).toBe("SHARE_LINK");
    expect(arg.transactional).toBe(true);
    expect(arg.referenceId).toBe("sale1");
    expect(arg.customer.id).toBe("cust1");
    expect(arg.template).toContain("Veja seu comprovante"); // template de recibo
  });

  it("se o envio for SKIPPED (ótica não conectada), o link ainda volta e whatsappSent=false", async () => {
    sendWhatsappMessage.mockResolvedValue({ status: "SKIPPED", skipReason: "not_connected" });
    const res = await POST(makeReq({ sendWhatsApp: true }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.receiptUrl).toBeTruthy();
    expect(json.data.whatsappSent).toBe(false);
  });

  it("404 quando a venda não existe", async () => {
    saleFindFirst.mockResolvedValue(null);
    const res = await POST(makeReq({ sendWhatsApp: true }), ctx);
    expect(res.status).toBe(404);
    expect(sendWhatsappMessage).not.toHaveBeenCalled();
  });
});
