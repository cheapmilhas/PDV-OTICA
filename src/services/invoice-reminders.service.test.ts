import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/saas-email-config.service", () => ({ getSaasEmailConfig: vi.fn() }));
vi.mock("@/services/invoice-sync.service", () => ({ syncInvoicesForSubscription: vi.fn() }));
vi.mock("@/services/saas-notification.service", () => ({ notifyCompany: vi.fn().mockResolvedValue({ status: "SENT" }) }));
vi.mock("@/services/billing-generation-phase.service", () => ({
  runGenerationPhase: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  subscription: { findMany: vi.fn() },
  invoice: { findMany: vi.fn(), update: vi.fn() },
} }));

import { runInvoiceReminders } from "./invoice-reminders.service";
import { getSaasEmailConfig } from "@/services/saas-email-config.service";
import { syncInvoicesForSubscription } from "@/services/invoice-sync.service";
import { notifyCompany } from "@/services/saas-notification.service";
import { runGenerationPhase } from "@/services/billing-generation-phase.service";
import { prisma } from "@/lib/prisma";

const NOW = new Date("2026-07-08T12:00:00Z");

const GERACAO_VAZIA = {
  avaliadas: 0,
  criadas: 0,
  emitidas: 0,
  quitadas: 0,
  semAncora: 0,
  nadaAFazer: 0,
  falhas: 0,
  porMotivo: {},
  skipped: null,
  descontinuidades: 0,
  sombra: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (runGenerationPhase as any).mockResolvedValue(GERACAO_VAZIA);
});

it("gate: invoiceGenerationEnabled OFF → não toca Asaas", async () => {
  (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: false });
  const out = await runInvoiceReminders({ now: NOW });
  expect(out.skipped).toBe("generation_disabled");
  expect(syncInvoicesForSubscription).not.toHaveBeenCalled();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 1 — a POSIÇÃO da fase de geração é o que esta task decide
// ═══════════════════════════════════════════════════════════════════════════════

describe("posicionamento da fase de geração", () => {
  it("🔑 roda ANTES do early return de invoiceGenerationEnabled", async () => {
    // A PROVA. `invoiceGenerationEnabled` mora em `SaasEmailConfig` e é editada
    // numa tela chamada "E-mails". Se a fase de geração ficasse DEPOIS do early
    // return, o motor de cobrança inteiro ficaria refém desse botão: desligar
    // lembretes desligaria o faturamento do SaaS em silêncio.
    //
    // Com a flag FALSA — o caso em que a função sai cedo — a fase ainda tem que
    // ter rodado. É a única configuração em que a mutação "mover a fase para
    // depois do return" é detectável.
    (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: false });

    const out = await runInvoiceReminders({ now: NOW });

    expect(runGenerationPhase).toHaveBeenCalledTimes(1);
    expect(out.skipped).toBe("generation_disabled");
    // E o resultado da geração chega ao chamador mesmo na saída antecipada.
    expect(out.generation).toEqual(GERACAO_VAZIA);
  });

  it("🔑 roda ANTES até de LER a config (a config não pode gatear o motor)", async () => {
    const ordem: string[] = [];
    (runGenerationPhase as any).mockImplementation(async () => {
      ordem.push("geracao");
      return GERACAO_VAZIA;
    });
    (getSaasEmailConfig as any).mockImplementation(async () => {
      ordem.push("config");
      return { invoiceGenerationEnabled: false };
    });

    await runInvoiceReminders({ now: NOW });

    expect(ordem).toEqual(["geracao", "config"]);
  });

  it("🔑 roda ANTES das fases A e B (a fatura nova é pega no MESMO tick)", async () => {
    const ordem: string[] = [];
    (runGenerationPhase as any).mockImplementation(async () => {
      ordem.push("geracao");
      return GERACAO_VAZIA;
    });
    (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
    (prisma.subscription.findMany as any).mockImplementation(async () => {
      ordem.push("faseA");
      return [];
    });
    (prisma.invoice.findMany as any).mockImplementation(async () => {
      ordem.push("faseB");
      return [];
    });

    await runInvoiceReminders({ now: NOW });

    expect(ordem).toEqual(["geracao", "faseA", "faseB"]);
  });

  it("recebe o MESMO `now` das fases de lembrete (uma rodada, um relógio)", async () => {
    (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: false });
    await runInvoiceReminders({ now: NOW });
    expect(runGenerationPhase).toHaveBeenCalledWith(expect.objectContaining({ now: NOW }));
  });

  it("o resumo da geração é reportado à parte de `skipped` e de `errors`", async () => {
    // `skipped` descreve os LEMBRETES; a fase de geração tem as suas próprias
    // quatro chaves. Somar os dois faria "lembretes desligados" e "motor
    // desligado" virarem a mesma palavra no painel.
    (getSaasEmailConfig as any).mockResolvedValue({ invoiceGenerationEnabled: true });
    (prisma.subscription.findMany as any).mockResolvedValue([]);
    (prisma.invoice.findMany as any).mockResolvedValue([]);
    (runGenerationPhase as any).mockResolvedValue({
      ...GERACAO_VAZIA,
      semAncora: 16,
      falhas: 2,
      skipped: "generation_disabled",
    });

    const out = await runInvoiceReminders({ now: NOW });

    expect(out.skipped).toBeNull();
    expect(out.errors).toBe(0);
    expect(out.generation.semAncora).toBe(16);
    expect(out.generation.falhas).toBe(2);
    expect(out.generation.skipped).toBe("generation_disabled");
  });
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
