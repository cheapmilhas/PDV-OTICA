/**
 * `POST /api/admin/invoices/[id]/cancel-charge` — cancela a cobrança NÃO PAGA
 * de uma fatura no Asaas e marca a fatura como `CANCELED`.
 *
 * ─── Por que ROTA PRÓPRIA e não mais uma `action` em `faturas/[id]/workflow` ──
 * O `workflow` é a esteira de MARCAÇÃO: as cinco ações dele (`mark_sent`,
 * `mark_paid`, `mark_nf_*`, `add_note`) são carimbos locais, todos reversíveis
 * por outro carimbo, todos sem efeito fora do nosso banco. Cancelamento de
 * cobrança é a única operação da fatura que sai para o mundo e não volta: um
 * `DELETE /payments/{id}` no Asaas é IRREVERSÍVEL.
 *
 * Duas consequências concretas dessa diferença, e não é preferência estética:
 *   1. O gate é OUTRO (`SUPER_ADMIN` só, ver abaixo). Um `switch` cujo default
 *      de autorização vale para 5 ações e não vale para a 6ª é exatamente o
 *      formato de bug que aparece quando alguém acrescenta a 7ª.
 *   2. Um `case` novo herdaria o gate do bloco de cima por OMISSÃO. Rota
 *      separada obriga a declarar o gate — e o teste a exercitá-lo.
 *
 * Fica ao lado de `resend-charge/`, que é a outra rota admin que fala com o
 * gateway a partir de uma fatura, e segue a mesma forma: sessão → papel → 404 →
 * escopo de empresa → serviço.
 *
 * ─── DECISÃO: o gate é `SUPER_ADMIN`, e SÓ ─────────────────────────────────
 * ⚠️ `requireCompanyScope` revalida o papel no banco mas aceita `SUPER_ADMIN`
 * **e** `ADMIN` — ele NÃO é gate suficiente aqui, e a rota não herda o gate da
 * página (`requireFinanceAccess`, que aceita até `BILLING`).
 *
 * `ADMIN` fica de fora nesta ação, ao contrário de `resend-charge` e do resto
 * de `/admin/financeiro`. Não é incoerência — é o eixo certo de comparação:
 *   - reenviar cobrança, exportar CSV, registrar NF: erro se DESFAZ (reenvia de
 *     novo, reexporta, corrige a NF);
 *   - cancelar cobrança: erro NÃO se desfaz. Não existe "descancelar" no Asaas.
 *     Recriar a cobrança gera OUTRO `paymentId`, com outro QR Code, outro link
 *     — o cliente que já tinha o PIX salvo fica com um código morto, e a
 *     conciliação passa a ter duas cobranças para o mesmo período.
 * `FINANCE_ROLES` responde "quem pode LER/OPERAR o financeiro" (ver o docblock
 * de `admin-finance-roles.ts`) e é o gate certo para as telas. A pergunta aqui é
 * outra: "quem pode destruir uma cobrança viva do cliente?". A resposta honesta
 * é o dono da operadora, que é a conta `SUPER_ADMIN` semeada em
 * `prisma/seed-plans.ts` e em `POST /api/admin/seed`.
 *
 * Se um dia houver um financeiro dedicado que precise disso, a mudança é
 * consciente (editar esta lista, com o teste de 403 falhando e sendo atualizado
 * de propósito) — não um efeito colateral de alguém ter mexido em `FINANCE_ROLES`
 * por outro motivo. `scopeAllCompanies` tem `@default(true)`, então o ESCOPO não
 * barra ninguém: o papel é a única barreira real.
 */

import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { cancelInvoiceCharge } from "@/services/invoice-cancel-charge.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/invoices/cancel-charge" });
export const dynamic = "force-dynamic";

/**
 * Papéis que podem DESTRUIR uma cobrança viva. Deliberadamente mais estreito que
 * `FINANCE_ROLES` — ver o docblock do arquivo.
 */
const CANCEL_CHARGE_ROLES = ["SUPER_ADMIN"] as const;

/** Falha do serviço → status HTTP. */
const FAILURE_STATUS: Record<string, number> = {
  not_found: 404,
  paid: 409,
  refunded: 409,
  invalid_status: 409,
  has_obligation: 409,
  gateway_error: 502,
};

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!(CANCEL_CHARGE_ROLES as readonly string[]).includes(admin.role)) {
    return NextResponse.json(
      { error: "Apenas o super admin pode cancelar cobrança (ação irreversível)" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  try {
    // 404 + escopo antes de qualquer coisa: admin restrito não cancela cobrança
    // de empresa fora do escopo dele (Invoice → subscription.companyId).
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, subscription: { select: { companyId: true } } },
    });
    if (!invoice) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });

    // Revalida no banco (papel + active + escopo). O cookie pode estar velho:
    // um SUPER_ADMIN rebaixado/desativado tem que perder a ação na hora.
    const scoped = await requireCompanyScope(admin.id, invoice.subscription.companyId);
    if (!scoped) {
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
    }
    // 🔑 `requireCompanyScope` aceita ADMIN. Repete a checagem de papel sobre o
    // valor RECÉM-LIDO do banco — sem isto, um ADMIN com cookie forjado/velho
    // que passasse o `admin.role` do JWT chegaria até aqui.
    if (!(CANCEL_CHARGE_ROLES as readonly string[]).includes(scoped.role)) {
      return NextResponse.json(
        { error: "Apenas o super admin pode cancelar cobrança (ação irreversível)" },
        { status: 403 },
      );
    }

    const result = await cancelInvoiceCharge(id, admin.id);

    if (!result.ok) {
      log.warn("cancelamento recusado", { invoiceId: id, adminId: admin.id, reason: result.reason });
      return NextResponse.json(
        { error: result.message, reason: result.reason },
        { status: FAILURE_STATUS[result.reason] ?? 400 },
      );
    }

    log.info("cancelamento de cobrança", {
      invoiceId: id,
      adminId: admin.id,
      outcome: result.outcome,
      gateway: result.gateway,
    });
    return NextResponse.json({
      success: true,
      outcome: result.outcome,
      gateway: result.gateway,
      asaasPaymentId: result.asaasPaymentId,
    });
  } catch (error) {
    log.error("Erro no cancelamento de cobrança", {
      invoiceId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
