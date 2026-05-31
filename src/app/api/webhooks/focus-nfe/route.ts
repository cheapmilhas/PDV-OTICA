import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { rateLimitResponse } from "@/lib/rate-limit";

const log = logger.child({ route: "webhooks/focus-nfe" });

/**
 * H8: Valida assinatura HMAC-SHA256 do Focus NFe. Focus envia o header
 * `X-Hub-Signature-256: sha256=<hex>` calculado sobre o body raw com o
 * segredo FOCUS_NFE_WEBHOOK_SECRET.
 *
 * Política (fail-closed): este webhook só roda quando FOCUS_NFE_TOKEN está
 * setado (integração ativa). Logo, em integração ativa o HMAC é SEMPRE
 * exigido — sem ele qualquer um falsifica fiscalStatus="AUTHORIZED". O
 * kill-switch ALLOW_UNSIGNED_FOCUS_WEBHOOK=1 libera apenas durante rollout.
 *
 * Retorna { ok, reason } para o caller logar o motivo da recusa.
 */
function verifyHmac(
  rawBody: string,
  signatureHeader: string | null,
): { ok: boolean; reason?: string } {
  const secret = process.env.FOCUS_NFE_WEBHOOK_SECRET;

  if (!secret) {
    if (process.env.ALLOW_UNSIGNED_FOCUS_WEBHOOK === "1") return { ok: true };
    return { ok: false, reason: "hmac_secret_missing" };
  }

  if (!signatureHeader) return { ok: false, reason: "signature_header_missing" };

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = signatureHeader.replace(/^sha256=/, "").trim();

  // Comprimentos diferentes → bytes inválidos pro timingSafeEqual.
  if (expected.length !== got.length) return { ok: false, reason: "length_mismatch" };
  try {
    const match = timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(got, "hex"),
    );
    return match ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_decode_error" };
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

  // H8: HMAC obrigatório com integração ativa. Configure FOCUS_NFE_WEBHOOK_SECRET
  // no painel Focus + Vercel. Sem isso qualquer um falsifica fiscalStatus
  // para "AUTHORIZED" mandando POST direto.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const hmac = verifyHmac(rawBody, signature);
  if (!hmac.ok) {
    log.warn("HMAC inválido", { ip, hasSignature: !!signature, reason: hmac.reason });
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
      select: { id: true, companyId: true, fiscalStatus: true },
    });

    if (!sale) {
      log.warn("Webhook recebido para ref sem venda local", { ref: payload.ref });
      return new NextResponse(null, { status: 204 });
    }

    // H8: idempotência. Focus reenvia o mesmo webhook em retry/duplicata. Sem
    // event-id próprio, usamos o estado terminal já gravado: se a nota já está
    // AUTHORIZED ou CANCELED, um reenvio do MESMO status terminal é no-op
    // (não reescreve fiscalEmittedAt/fiscalCanceledAt nem dispara efeito). Só
    // deixamos passar quando o status muda de fato (ex.: AUTHORIZED→CANCELED).
    // TERMINAL: estados sem progressão futura esperada. FAILED é excluído de
    // PROPÓSITO — Focus pode re-autorizar depois de rejeição, então
    // PENDING/FAILED→AUTHORIZED precisa continuar passando. NÃO adicionar
    // FAILED aqui (quebraria re-autorização).
    const TERMINAL = new Set(["AUTHORIZED", "CANCELED"]);
    const currentStatus = sale.fiscalStatus as string;
    if (TERMINAL.has(currentStatus) && currentStatus === mappedStatus) {
      log.info("Webhook duplicado ignorado (idempotência)", {
        saleId: sale.id,
        status: mappedStatus,
      });
      return NextResponse.json({ ok: true, duplicate: true });
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
