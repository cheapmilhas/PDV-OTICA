/**
 * Cancelamento de cobrança NÃO PAGA no Asaas, feito pelo super admin.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 * O bootstrap das obrigações (`scripts/bootstrap-billing-obligations.cjs`, bloco
 * `cancelarFaturas`) ABORTA quando uma fatura a anular tem `asaasPaymentId`:
 * mudar o status local não cancela o PIX/boleto no gateway, o cliente ainda pode
 * pagar, e o webhook ressuscitaria a fatura como `PAID`. A saída de hoje é o
 * dono abrir o painel do Asaas à mão. Este serviço traz essa ação para dentro
 * do super admin — e só ela.
 *
 * ─── ESCOPO, travado ────────────────────────────────────────────────────────
 * SÓ cancelamento de cobrança NÃO PAGA. Fora, de propósito:
 *   - criar cobrança avulsa → já existe (`createManualCharge`);
 *   - ESTORNO de cobrança paga → `DELETE /payments/{id}` não faz isso (o
 *     docblock de `asaas.payments.delete` é explícito), o fluxo é outro e tem
 *     implicação fiscal;
 *   - cancelar a ASSINATURA no Asaas → `asaas.subscriptions.cancel`, outra ação.
 *
 * ─── DECISÃO 1: a ordem é GATEWAY PRIMEIRO, banco depois ────────────────────
 * As duas escritas não são atômicas (uma é HTTP, a outra é Postgres), então uma
 * delas vai falhar sozinha algum dia. A pergunta é qual metade sobreviver é
 * menos ruim:
 *
 *   - LOCAL primeiro, gateway falha  →  fatura `CANCELED` no sistema e PIX VIVO
 *     no Asaas. O cliente paga uma cobrança que o sistema esqueceu. O webhook
 *     recebe `PAYMENT_CONFIRMED` de uma fatura cancelada, o dinheiro entra sem
 *     dívida correspondente, e ninguém percebe porque a tela diz "cancelada".
 *     É o pior desfecho possível — dinheiro recebido sem registro de que era
 *     devido.
 *
 *   - GATEWAY primeiro, banco falha  →  cobrança morta no Asaas e fatura ainda
 *     `PENDING` no sistema. O cliente NÃO consegue pagar (o link morreu), o
 *     financeiro mostra uma dívida que não é mais cobrável, e o operador
 *     simplesmente clica de novo: a 2ª chamada ao Asaas devolve "já removida",
 *     que este serviço trata como SUCESSO (ver DECISÃO 4) e a escrita local
 *     completa. Estado feio, autocorrigível, sem dinheiro perdido.
 *
 * Ou seja: a ordem escolhida deixa o sistema mais PESSIMISTA que a realidade
 * (acha que ainda deve, quando já não cobra). A ordem inversa o deixaria mais
 * OTIMISTA (acha que não cobra, quando ainda cobra). Em caminho de dinheiro,
 * errar para o lado pessimista é a única opção defensável.
 *
 * ─── DECISÃO 2: fatura com OBRIGAÇÃO vinculada é RECUSADA nesta fatia ───────
 * `Invoice.billingObligationId` aponta para a `BillingObligation` que a fatura
 * tenta cobrar, e `BillingObligation.invoiceId` é o ponteiro inverso — dois
 * ponteiros sem FK entre si (ver `asaas-obligation-arbitration.ts`). Matar a
 * cobrança sem tocar na obrigação deixaria a obrigação `ISSUED` apontando para
 * uma fatura cancelada: `dueAt` vence, e I1 restringe o acesso de um cliente que
 * NÃO tem como pagar, porque nós mesmos matamos o link dele. Fail-closed óbvio.
 *
 * Tratar direito exige decidir entre reemitir (nova tentativa para a mesma
 * obrigação), anular (`VOID` + `voidReason`) ou marcar cortesia — três caminhos
 * com semânticas diferentes, cada um com CAS próprio, e nenhum deles é
 * "cancelar cobrança". Essa é a Task 10, não esta. Aqui a recusa é EXPLÍCITA e
 * com mensagem que diz onde resolver, em vez de um cancelamento que parece ter
 * funcionado e restringe o cliente três dias depois.
 *
 * 🔑 As 3 faturas do caso de uso real (INV-000004/5/6 da Óticas Atacadão) têm
 * `billingObligationId = NULL` — `billing_obligations` está vazia em produção.
 * A recusa não bloqueia o destravamento do bootstrap.
 *
 * ─── DECISÃO 3: só status VIVO e não pago ───────────────────────────────────
 * Barrado ANTES de qualquer chamada ao gateway:
 *   - `PAID`     → o `DELETE` do Asaas não remove cobrança recebida; o caminho é
 *                  ESTORNO. Cancelar o local apagaria a evidência do dinheiro.
 *   - `REFUNDED` → já houve pagamento e reversão; mexer aqui é reescrever
 *                  história fiscal.
 *   - `CANCELED` → nada a fazer (idempotente, ver DECISÃO 4).
 *   - `paidAt`/`paymentConfirmed` marcados, mesmo com status divergente → há
 *     evidência de dinheiro. Divergência não vira cancelamento silencioso.
 * Restam `PENDING`, `OVERDUE` e `DRAFT`, que é exatamente o conjunto que o
 * `DELETE /payments/{id}` aceita (PENDING/OVERDUE/AWAITING).
 *
 * ─── DECISÃO 4: idempotência ────────────────────────────────────────────────
 * Duas fontes de repetição, tratadas separadamente:
 *   - fatura já `CANCELED` localmente → devolve `already_canceled` sem chamar o
 *     gateway;
 *   - gateway responde 404/"não encontrado"/"já removida" → é o estado DESEJADO,
 *     não erro. Conta como sucesso e a escrita local prossegue (é o que conserta
 *     a metade órfã da DECISÃO 1).
 * Qualquer outro erro do Asaas ABORTA sem tocar no banco.
 *
 * ─── Sem gateway ────────────────────────────────────────────────────────────
 * Fatura sem `asaasPaymentId` (manual antiga, DRAFT) não tem o que cancelar lá
 * fora: cancela só o local. Não é atalho — é a ausência do problema.
 */

import { prisma } from "@/lib/prisma";
import { asaas, AsaasError } from "@/lib/asaas";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "invoice-cancel-charge" });

/** Status de fatura que ainda podem ter cobrança viva e cancelável. */
export const CANCELABLE_INVOICE_STATUSES = ["PENDING", "OVERDUE", "DRAFT"] as const;

export type CancelChargeFailureReason =
  /** Fatura não existe. */
  | "not_found"
  /** Já paga (ou com evidência de pagamento): o caminho é estorno. */
  | "paid"
  /** Estornada: história fiscal, não se cancela por aqui. */
  | "refunded"
  /** Status fora do conjunto cancelável. */
  | "invalid_status"
  /** Tem obrigação vinculada — fora do escopo desta fatia (DECISÃO 2). */
  | "has_obligation"
  /** O Asaas recusou (fora do caso "já removida"). NADA foi escrito. */
  | "gateway_error";

export type CancelChargeResult =
  | {
      ok: true;
      /** `canceled`: cancelou agora. `already_canceled`: já estava. */
      outcome: "canceled" | "already_canceled";
      /**
       * O que aconteceu no Asaas.
       * - `deleted`: o gateway removeu agora;
       * - `already_gone`: o gateway disse que não existe/já foi removida;
       * - `no_charge`: a fatura não tinha `asaasPaymentId`;
       * - `skipped`: nem chegamos a chamar (fatura já cancelada localmente).
       */
      gateway: "deleted" | "already_gone" | "no_charge" | "skipped";
      asaasPaymentId: string | null;
    }
  | {
      ok: false;
      reason: CancelChargeFailureReason;
      message: string;
    };

/**
 * O erro do Asaas significa "essa cobrança já não existe"?
 *
 * 404 é o caso limpo. O Asaas também devolve 400 com `invalid_action`/descrição
 * de "não encontrado" em alguns caminhos de remoção repetida — tratados aqui
 * como o mesmo estado desejado. Repetir um cancelamento não pode explodir.
 */
function isAlreadyGone(error: unknown): boolean {
  if (!(error instanceof AsaasError)) return false;
  if (error.status === 404) return true;

  const descriptions = (error.body as { errors?: { description?: string }[] } | null)
    ?.errors?.map((e) => e.description ?? "")
    .join(" ")
    .toLowerCase();
  // Normaliza acentos para não depender da grafia exata do gateway, e casa
  // "não encontrado"/"não foi encontrada"/"nao encontrada" com uma regra só.
  const haystack = `${descriptions ?? ""} ${error.message.toLowerCase()}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    /\bnao\b(?:\s+\w+){0,2}\s+encontrad/.test(haystack) ||
    /\bja\b(?:\s+\w+){0,2}\s+(removid|deletad|excluid|cancelad)/.test(haystack) ||
    haystack.includes("not found") ||
    haystack.includes("already removed") ||
    haystack.includes("already deleted")
  );
}

/**
 * Cancela a cobrança de uma fatura no Asaas e marca a fatura como `CANCELED`.
 *
 * @param invoiceId  PK da fatura.
 * @param adminId    `AdminUser.id` de quem clicou (vai para o `GlobalAudit`).
 */
export async function cancelInvoiceCharge(
  invoiceId: string,
  adminId: string,
): Promise<CancelChargeResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      paidAt: true,
      paymentConfirmed: true,
      asaasPaymentId: true,
      billingObligationId: true,
      subscription: { select: { companyId: true } },
    },
  });

  if (!invoice) {
    return { ok: false, reason: "not_found", message: "Fatura não encontrada" };
  }

  // ── Guardas ANTES do gateway (DECISÃO 3). Nenhuma delas chama o Asaas. ──

  // Idempotência local: já cancelada é sucesso, não erro (DECISÃO 4).
  if (invoice.status === "CANCELED") {
    return {
      ok: true,
      outcome: "already_canceled",
      gateway: "skipped",
      asaasPaymentId: invoice.asaasPaymentId,
    };
  }

  if (invoice.status === "PAID") {
    return {
      ok: false,
      reason: "paid",
      message:
        "Fatura PAGA não é cancelada por aqui — o caminho é ESTORNO (refund), " +
        "que tem implicação fiscal e não está coberto nesta tela.",
    };
  }

  if (invoice.status === "REFUNDED") {
    return {
      ok: false,
      reason: "refunded",
      message:
        "Fatura já ESTORNADA: houve pagamento e reversão. Cancelar apagaria a " +
        "evidência — resolva pelo estorno/conciliação.",
    };
  }

  // Cinto e suspensório: `paidAt`/`paymentConfirmed` marcados com status ainda
  // PENDING acontece (confirmação manual parcial, webhook em voo). Evidência de
  // dinheiro manda mais que o enum de status.
  if (invoice.paidAt !== null || invoice.paymentConfirmed) {
    return {
      ok: false,
      reason: "paid",
      message:
        "Fatura tem pagamento registrado (data de pagamento ou confirmação " +
        "manual) — não é cancelada por aqui. O caminho é estorno.",
    };
  }

  if (!(CANCELABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
    return {
      ok: false,
      reason: "invalid_status",
      message: `Status ${invoice.status} não permite cancelamento de cobrança.`,
    };
  }

  // DECISÃO 2: obrigação vinculada é recusa explícita nesta fatia.
  if (invoice.billingObligationId !== null) {
    return {
      ok: false,
      reason: "has_obligation",
      message:
        "Esta fatura cobra uma obrigação do motor de cobrança. Cancelar só a " +
        "cobrança deixaria a obrigação em aberto e vencida — o cliente seria " +
        "restringido sem ter como pagar. Reemita ou anule a obrigação na tela " +
        "de obrigações.",
    };
  }

  // ── GATEWAY PRIMEIRO (DECISÃO 1) ────────────────────────────────────────
  let gatewayOutcome: "deleted" | "already_gone" | "no_charge" = "no_charge";

  if (invoice.asaasPaymentId) {
    try {
      await asaas.payments.delete(invoice.asaasPaymentId);
      gatewayOutcome = "deleted";
    } catch (error) {
      if (isAlreadyGone(error)) {
        // Estado desejado já alcançado (2ª tentativa, ou cancelado no painel).
        // Prossegue para a escrita local — é o conserto da metade órfã.
        gatewayOutcome = "already_gone";
        log.warn("cobrança já não existia no Asaas", {
          invoiceId,
          asaasPaymentId: invoice.asaasPaymentId,
        });
      } else {
        // 🔑 ABORTA SEM ESCREVER. Marcar `CANCELED` aqui é exatamente o desfecho
        // que a DECISÃO 1 existe para impedir: cobrança viva que o sistema
        // esqueceu.
        const message = error instanceof Error ? error.message : String(error);
        log.error("Asaas recusou o cancelamento — nada foi escrito", {
          invoiceId,
          asaasPaymentId: invoice.asaasPaymentId,
          error: message,
        });
        return {
          ok: false,
          reason: "gateway_error",
          message: `O Asaas recusou o cancelamento (${message}). Nada foi alterado — tente de novo.`,
        };
      }
    }
  }

  // ── Depois, o local, na mesma transação da auditoria ────────────────────
  await prisma.$transaction(async (tx) => {
    // CAS por status: se outra aba/webhook marcou a fatura como paga entre a
    // leitura e agora, `updateMany` não acha linha e o cancelamento local não
    // acontece — não sobrescreve um pagamento. (A cobrança já morreu no
    // gateway; a divergência aparece na conciliação, e é o lado pessimista.)
    await tx.invoice.updateMany({
      where: { id: invoiceId, status: { in: [...CANCELABLE_INVOICE_STATUSES] } },
      data: { status: "CANCELED" },
    });

    await tx.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: adminId,
        companyId: invoice.subscription.companyId,
        action: "INVOICE_CHARGE_CANCELED",
        metadata: {
          invoiceId,
          invoiceNumber: invoice.number,
          asaasPaymentId: invoice.asaasPaymentId,
          totalCents: invoice.total,
          gateway: gatewayOutcome,
          previousStatus: invoice.status,
        },
      },
    });
  });

  log.info("cobrança cancelada", {
    invoiceId,
    adminId,
    asaasPaymentId: invoice.asaasPaymentId,
    gateway: gatewayOutcome,
  });

  return {
    ok: true,
    outcome: "canceled",
    gateway: gatewayOutcome,
    asaasPaymentId: invoice.asaasPaymentId,
  };
}
