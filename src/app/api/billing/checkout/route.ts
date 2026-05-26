import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { asaas, AsaasError } from "@/lib/asaas";
import { handleApiError } from "@/lib/error-handler";

const checkoutSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX"]),
  creditCard: z
    .object({
      holderName: z.string().min(2),
      number: z.string().min(13).max(19),
      expiryMonth: z.string().length(2),
      expiryYear: z.string().length(4),
      ccv: z.string().min(3).max(4),
    })
    .optional(),
  holderInfo: z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      cpfCnpj: z.string().min(11),
      postalCode: z.string().min(8),
      addressNumber: z.string().min(1),
      phone: z.string().min(10),
      mobilePhone: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/billing/checkout
 *
 * Cria customer + subscription no Asaas, persiste IDs e retorna URL de checkout.
 *
 * Para CREDIT_CARD: campos creditCard + holderInfo são obrigatórios.
 *   O Asaas tokeniza e cobra imediatamente.
 * Para PIX/BOLETO: gera primeira invoice; retorna URL com QR Code / boleto.
 *
 * Validações:
 * - usuário autenticado e dono da company
 * - plano existente e ativo
 * - se já tem subscription ACTIVE, retorna 409
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: { message: "Não autenticado" } }, { status: 401 });
    }
    const companyId = (session.user as { companyId?: string }).companyId;
    if (!companyId) {
      return NextResponse.json({ error: { message: "Empresa não vinculada" } }, { status: 400 });
    }

    const body = await request.json();
    const input = checkoutSchema.parse(body);

    if (input.billingType === "CREDIT_CARD" && (!input.creditCard || !input.holderInfo)) {
      return NextResponse.json(
        { error: { message: "creditCard e holderInfo são obrigatórios para cartão" } },
        { status: 400 },
      );
    }

    // Carrega plano + company
    const [plan, company, existingSub] = await Promise.all([
      prisma.plan.findUnique({ where: { id: input.planId } }),
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.subscription.findFirst({
        where: { companyId, status: { in: ["ACTIVE", "TRIAL"] } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: { message: "Plano não disponível" } }, { status: 404 });
    }
    if (!company) {
      return NextResponse.json({ error: { message: "Empresa não encontrada" } }, { status: 404 });
    }
    if (existingSub?.status === "ACTIVE") {
      return NextResponse.json(
        { error: { message: "Já existe assinatura ativa" } },
        { status: 409 },
      );
    }

    const value =
      input.billingCycle === "YEARLY"
        ? plan.priceYearly / 100
        : plan.priceMonthly / 100;

    // 1. Criar/reusar customer no Asaas
    let asaasCustomerId = existingSub?.asaasCustomerId ?? null;
    if (!asaasCustomerId) {
      const cpfCnpj = input.holderInfo?.cpfCnpj ?? company.cnpj;
      if (!cpfCnpj) {
        return NextResponse.json(
          { error: { message: "CPF/CNPJ é obrigatório" } },
          { status: 400 },
        );
      }
      const existingCustomer = await asaas.customers.findByCpfCnpj(cpfCnpj);
      if (existingCustomer) {
        asaasCustomerId = existingCustomer.id;
      } else {
        const created = await asaas.customers.create({
          name: input.holderInfo?.name ?? company.name,
          email: input.holderInfo?.email ?? company.email ?? session.user.email ?? "",
          cpfCnpj,
          mobilePhone: input.holderInfo?.mobilePhone ?? company.phone ?? undefined,
          externalReference: `company:${companyId}`,
        });
        asaasCustomerId = created.id;
      }
    }

    // 2. Criar subscription no Asaas
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);

    const asaasSub = await asaas.subscriptions.create({
      customer: asaasCustomerId,
      billingType: input.billingType,
      nextDueDate: nextDueDate.toISOString().slice(0, 10),
      value,
      cycle: input.billingCycle,
      description: `Plano ${plan.name} — PDV Ótica`,
      externalReference: `company:${companyId}:plan:${plan.id}`,
      ...(input.creditCard && input.holderInfo
        ? {
            creditCard: input.creditCard,
            creditCardHolderInfo: input.holderInfo,
            remoteIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
          }
        : {}),
    });

    // 3. Persistir Subscription local
    const now = new Date();
    const periodEnd = new Date(now);
    if (input.billingCycle === "YEARLY") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await prisma.subscription.upsert({
      where: { id: existingSub?.id ?? "____new____" },
      create: {
        companyId,
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: input.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        activatedAt: now,
        asaasCustomerId,
        asaasSubscriptionId: asaasSub.id,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: input.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        activatedAt: now,
        asaasCustomerId,
        asaasSubscriptionId: asaasSub.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        asaasSubscriptionId: asaasSub.id,
        billingType: input.billingType,
      },
    });
  } catch (err) {
    if (err instanceof AsaasError) {
      return NextResponse.json(
        { error: { message: err.message, gateway: "asaas", status: err.status } },
        { status: 502 },
      );
    }
    return handleApiError(err);
  }
}
