import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "webhooks/focus-nfe" });

/**
 * Webhook do Focus NFe.
 *
 * Notifica quando NFC-e/NF-e muda de status (autorizada, rejeitada, cancelada).
 *
 * Payload típico:
 * {
 *   "ref": "sale-abc123",
 *   "status": "autorizado" | "rejeitado" | "cancelado",
 *   "chave_nfe": "35200114200166000187650010000000051000000051",
 *   "numero": "51",
 *   "serie": "1",
 *   "caminho_xml_nota_fiscal": "/nfe/...",
 *   "caminho_danfe": "/nfe/.../danfe",
 *   "mensagem_sefaz": "Autorizado o uso da NF-e",
 *   "codigo_status": 100
 * }
 *
 * NÃO ATIVO: enquanto FOCUS_NFE_TOKEN não estiver configurado, retorna 204
 * mas não processa. Garante endpoint registrado sem riscos.
 */
interface FocusWebhookPayload {
  ref?: string;
  status?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  mensagem_sefaz?: string;
  codigo_status?: number;
}

const STATUS_MAP: Record<string, "AUTHORIZED" | "FAILED" | "CANCELED" | "PENDING"> = {
  autorizado: "AUTHORIZED",
  rejeitado: "FAILED",
  cancelado: "CANCELED",
  denegado: "FAILED",
  erro_autorizacao: "FAILED",
  processando_autorizacao: "PENDING",
};

export async function POST(request: Request) {
  if (!process.env.FOCUS_NFE_TOKEN) {
    return new NextResponse(null, { status: 204 });
  }

  let payload: FocusWebhookPayload;
  try {
    payload = (await request.json()) as FocusWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!payload.ref || !payload.status) {
    return NextResponse.json({ error: "ref or status missing" }, { status: 400 });
  }

  const mappedStatus = STATUS_MAP[payload.status] ?? "PENDING";

  try {
    const sale = await prisma.sale.findFirst({
      where: { fiscalRef: payload.ref } as any,
      select: { id: true, companyId: true },
    });

    if (!sale) {
      log.warn("Webhook recebido para ref sem venda local", { ref: payload.ref });
      return new NextResponse(null, { status: 204 });
    }

    const updates: Record<string, unknown> = {
      fiscalStatus: mappedStatus,
    };

    if (mappedStatus === "AUTHORIZED") {
      updates.fiscalKey = payload.chave_nfe ?? null;
      updates.fiscalNumber = payload.numero ?? null;
      updates.fiscalSerie = payload.serie ?? null;
      updates.fiscalXmlUrl = payload.caminho_xml_nota_fiscal ?? null;
      updates.fiscalPdfUrl = payload.caminho_danfe ?? null;
      updates.fiscalEmittedAt = new Date();
      updates.fiscalError = null;
      updates.fiscalSefazCode = null;
    } else if (mappedStatus === "FAILED") {
      updates.fiscalError = payload.mensagem_sefaz ?? "Erro SEFAZ";
      updates.fiscalSefazCode = payload.codigo_status ?? null;
    } else if (mappedStatus === "CANCELED") {
      updates.fiscalCanceledAt = new Date();
    }

    await prisma.sale.update({ where: { id: sale.id }, data: updates as any });

    log.info("Status fiscal atualizado", { saleId: sale.id, status: mappedStatus });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("Erro ao processar webhook Focus NFe", { err: String(err) });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
