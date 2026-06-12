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

it("re-busca pixCode quando falta: paymentUrl + asaasPaymentId + pixCode null → chama pixQrCode e grava via update", async () => {
  const inv = { id:"i1", total:500, paymentUrl:"https://x/i/1", pixCode:null, asaasPaymentId:"pay_1", subscription:{ id:"s1" } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: {
    create: vi.fn(),
    pixQrCode: vi.fn().mockResolvedValue({ payload:"PIXNEW" }),
  } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() });
  expect(asaasClient.payments.pixQrCode).toHaveBeenCalledWith("pay_1");
  const updateArg = prismaClient.invoice.update.mock.calls[0][0];
  expect(updateArg.where.id).toBe("i1");
  expect(updateArg.data.pixCode).toBe("PIXNEW");
  expect(out.pixCode).toBe("PIXNEW");
  expect(asaasClient.payments.create).not.toHaveBeenCalled();
});

it("no-op puro quando já tem pixCode: NÃO chama pixQrCode nem update", async () => {
  const inv = { id:"i1", total:500, paymentUrl:"https://x/i/1", pixCode:"PIXEXISTING", asaasPaymentId:"pay_1", subscription:{ id:"s1" } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: { create: vi.fn(), pixQrCode: vi.fn() } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() });
  expect(asaasClient.payments.pixQrCode).not.toHaveBeenCalled();
  expect(prismaClient.invoice.update).not.toHaveBeenCalled();
  expect(out.pixCode).toBe("PIXEXISTING");
});

it("PIX ainda indisponível: pixQrCode lança → retorna invoice sem update e sem propagar erro", async () => {
  const inv = { id:"i1", total:500, paymentUrl:"https://x/i/1", pixCode:null, asaasPaymentId:"pay_1", subscription:{ id:"s1" } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: {
    create: vi.fn(),
    pixQrCode: vi.fn().mockRejectedValue(new Error("PIX QR ainda não pronto")),
  } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() });
  expect(asaasClient.payments.pixQrCode).toHaveBeenCalledWith("pay_1");
  expect(prismaClient.invoice.update).not.toHaveBeenCalled();
  expect(out.paymentUrl).toBe("https://x/i/1");
  expect(out.pixCode).toBe(null);
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
  const inv = { id:"i1", total:500, paymentUrl:null, billingType:null, description:"Mensalidade", dueDate:new Date("2026-07-10"), subscription:{ id:"s1", asaasSubscriptionId:null, asaasCustomerId:"cus_1", companyId:"c1" } };
  const prismaClient = mkPrisma([inv]);
  const asaasClient = { payments: {
    create: vi.fn().mockResolvedValue({ id:"pay_1", invoiceUrl:"https://x/i/1", bankSlipUrl:"https://x/b/1", billingType:"PIX" }),
    pixQrCode: vi.fn().mockResolvedValue({ payload:"PIXCC" }),
  } } as any;
  const out = await ensureInvoiceCharge("i1", { prismaClient, asaasClient, syncFn: vi.fn() });
  expect(asaasClient.payments.create).toHaveBeenCalled();
  const [callArg, idempotencyKey] = asaasClient.payments.create.mock.calls[0];
  expect(callArg.customer).toBe("cus_1");
  expect(callArg.value).toBe(5); // 500 cents → R$5
  expect(callArg.description).toBe("Mensalidade");
  expect(callArg.notificationDisabled).toBe(true);
  // money path: idempotencyKey impede cobrança duplicada em retry
  expect(idempotencyKey).toBe("invoice:i1");
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
