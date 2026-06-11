import { prisma as defaultPrisma } from "@/lib/prisma";
import { ensureAsaasCustomer } from "@/services/asaas-customer.service";
import { ensureInvoiceCharge } from "@/services/invoice-charge.service";
import { sendInvoiceCharge } from "@/services/invoice-send.service";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";

interface CreateArgs {
  companyId: string;
  amount: number;
  description: string;
  source?: string;
  dueDate?: Date | null;
  adminId: string;
}

interface CreateDeps {
  prismaClient?: typeof defaultPrisma;
  ensureCustomerFn?: (companyId: string) => Promise<unknown>;
  ensureChargeFn?: (invoiceId: string) => Promise<unknown>;
  sendFn?: (
    invoiceId: string,
    adminId: string
  ) => Promise<{ status: string; alreadySentToday: boolean }>;
  numberFn?: (client: any) => Promise<string>;
}

/**
 * Orquestra a criação de uma cobrança avulsa ÚNICA (não-recorrente) para uma empresa.
 *
 * Fluxo (ordem crítica):
 * 1. Valida que a empresa tem assinatura não-cancelada (ANTES de tocar o Asaas).
 * 2. Garante customer Asaas on-demand (pode lançar; Invoice ainda não existe).
 * 3. Gera número atômico INV-NNNNNN.
 * 4. Cria a Invoice manual (isManual:true) com período de 30 dias.
 * 5. Gera a cobrança (boleto/PIX) no Asaas. Se lançar, a Invoice JÁ existe
 *    (sem rollback — comportamento intencional I3; o erro propaga).
 * 6. Envia o email da cobrança.
 */
export async function createManualCharge(
  args: CreateArgs,
  deps: CreateDeps = {}
): Promise<{ invoiceId: string; asaasChargeCreated: boolean; emailStatus: string }> {
  const prisma = deps.prismaClient ?? defaultPrisma;
  const ensureCustomerFn = deps.ensureCustomerFn ?? ensureAsaasCustomer;
  const ensureChargeFn = deps.ensureChargeFn ?? ensureInvoiceCharge;
  const sendFn = deps.sendFn ?? sendInvoiceCharge;
  const numberFn = deps.numberFn ?? nextSaasInvoiceNumber;

  // 1. Valida assinatura ativa ANTES de tocar o Asaas
  const sub = await prisma.subscription.findFirst({
    where: { companyId: args.companyId, status: { not: "CANCELED" } },
    orderBy: { createdAt: "desc" },
  });

  if (!sub) {
    throw new Error("Empresa sem assinatura ativa para cobrar");
  }

  // 2. Garante customer Asaas on-demand (pode lançar; Invoice ainda NÃO criada)
  await ensureCustomerFn(args.companyId);

  // 3. Número atômico
  const number = await numberFn(prisma);

  // 4. Cria a Invoice manual
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000);

  const inv = await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      number,
      subtotal: args.amount,
      total: args.amount,
      discount: 0,
      periodStart: now,
      periodEnd,
      status: "PENDING",
      billingType: "PIX",
      description: args.description,
      isManual: true,
      source: args.source ?? null,
      dueDate: args.dueDate ?? null,
    },
  });

  // 5. Gera a cobrança no Asaas (sem rollback se falhar — I3 intencional)
  await ensureChargeFn(inv.id);

  // 6. Envia email da cobrança
  const send = await sendFn(inv.id, args.adminId);

  return {
    invoiceId: inv.id,
    asaasChargeCreated: true,
    emailStatus: send.status,
  };
}
