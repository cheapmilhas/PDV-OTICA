import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/saas-email-config.service", () => ({ getSaasEmailConfig: vi.fn() }));
vi.mock("@/services/invoice-sync.service", () => ({ syncInvoicesForSubscription: vi.fn() }));
vi.mock("@/services/saas-notification.service", () => ({ notifyCompany: vi.fn().mockResolvedValue({ status: "SENT" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  subscription: { findMany: vi.fn() },
  invoice: { findMany: vi.fn(), update: vi.fn() },
} }));

import { runInvoiceReminders } from "./invoice-reminders.service";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { syncInvoicesForSubscription } from "@/services/invoice-sync.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-07-08T12:00:00Z");

beforeEach(() => vi.clearAllMocks());

it("gate: invoiceGenerationEnabled OFF → não toca Asaas", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: false });
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.skipped).toBe("generation_disabled");
  expect(syncInvoicesForSubscription).not.toHaveBeenCalled();
});

it("Parte A: cobrança nova de subscription ACTIVE → email INVOICE_CREATED", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (notifyCompany as any).mockResolvedValue({ status: "SENT" });
  (prisma.subscription.findMany as any).mockResolvedValue([
    { id: "sub_local", asaasSubscriptionId: "sub_1", companyId: "c1", company: { name: "Ótica X" } },
  ]);
  (syncInvoicesForSubscription as any).mockResolvedValue([
    { id: "inv_1", total: 14990, dueDate: NOW, description: "Mensalidade Junho", paymentUrl: "https://asaas/i/1", boletoUrl: "https://asaas/b/1", pixCode: "PIX" },
  ]);
  (prisma.invoice.findMany as any).mockResolvedValue([]);
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.invoiceCreatedEmails).toBe(1);
  expect(notifyCompany).toHaveBeenCalledWith("c1", "INVOICE_CREATED", expect.objectContaining({ paymentUrl: "https://asaas/i/1", description: "Mensalidade Junho" }), expect.objectContaining({ periodKey: "invoice:inv_1:created" }));
});

it("Parte B: fatura PENDING vencendo em ≤3d → DUE_SOON + reminderSentAt", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (notifyCompany as any).mockResolvedValue({ status: "SENT" });
  (prisma.subscription.findMany as any).mockResolvedValue([]);
  (syncInvoicesForSubscription as any).mockResolvedValue([]);
  (prisma.invoice.findMany as any).mockResolvedValue([
    { id: "inv_2", total: 14990, dueDate: new Date("2026-07-10T00:00:00Z"), description: "Mensalidade Julho", paymentUrl: "https://asaas/i/2", subscription: { companyId: "c2", company: { name: "Ótica Y" } } },
  ]);
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.dueSoonEmails).toBe(1);
  expect(notifyCompany).toHaveBeenCalledWith("c2", "INVOICE_DUE_SOON", expect.objectContaining({ description: "Mensalidade Julho" }), expect.objectContaining({ periodKey: "invoice:inv_2:due_soon" }));
  expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inv_2" } }));
});

it("Parte B ignora Invoice isManual=true (cobrança avulsa)", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([]);
  (syncInvoicesForSubscription as any).mockResolvedValue([]);
  (prisma.invoice.findMany as any).mockResolvedValue([]);
  await runInvoiceReminders({ now: NOW });
  const calls = (prisma.invoice.findMany as any).mock.calls;
  const partB = calls.find((c: any) => c[0]?.where?.dueDate);
  expect(partB).toBeTruthy();
  expect(partB[0].where.isManual).toBe(false);
});

it("erro numa subscription não derruba a run", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([{ id: "s1", asaasSubscriptionId: "a1", companyId: "c1", company: { name: "X" } }]);
  (syncInvoicesForSubscription as any).mockRejectedValue(new Error("asaas down"));
  (prisma.invoice.findMany as any).mockResolvedValue([]);
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.errors).toBeGreaterThanOrEqual(1);
});

it("notifyCompany FAILED conta como erro (não como enviado)", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([
    { id: "s1", asaasSubscriptionId: "a1", companyId: "c1", company: { name: "X" } },
  ]);
  (syncInvoicesForSubscription as any).mockResolvedValue([
    { id: "inv_1", total: 14990, dueDate: NOW, paymentUrl: "https://asaas/i/1", pixCode: undefined, boletoUrl: undefined },
  ]);
  (prisma.invoice.findMany as any).mockResolvedValue([]);
  (notifyCompany as any).mockResolvedValue({ status: "FAILED" });
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.invoiceCreatedEmails).toBe(0);
  expect(out.errors).toBeGreaterThanOrEqual(1);
});

it("Invoice sem paymentUrl é ignorada (não chama notifyCompany)", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
  (prisma.subscription.findMany as any).mockResolvedValue([
    { id: "s1", asaasSubscriptionId: "a1", companyId: "c1", company: { name: "X" } },
  ]);
  (syncInvoicesForSubscription as any).mockResolvedValue([
    { id: "inv_np", total: 14990, dueDate: NOW, paymentUrl: null, pixCode: undefined, boletoUrl: undefined },
  ]);
  (prisma.invoice.findMany as any).mockResolvedValue([]);
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.invoiceCreatedEmails).toBe(0);
  expect(notifyCompany).not.toHaveBeenCalled();
});
