import { describe, it, expect, vi } from "vitest";
import { mapPaymentToInvoiceData, syncInvoicesForSubscription } from "./invoice-sync.service";
import type { AsaasPayment } from "@/lib/asaas";

function payment(over: Partial<AsaasPayment> = {}): AsaasPayment {
  return {
    id: "pay_1", customer: "cus_1", subscription: "sub_1", value: 149.9, netValue: 145,
    status: "PENDING", billingType: "BOLETO", dueDate: "2026-07-10",
    invoiceUrl: "https://asaas/i/1", bankSlipUrl: "https://asaas/b/1", ...over,
  };
}

describe("mapPaymentToInvoiceData", () => {
  it("converte valor p/ centavos, deriva período do dueDate, mapeia URLs", () => {
    const data = mapPaymentToInvoiceData(payment(), "INV-000001");
    expect(data.total).toBe(14990);
    expect(data.subtotal).toBe(14990);
    expect(data.discount).toBe(0);
    expect(data.asaasPaymentId).toBe("pay_1");
    expect(data.paymentUrl).toBe("https://asaas/i/1");
    expect(data.boletoUrl).toBe("https://asaas/b/1");
    expect(data.status).toBe("PENDING");
    expect(data.periodStart.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(data.periodEnd.toISOString().slice(0, 10)).toBe("2026-07-31");
  });
});

describe("syncInvoicesForSubscription", () => {
  const sub = { id: "sub_local", asaasSubscriptionId: "sub_1" } as any;

  it("ignora cobrança em status terminal (RECEIVED/REFUNDED) — não cria Invoice", async () => {
    const asaasClient = {
      payments: {
        list: vi.fn().mockResolvedValue({ data: [payment({ id: "p_paid", status: "RECEIVED" })], totalCount: 1, hasMore: false, limit: 100, offset: 0 }),
        pixQrCode: vi.fn(),
      },
    };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, []);
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("materializa cobrança PENDING nova com valor do Asaas e pixCode", async () => {
    const asaasClient = {
      payments: {
        list: vi.fn().mockResolvedValue({ data: [payment()], totalCount: 1, hasMore: false, limit: 100, offset: 0 }),
        pixQrCode: vi.fn().mockResolvedValue({ encodedImage: "b64", payload: "PIXCOPIACOLA", expirationDate: "2026-07-10" }),
      },
    };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, []);
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(1);
    expect(created[0].total).toBe(14990);
    expect(created[0].pixCode).toBe("PIXCOPIACOLA");
    expect(created[0].number).toMatch(/^INV-\d{6}$/);
  });

  it("idempotente — cobrança já materializada não duplica", async () => {
    const asaasClient = {
      payments: { list: vi.fn().mockResolvedValue({ data: [payment()], totalCount: 1, hasMore: false, limit: 100, offset: 0 }), pixQrCode: vi.fn() },
    };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, [{ asaasPaymentId: "pay_1" }]);
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  it("propaga erro de create que não seja P2002", async () => {
    const asaasClient = {
      payments: {
        list: vi.fn().mockResolvedValue({ data: [payment()], totalCount: 1, hasMore: false, limit: 100, offset: 0 }),
        pixQrCode: vi.fn().mockResolvedValue({ payload: "X" }),
      },
    };
    const prismaClient = {
      $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]),
      invoice: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error("db down")),
      },
    } as any;
    await expect(
      syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} })
    ).rejects.toThrow("db down");
  });

  it("paginação — 2 páginas viram todas as cobranças", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [payment({ id: "p1" })], totalCount: 2, hasMore: true, limit: 1, offset: 0 })
      .mockResolvedValueOnce({ data: [payment({ id: "p2" })], totalCount: 2, hasMore: false, limit: 1, offset: 1 });
    const asaasClient = { payments: { list, pixQrCode: vi.fn().mockResolvedValue({ payload: "X" }) } };
    const created: any[] = [];
    const prismaClient = makePrismaMock(created, []);
    const out = await syncInvoicesForSubscription(sub, { asaasClient: asaasClient as any, prismaClient, sleep: async () => {} });
    expect(out).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

function makePrismaMock(created: any[], existing: Array<{ asaasPaymentId: string }>) {
  let seq = 0;
  const exists = new Set(existing.map((e) => e.asaasPaymentId));
  return {
    $queryRaw: vi.fn().mockImplementation(async () => [{ value: ++seq }]),
    invoice: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const id = where?.subscriptionId_asaasPaymentId?.asaasPaymentId;
        return exists.has(id) ? { id: "existing" } : null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => { created.push(data); return { id: `new_${created.length}`, ...data }; }),
    },
  } as any;
}
