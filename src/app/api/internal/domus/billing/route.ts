import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { signVisProvision } from "@/lib/vis-provision-hmac";
import { timingSafeEqual } from "crypto";

/**
 * Canal de LEITURA Domus → Vis: estado de cobrança de uma clínica.
 *
 * O Domus não pode criar cobrança (o checkout local foi removido e travado por
 * teste); ele só EXIBE o que o Vis emitiu. Este endpoint é a única fonte desses
 * dados para a tela `/subscription` do Domus.
 *
 * Decisões de segurança:
 * - HMAC PATH-BOUND (`vis-provision-hmac`), não o de entitlement que assina só
 *   `ts.body`: sem o path na assinatura, um payload capturado valeria em
 *   qualquer endpoint do canal.
 * - Segredo PRÓPRIO (`DOMUS_VIS_BILLING_SECRET`). Reusar o do plan-change
 *   ampliaria o poder daquele segredo: quem lê cobrança passaria a poder trocar
 *   plano se ele vazasse.
 * - A empresa é resolvida SÓ por `domusClinicId` assinado. Aceitar um
 *   companyId escolhido pelo caller seria IDOR cross-tenant.
 * - Somente LEITURA. Nenhuma escrita, nenhuma criação de cobrança.
 *
 * ⚠️ A rota PRECISA estar em `proxy-public-routes.ts` — sem isso o middleware
 * responde 401 ANTES do handler, e a falha é silenciosa dos dois lados (já
 * aconteceu duas vezes neste canal).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child({ route: "internal/domus/billing" });
const PATH = "/api/internal/domus/billing";
const WINDOW_MS = 5 * 60 * 1000;

export type BillingReadState = "no_charge" | "pending" | "overdue" | "paid";

/**
 * Faturas cujo estado admite PAGAMENTO.
 *
 * 🔥 Só estas são consultadas. Um `else` que jogasse todo status desconhecido em
 * "pending" faria a tela exibir PIX de fatura CANCELADA ou ESTORNADA — o cliente
 * pagaria uma cobrança que não existe mais, e o dinheiro teria de ser devolvido
 * à mão. DRAFT também fica fora: é rascunho, ninguém deve pagar.
 */
const PAYABLE_STATUSES = ["PENDING", "OVERDUE", "PAID"] as const;

function unauthorized(reason: string) {
  // Motivo só no log: a resposta não diferencia causa para não virar oráculo.
  log.warn("leitura de cobrança recusada", { reason });
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Mapeia o status da fatura para o que a tela do Domus precisa saber.
 *
 * EXAUSTIVO de propósito: qualquer status fora da lista pagável vira
 * `no_charge`, e a tela não oferece meio de pagamento. É o lado seguro de
 * errar — deixar de mostrar um PIX legítimo é recuperável (o operador reemite);
 * mostrar o PIX de uma fatura cancelada cobra dinheiro que precisa voltar.
 */
function stateFromInvoice(status: string): BillingReadState {
  if (status === "PAID") return "paid";
  if (status === "OVERDUE") return "overdue";
  if (status === "PENDING") return "pending";
  return "no_charge";
}

export async function GET(request: Request) {
  const secret = process.env.DOMUS_VIS_BILLING_SECRET ?? "";
  if (!secret) {
    log.error("DOMUS_VIS_BILLING_SECRET ausente — canal de cobrança desativado");
    return NextResponse.json({ error: "channel not configured" }, { status: 503 });
  }

  const clinicId = request.headers.get("x-vis-clinic-id");
  const tsRaw = request.headers.get("x-vis-timestamp");
  const nonce = request.headers.get("x-vis-nonce");
  const signature = request.headers.get("x-vis-signature");

  if (!clinicId || !tsRaw || !nonce || !signature) {
    return unauthorized("headers_ausentes");
  }

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > WINDOW_MS) {
    return unauthorized("timestamp_fora_da_janela");
  }

  // O clinicId ocupa o lugar do corpo (GET não tem corpo) — é ele que amarra o
  // tenant à assinatura. Trocar o header sem reassinar invalida a requisição.
  const expected = signVisProvision(secret, {
    version: 1,
    method: "GET",
    path: PATH,
    nonce,
    ts,
    body: clinicId,
  });
  if (!safeEqualHex(expected, signature.replace(/^sha256=/, "").trim())) {
    return unauthorized("assinatura_invalida");
  }

  // Sem nonce store: esta rota é IDEMPOTENTE e só lê. Replay dentro da janela
  // devolve o mesmo dado a quem já tinha a assinatura válida. Se um dia ela
  // passar a CRIAR cobrança, o nonce precisa ser consumido de forma durável.
  const company = await prisma.company.findFirst({
    where: { domusClinicId: clinicId, platformProduct: "VIS_MEDICAL" },
    select: { id: true },
  });
  if (!company) {
    // 404 (não 401): a autenticação passou; a clínica é que não tem par no Vis.
    return NextResponse.json({ error: "clinic not linked" }, { status: 404 });
  }

  const subs = await prisma.subscription.findMany({
    where: { companyId: company.id, status: { not: "CANCELED" } },
    select: {
      id: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      plan: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (subs.length === 0) {
    return NextResponse.json({ error: "no subscription" }, { status: 404 });
  }
  if (subs.length > 1) {
    // Não escolhe "a mais recente": mostraria cobrança da assinatura errada.
    log.error("clínica com mais de uma assinatura ativa", { clinicId });
    return NextResponse.json({ error: "ambiguous subscription" }, { status: 409 });
  }

  const sub = subs[0];
  const invoice = await prisma.invoice.findFirst({
    // Só mensalidade (isManual false) e só estado pagável: uma fatura cancelada
    // não pode ser servida como "a cobrança atual" da clínica.
    where: {
      subscriptionId: sub.id,
      isManual: false,
      status: { in: [...PAYABLE_STATUSES] },
    },
    select: {
      id: true,
      status: true,
      total: true,
      dueDate: true,
      periodStart: true,
      periodEnd: true,
      paymentUrl: true,
      pixCode: true,
      pixQrCodeUrl: true,
      boletoUrl: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    // Estado da ASSINATURA (contrato) e da COBRANÇA (fatura) são coisas
    // diferentes — a tela precisa dos dois para dizer a frase certa.
    subscriptionStatus: sub.status,
    planName: sub.plan?.name ?? null,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    state: invoice ? stateFromInvoice(invoice.status) : ("no_charge" as BillingReadState),
    // 🔑 Valores da fatura CONGELADA, nunca do preço atual do Plan: o cliente
    // já recebeu um PIX com um valor, e a tela não pode contradizê-lo.
    amountCents: invoice?.total ?? null,
    dueDate: invoice?.dueDate?.toISOString() ?? null,
    periodStart: invoice?.periodStart?.toISOString() ?? null,
    periodEnd: invoice?.periodEnd?.toISOString() ?? null,
    paymentUrl: invoice?.paymentUrl ?? null,
    pixCode: invoice?.pixCode ?? null,
    pixQrCodeUrl: invoice?.pixQrCodeUrl ?? null,
    boletoUrl: invoice?.boletoUrl ?? null,
  });
}
