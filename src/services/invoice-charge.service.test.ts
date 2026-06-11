import { describe, it, expect, vi } from "vitest";
import { ensureInvoiceCharge } from "./invoice-charge.service";

function mkPrisma(invoiceSeq: any[]) {
  let i = 0;
  return {
    invoice: {
      findUnique: vi.fn().mockImplementation(async () => invoiceSeq[Math.min(i++, invoiceSeq.length-1)]),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...invoiceSeq[invoiceSeq.length-1], ...data })),
    },
  } as any;
}

it("no-op quando já tem paymentUrl", async () => {
  const inv = { id:"i1", total:500, paymentUrl:"https://x/i/1", subscription:{ id:"s1" } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: { create: vi.fn(), pixQrCode: vi.fn() } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() });
  expect(out.paymentUrl).toBe("https://x/i/1");
  expect(asaasClient.payments.create).not.toHaveBeenCalled();
});

it("sub COM asaasSubscriptionId → sincroniza e re-busca", async () => {
  const before = { id:"i1", total:500, paymentUrl:null, subscription:{ id:"s1", asaasSubscriptionId:"sub_1", asaasCustomerId:"cus_1" } };
  const after  = { id:"i1", total:500, paymentUrl:"https://x/i/1", subscription:{ id:"s1", asaasSubscriptionId:"sub_1", asaasCustomerId:"cus_1" } };
  const prismaClient = mkPrisma([before, after]);
  const syncFn = vi.fn().mockResolvedValue([]);
  const asaasClient = { payments: { create: vi.fn(), pixQrCode: vi.fn() } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn });
  expect(syncFn).toHaveBeenCalled();
  expect(out.paymentUrl).toBe("https://x/i/1");
  expect(asaasClient.payments.create).not.toHaveBeenCalled();
});

it("avulso quando sem subscription Asaas mas com customer", async () => {
  const inv = { id:"i1", total:500, paymentUrl:null, billingType:null, dueDate:new Date("2026-07-10"), subscription:{ id:"s1", asaasSubscriptionId:null, asaasCustomerId:"cus_1", companyId:"c1" } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: {
    create: vi.fn().mockResolvedValue({ id:"pay_1", invoiceUrl:"https://x/i/1", bankSlipUrl:"https://x/b/1", billingType:"PIX" }),
    pixQrCode: vi.fn().mockResolvedValue({ payload:"PIXCC" }),
  } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() });
  expect(asaasClient.payments.create).toHaveBeenCalled();
  const callArg = asaasClient.payments.create.mock.calls[0][0];
  expect(callArg.customer).toBe("cus_1");
  expect(callArg.value).toBe(5); // 500 cents → R$5
  expect(out.paymentUrl).toBe("https://x/i/1");
  expect(out.pixCode).toBe("PIXCC");
});

it("throw quando avulso sem asaasCustomerId", async () => {
  const inv = { id:"i1", total:500, paymentUrl:null, subscription:{ id:"s1", asaasSubscriptionId:null, asaasCustomerId:null } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: { create: vi.fn(), pixQrCode: vi.fn() } } as any;
  await expect(ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() })).rejects.toThrow(/customer Asaas/);
});

it("404 quando fatura não existe", async () => {
  const prismaClient = mkPrisma([null]);
  await expect(ensureInvoiceCharge("nope", { prismaClient, asaasClient:{payments:{}} as any, syncFn: vi.fn() })).rejects.toThrow(/não encontrada/);
});
