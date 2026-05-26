import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { focusNfe, FocusNfeError, type NfceItem, type NfcePayment } from "@/lib/focus-nfe";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "fiscal/nfce/emit" });

const emitSchema = z.object({
  saleId: z.string().min(1),
});

const PAYMENT_METHOD_TO_NFCE: Record<string, string> = {
  CASH: "01",
  CHECK: "02",
  CREDIT_CARD: "03",
  DEBIT_CARD: "04",
  PIX: "17",
  STORE_CREDIT: "99",
  BANK_TRANSFER: "99",
  BALANCE_DUE: "99",
};

/**
 * POST /api/fiscal/nfce/emit
 *
 * Emite NFC-e para uma venda existente. Status:
 * - NÃO ATIVO em produção até o fluxo ser explicitamente ligado pelo cliente
 *   (env FOCUS_NFE_TOKEN ausente → retorna 503 com mensagem amigável)
 * - Quando ativo: chama Focus NFe, persiste fiscalRef e status PENDING.
 *   Webhook (/api/webhooks/focus-nfe) atualiza para AUTHORIZED ou FAILED.
 */
export async function POST(request: Request) {
  try {
    // Guard: feature flag implícita pelo token
    if (!process.env.FOCUS_NFE_TOKEN) {
      return NextResponse.json(
        {
          error: {
            code: "FISCAL_DISABLED",
            message:
              "Emissão fiscal não está habilitada nesta versão. A emissão de NFC-e é responsabilidade do estabelecimento e deve ser feita por sistema emissor próprio.",
          },
        },
        { status: 503 },
      );
    }

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: { message: "Não autenticado" } }, { status: 401 });
    }
    const companyId = (session.user as { companyId?: string }).companyId;
    if (!companyId) {
      return NextResponse.json({ error: { message: "Empresa não vinculada" } }, { status: 400 });
    }

    const body = await request.json();
    const { saleId } = emitSchema.parse(body);

    // Carrega venda + itens + pagamentos + branch + customer
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, companyId },
      include: {
        items: { include: { product: true } },
        payments: true,
        branch: true,
        customer: true,
        company: { select: { cnpj: true, name: true } },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: { message: "Venda não encontrada" } }, { status: 404 });
    }

    // Cast: campos novos do schema (sem prisma generate) — usamos any pontual
    const branchAny = sale.branch as any;
    const saleAny = sale as any;

    if (!branchAny.fiscalEnabled) {
      return NextResponse.json(
        {
          error: {
            code: "BRANCH_FISCAL_NOT_CONFIGURED",
            message: "Filial sem configuração fiscal. Vá em Configurações → Fiscal.",
          },
        },
        { status: 400 },
      );
    }

    if (!sale.company.cnpj) {
      return NextResponse.json(
        { error: { message: "Empresa sem CNPJ cadastrado" } },
        { status: 400 },
      );
    }

    if (["PENDING", "AUTHORIZED"].includes(sale.fiscalStatus)) {
      return NextResponse.json(
        { error: { message: `Venda já tem NFC-e em estado ${sale.fiscalStatus}` } },
        { status: 409 },
      );
    }

    // Monta payload Focus NFe
    const cfop = branchAny.fiscalCfopPadrao || "5102";
    const csosn = branchAny.fiscalCsosn || "102";
    const ncmPadrao = branchAny.fiscalNcmPadrao || "9001.40.00";

    const items: NfceItem[] = sale.items.map((item, i) => ({
      numero_item: i + 1,
      codigo_produto: item.product?.sku || item.productId?.slice(0, 10) || `item-${i + 1}`,
      descricao: item.product?.name || `Item ${i + 1}`,
      cfop,
      unidade_comercial: "UN",
      quantidade_comercial: Number(item.qty),
      valor_unitario_comercial: Number(item.unitPrice),
      valor_unitario_tributavel: Number(item.unitPrice),
      unidade_tributavel: "UN",
      quantidade_tributavel: Number(item.qty),
      codigo_ncm: ncmPadrao,
      icms_origem: "0",
      icms_situacao_tributaria: csosn,
      pis_situacao_tributaria: "49",
      cofins_situacao_tributaria: "49",
    }));

    const formas_pagamento: NfcePayment[] = sale.payments.map((p) => ({
      forma_pagamento: PAYMENT_METHOD_TO_NFCE[p.method] || "99",
      valor_pagamento: Number(p.amount),
    }));

    const ref = `sale-${sale.id}`;

    const nfceRes = await focusNfe.emit({
      ref,
      cnpj_emitente: sale.company.cnpj,
      data_emissao: new Date().toISOString(),
      natureza_operacao: "VENDA",
      indicador_inscricao_estadual_destinatario: 1,
      cpf_destinatario: sale.customer?.cpf ?? undefined,
      nome_destinatario: sale.customer?.name ?? undefined,
      items,
      formas_pagamento,
      valor_produtos: Number(sale.subtotal),
      valor_desconto: Number(sale.discountTotal ?? 0),
    });

    // Persiste estado inicial — webhook atualizará chave + URLs
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        fiscalStatus: "PENDING",
        fiscalModel: "65",
        fiscalRef: ref,
      } as any,
    });

    log.info("NFC-e emit solicitada", { saleId: sale.id, ref, status: nfceRes.status });

    return NextResponse.json({
      success: true,
      data: {
        ref,
        status: nfceRes.status,
        mensagem: nfceRes.mensagem_sefaz,
      },
    });
  } catch (err) {
    if (err instanceof FocusNfeError) {
      const friendly = focusNfe.friendlyError(
        (err.body as { codigo_status?: number })?.codigo_status,
        err.message,
      );
      log.error("Focus NFe rejeitou emissão", { status: err.status, message: err.message });

      // Marca venda como FAILED se temos o saleAny
      try {
        const body = await request.clone().json();
        if (body?.saleId) {
          await prisma.sale.update({
            where: { id: body.saleId },
            data: {
              fiscalStatus: "FAILED",
              fiscalError: friendly,
              fiscalSefazCode: (err.body as { codigo_status?: number })?.codigo_status,
            } as any,
          });
        }
      } catch {
        // ignora — venda pode não existir
      }

      return NextResponse.json(
        { error: { code: "SEFAZ_ERROR", message: friendly, gateway: "focus-nfe" } },
        { status: 502 },
      );
    }
    return handleApiError(err);
  }
}
