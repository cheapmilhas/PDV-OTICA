/**
 * Testes de `cancelInvoiceCharge`.
 *
 * 🚨 O ASAAS É MOCKADO INTEIRO (`vi.mock("@/lib/asaas")`) e a produção NÃO tem
 * sandbox. `asaas.payments.delete` faz `DELETE /payments/{id}`, que é
 * IRREVERSÍVEL — nenhum teste aqui pode alcançar a rede. O mock substitui o
 * módulo antes de qualquer import dele, então nem `getConfig()` (que exige
 * `ASAAS_API_KEY`) nem `fetch` chegam a ser tocados. Todo teste que espera
 * "não chamou o gateway" assere isso EXPLICITAMENTE com
 * `expect(asaas.payments.delete).not.toHaveBeenCalled()` — a ausência de
 * chamada é a invariante, não um efeito colateral que se assume.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
    globalAudit: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

// `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo: uma classe
// declarada em escopo normal ainda não existe quando a fábrica roda.
const { FakeAsaasError } = vi.hoisted(() => {
  class FakeAsaasError extends Error {
    constructor(
      public status: number,
      public body: unknown,
      message: string,
    ) {
      super(message);
      this.name = "AsaasError";
    }
  }
  return { FakeAsaasError };
});

vi.mock("@/lib/asaas", () => ({
  asaas: { payments: { delete: vi.fn() } },
  AsaasError: FakeAsaasError,
}));

import { cancelInvoiceCharge, CANCELABLE_INVOICE_STATUSES } from "./invoice-cancel-charge.service";
import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";

const tx = {
  invoice: { updateMany: vi.fn() },
  globalAudit: { create: vi.fn() },
};

/** Fatura viva com PIX no gateway — o caso real da Óticas Atacadão. */
const INVOICE = {
  id: "inv_1",
  number: "INV-000004",
  status: "PENDING",
  total: 14990,
  paidAt: null,
  paymentConfirmed: false,
  asaasPaymentId: "pay_7q8qptpcuqwj21yd",
  billingObligationId: null,
  subscription: { companyId: "co_1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.invoice.updateMany.mockResolvedValue({ count: 1 });
  tx.globalAudit.create.mockResolvedValue({});
  (prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx));
  (asaas.payments.delete as any).mockResolvedValue({ deleted: true, id: "pay_x" });
});

describe("cancelInvoiceCharge — guardas ANTES do gateway", () => {
  it("fatura inexistente → not_found, sem tocar no Asaas", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(null);
    const r = await cancelInvoiceCharge("inv_x", "adm_1");
    expect(r).toEqual({ ok: false, reason: "not_found", message: expect.any(String) });
    expect(asaas.payments.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("🔥 fatura PAID é RECUSADA e o gateway NUNCA é chamado", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({
      ...INVOICE,
      status: "PAID",
      paidAt: new Date(),
    });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("paid");
    // A mensagem tem que apontar o caminho certo, senão o operador fica sem saída.
    expect(r.message.toLowerCase()).toContain("estorno");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("🔥 PAID com paidAt NULO ainda é recusada (a guarda de status é própria)", async () => {
    // Este teste existe porque a mutação "remover a guarda de status PAID"
    // SOBREVIVEU: o outro teste de PAID também preenchia `paidAt`, então quem
    // barrava era a guarda de evidência, não a de status. Fatura `PAID` sem
    // `paidAt` é drift REAL neste banco (as faturas legadas e a confirmação
    // manual antiga não gravavam a data) — e é justamente o caso em que só a
    // guarda de status protege o gateway.
    (prisma.invoice.findUnique as any).mockResolvedValue({
      ...INVOICE,
      status: "PAID",
      paidAt: null,
      paymentConfirmed: false,
    });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("paid");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fatura REFUNDED é recusada sem tocar no gateway", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({ ...INVOICE, status: "REFUNDED" });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("refunded");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
  });

  it("🔥 status PENDING mas com paidAt preenchido → recusa (evidência > enum)", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({
      ...INVOICE,
      status: "PENDING",
      paidAt: new Date("2026-07-20"),
    });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("paid");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
  });

  it("🔥 status PENDING mas paymentConfirmed=true → recusa", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({
      ...INVOICE,
      paymentConfirmed: true,
    });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("paid");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
  });

  it("🔥 fatura com billingObligationId → recusa explícita nesta fatia", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({
      ...INVOICE,
      billingObligationId: "obl_1",
    });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("has_obligation");
    // A obrigação ficaria ISSUED e vencida → I1 restringiria quem não pode pagar.
    expect(r.message.toLowerCase()).toContain("obrigação");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fatura já CANCELED → sucesso idempotente sem chamar o gateway", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({ ...INVOICE, status: "CANCELED" });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r).toEqual({
      ok: true,
      outcome: "already_canceled",
      gateway: "skipped",
      asaasPaymentId: INVOICE.asaasPaymentId,
    });
    expect(asaas.payments.delete).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("status fora do conjunto cancelável → invalid_status", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({ ...INVOICE, status: "ESTRANHO" });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("invalid_status");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
  });

  it("PENDING, OVERDUE e DRAFT são os únicos canceláveis", () => {
    expect([...CANCELABLE_INVOICE_STATUSES].sort()).toEqual(["DRAFT", "OVERDUE", "PENDING"]);
    expect(CANCELABLE_INVOICE_STATUSES as readonly string[]).not.toContain("PAID");
    expect(CANCELABLE_INVOICE_STATUSES as readonly string[]).not.toContain("REFUNDED");
  });
});

describe("cancelInvoiceCharge — ORDEM: gateway primeiro, banco depois", () => {
  it("caminho feliz: chama o Asaas com o paymentId certo e cancela local", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    const r = await cancelInvoiceCharge("inv_1", "adm_1");

    expect(asaas.payments.delete).toHaveBeenCalledWith("pay_7q8qptpcuqwj21yd");
    expect(r).toEqual({
      ok: true,
      outcome: "canceled",
      gateway: "deleted",
      asaasPaymentId: "pay_7q8qptpcuqwj21yd",
    });
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv_1", status: { in: ["PENDING", "OVERDUE", "DRAFT"] } },
      data: { status: "CANCELED" },
    });
  });

  it("🔥 gateway ANTES do banco: a chamada ao Asaas precede a transação", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    const order: string[] = [];
    (asaas.payments.delete as any).mockImplementation(async () => {
      order.push("gateway");
      return { deleted: true, id: "pay_x" };
    });
    (prisma.$transaction as any).mockImplementation(async (fn: any) => {
      order.push("db");
      return fn(tx);
    });

    await cancelInvoiceCharge("inv_1", "adm_1");
    expect(order).toEqual(["gateway", "db"]);
  });

  it("🔥 gateway falha → NADA é escrito no banco (fatura segue cobrável)", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    (asaas.payments.delete as any).mockRejectedValue(
      new FakeAsaasError(500, { errors: [{ description: "Erro interno" }] }, "Erro interno"),
    );

    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("gateway_error");
    // A invariante que importa: o local NÃO virou CANCELED com PIX vivo lá fora.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.globalAudit.create).not.toHaveBeenCalled();
  });

  it("🔥 timeout/erro de rede (não-AsaasError) também aborta sem escrever", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    (asaas.payments.delete as any).mockRejectedValue(new Error("The operation was aborted"));

    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("gateway_error");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fatura sem asaasPaymentId → cancela só o local, sem chamar o gateway", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue({ ...INVOICE, asaasPaymentId: null });
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(asaas.payments.delete).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      outcome: "canceled",
      gateway: "no_charge",
      asaasPaymentId: null,
    });
    expect(tx.invoice.updateMany).toHaveBeenCalled();
  });
});

describe("cancelInvoiceCharge — idempotência do gateway", () => {
  it("🔥 Asaas 404 → conta como sucesso e o local é cancelado", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    (asaas.payments.delete as any).mockRejectedValue(
      new FakeAsaasError(404, { errors: [{ description: "Objeto não encontrado" }] }, "Objeto não encontrado"),
    );

    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("inalcançável");
    expect(r.gateway).toBe("already_gone");
    // É esta escrita que conserta a metade órfã (gateway morto, local PENDING).
    expect(tx.invoice.updateMany).toHaveBeenCalled();
    expect(tx.globalAudit.create).toHaveBeenCalled();
  });

  it("Asaas 400 com 'não encontrado' na descrição também é already_gone", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    (asaas.payments.delete as any).mockRejectedValue(
      new FakeAsaasError(
        400,
        { errors: [{ description: "A cobrança não foi encontrada" }] },
        "A cobrança não foi encontrada",
      ),
    );
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("inalcançável");
    expect(r.gateway).toBe("already_gone");
  });

  it("🔥 Asaas 400 de OUTRO motivo NÃO vira sucesso", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    (asaas.payments.delete as any).mockRejectedValue(
      new FakeAsaasError(
        400,
        { errors: [{ description: "Cobrança já recebida não pode ser removida" }] },
        "Cobrança já recebida não pode ser removida",
      ),
    );
    const r = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("inalcançável");
    expect(r.reason).toBe("gateway_error");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("cancelar duas vezes seguidas não explode (2ª = already_canceled)", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValueOnce(INVOICE);
    const first = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(first.ok).toBe(true);

    (prisma.invoice.findUnique as any).mockResolvedValueOnce({ ...INVOICE, status: "CANCELED" });
    const second = await cancelInvoiceCharge("inv_1", "adm_1");
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("inalcançável");
    expect(second.outcome).toBe("already_canceled");
    // O gateway foi chamado UMA vez só (na primeira).
    expect(asaas.payments.delete).toHaveBeenCalledTimes(1);
  });
});

describe("cancelInvoiceCharge — auditoria", () => {
  it("🔥 grava GlobalAudit com quem, qual PIX e quanto", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    await cancelInvoiceCharge("inv_1", "adm_42");

    expect(tx.globalAudit.create).toHaveBeenCalledTimes(1);
    const arg = (tx.globalAudit.create as any).mock.calls[0][0];
    expect(arg.data.actorType).toBe("ADMIN_USER");
    expect(arg.data.actorId).toBe("adm_42");
    expect(arg.data.action).toBe("INVOICE_CHARGE_CANCELED");
    expect(arg.data.companyId).toBe("co_1");
    expect(arg.data.metadata).toMatchObject({
      invoiceId: "inv_1",
      invoiceNumber: "INV-000004",
      asaasPaymentId: "pay_7q8qptpcuqwj21yd",
      totalCents: 14990,
      gateway: "deleted",
      previousStatus: "PENDING",
    });
  });

  it("auditoria e update ficam na MESMA transação (ou os dois, ou nenhum)", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    // A transação recebe o mesmo `tx` para os dois — se um dia alguém escrever a
    // auditoria fora dela, este teste ainda passa, então a asserção real é que
    // o `$transaction` foi usado e que ambos foram chamados com o tx dele.
    await cancelInvoiceCharge("inv_1", "adm_1");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.invoice.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.globalAudit.create).toHaveBeenCalledTimes(1);
  });

  it("🔥 falha ao gravar a auditoria derruba o cancelamento local (transação)", async () => {
    (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
    tx.globalAudit.create.mockRejectedValue(new Error("FK violada"));
    await expect(cancelInvoiceCharge("inv_1", "adm_1")).rejects.toThrow("FK violada");
    // O gateway já tinha sido chamado — é o custo aceito da ordem escolhida.
    expect(asaas.payments.delete).toHaveBeenCalled();
  });
});
