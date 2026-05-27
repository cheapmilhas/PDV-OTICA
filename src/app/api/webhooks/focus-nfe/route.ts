import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimitResponse } from "@/lib/rate-limit";

const log = logger.child({ route: "webhooks/focus-nfe" });

/**
 * Valida assinatura HMAC-SHA256 enviada pelo Focus NFe.
 * Focus envia o header `X-Hub-Signature-256: sha256=<hex>` calculado sobre
 * o body raw com o segredo configurado em FOCUS_NFE_WEBHOOK_SECRET.
 * Se o segredo não estiver setado, validação é pulada (compat legacy).
 */
function verifyHmac(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.FOCUS_NFE_WEBHOOK_SECRET;
  if (!secret) return true; // segredo opcional — backward compat
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = signatureHeader.replace(/^sha256=/, "").trim();

  // Comprimentos diferentes → bytes inválidos pro timingSafeEqual.
  if (expected.length !== got.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
  } catch {
    return false;
  }
}

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

  // Q5.2: Rate limit por IP. Focus NFe legítimo envia poucos webhooks por
  // venda (autoriza/cancela); 60/min é folga sobrando.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limited = rateLimitResponse(`webhook:focus-nfe:${ip}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (limited) {
    log.warn("Rate limit excedido", { ip });
    return limited;
  }

  // Q5.2: HMAC opcional. Configure FOCUS_NFE_WEBHOOK_SECRET no painel Focus
  // + Vercel pra ativar. Sem isso qualquer um podia falsificar mudança de
  // fiscalStatus para "AUTHORIZED" mandando POST direto.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyHmac(rawBody, signature)) {
    log.warn("HMAC inválido", { ip, hasSignature: !!signature });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: FocusWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FocusWebhookPayload;
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
