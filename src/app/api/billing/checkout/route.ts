import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

    // M14: dupla proteção contra duplo-clique criar 2 subscriptions no Asaas
    // (cobrança duplicada).
    //
    // (1) IDEMPOTÊNCIA NO ASAAS: subscriptions.create envia asaas-idempotency-key
    //     = externalReference (company:X:plan:Y). Duas chamadas com a mesma chave
    //     retornam a MESMA subscription — o Asaas não cobra duas vezes. Isso
    //     cobre inclusive o caso de a tx local falhar no upsert e a requisição
    //     seguinte rechamar create (retorna a subscription existente, não outra).
    //
    // (2) ADVISORY LOCK transacional (pg_advisory_xact_lock): serializa os
    //     checkouts da MESMA empresa. xact-scoped é a escolha CORRETA no pooler
    //     do Neon em transaction-mode — ele é liberado no fim da tx e a tx
    //     interativa do Prisma mantém a MESMA conexão fixada por toda a duração
    //     (advisory lock de SESSÃO seria o perigoso: sobreviveria à tx e o pooler
    //     poderia reatribuir a conexão deixando o lock preso). A 2ª requisição
    //     espera o lock, re-checa ACTIVE dentro dele e retorna 409 antes do Asaas.
    const lockKey = advisoryKeyForCompany(companyId);

    const result = await prisma.$transaction(
      async (tx) => {
        // Adquire o lock (bloqueia até a outra tx liberar).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

        // Carrega plano + company + subscription DENTRO do lock (re-check).
        const [plan, company, existingSub] = await Promise.all([
          tx.plan.findUnique({ where: { id: input.planId } }),
          tx.company.findUnique({ where: { id: companyId } }),
          tx.subscription.findFirst({
            where: { companyId, status: { in: ["ACTIVE", "TRIAL"] } },
            orderBy: { createdAt: "desc" },
          }),
        ]);

        if (!plan || !plan.isActive) {
          return { kind: "error" as const, status: 404, message: "Plano não disponível" };
        }
        if (!company) {
          return { kind: "error" as const, status: 404, message: "Empresa não encontrada" };
        }
        if (existingSub?.status === "ACTIVE") {
          // Re-check sob lock: a 1ª requisição já ativou — barra a 2ª aqui,
          // ANTES de chamar o Asaas.
          return { kind: "error" as const, status: 409, message: "Já existe assinatura ativa" };
        }

        return await doCheckout(tx, {
          input,
          companyId,
          plan,
          company,
          existingSub,
          request,
          userEmail: session.user.email ?? null,
        });
      },
      // Segura uma conexão durante a ida ao Asaas (~1-5s). 20s cobre degradação
      // sem prender a conexão do pool por tempo excessivo.
      { timeout: 20_000 },
    );

    if (result.kind === "error") {
      return NextResponse.json(
        { error: { message: result.message } },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, data: result.data });
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

type CheckoutResult =
  | { kind: "error"; status: number; message: string }
  | { kind: "ok"; data: { subscriptionId: string; asaasSubscriptionId: string; billingType: string } };

/**
 * Executa o checkout (Asaas customer + subscription + persistência local).
 * Roda DENTRO da transação que segura o advisory lock (M14), então a chamada
 * externa ao Asaas e o upsert local ficam serializados por empresa.
 */
async function doCheckout(
  tx: Prisma.TransactionClient,
  ctx: {
    input: z.infer<typeof checkoutSchema>;
    companyId: string;
    plan: { id: string; name: string; priceMonthly: number; priceYearly: number };
    company: { name: string; email: string | null; phone: string | null; cnpj: string | null };
    existingSub: { id: string; asaasCustomerId: string | null } | null;
    request: Request;
    userEmail: string | null;
  },
): Promise<CheckoutResult> {
  const { input, companyId, plan, company, existingSub, request, userEmail } = ctx;

  const value =
    input.billingCycle === "YEARLY" ? plan.priceYearly / 100 : plan.priceMonthly / 100;

  // 1. Criar/reusar customer no Asaas
  let asaasCustomerId = existingSub?.asaasCustomerId ?? null;
  if (!asaasCustomerId) {
    const cpfCnpj = input.holderInfo?.cpfCnpj ?? company.cnpj;
    if (!cpfCnpj) {
      return { kind: "error", status: 400, message: "CPF/CNPJ é obrigatório" };
    }
    const existingCustomer = await asaas.customers.findByCpfCnpj(cpfCnpj);
    if (existingCustomer) {
      asaasCustomerId = existingCustomer.id;
    } else {
      const created = await asaas.customers.create({
        name: input.holderInfo?.name ?? company.name,
        email: input.holderInfo?.email ?? company.email ?? userEmail ?? "",
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

  const subscription = await tx.subscription.upsert({
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

  return {
    kind: "ok",
    data: {
      subscriptionId: subscription.id,
      asaasSubscriptionId: asaasSub.id,
      billingType: input.billingType,
    },
  };
}

/**
 * Deriva uma chave bigint estável (2 int32 → não usado; aqui só hashtext) para
 * o pg_advisory_xact_lock a partir do companyId. hashtext do Postgres dá int4.
 */
function advisoryKeyForCompany(companyId: string): number {
  // hash simples e determinístico → int32 (faixa segura para advisory lock).
  let h = 0;
  for (let i = 0; i < companyId.length; i++) {
    h = (Math.imul(31, h) + companyId.charCodeAt(i)) | 0;
  }
  return h;
}
