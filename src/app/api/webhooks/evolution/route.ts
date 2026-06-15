import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { parseInboundMessage } from "@/lib/validations/whatsapp-inbound";
import { persistInboundMessage } from "@/services/whatsapp-message.service";

const log = logger.child({ webhook: "evolution" });

/**
 * Webhook da Evolution API (Fase B1 — apenas eventos de conexão/status).
 *
 * Eventos tratados:
 *   connection.update — mudou o estado da conexão (open|connecting|close)
 *   qrcode.updated    — novo QR gerado (apenas marca lastQrAt/CONNECTING)
 *
 * SEGURANÇA (molde Asaas/Focus NFe):
 *   - Autenticação: a Evolution (v2.3.x) assina cada chamada com JWT HS256
 *     usando o segredo compartilhado (jwt_key = EVOLUTION_WEBHOOK_SECRET) e
 *     envia `Authorization: Bearer <jwt>`. Validamos com jwtVerify(HS256) +
 *     checagem das claims app/action. Fail-closed em produção se o secret
 *     faltar (escape hatch ALLOW_UNSIGNED_EVOLUTION_WEBHOOK=1 só p/ rollout).
 *   - Isolamento: a empresa é resolvida pelo `instance` do payload contra
 *     WhatsappConnection.instanceName (único). Payload de instância desconhecida
 *     é REJEITADO (404) — uma ótica nunca afeta outra.
 *   - Idempotência: atualizações de estado são naturalmente idempotentes
 *     (mesmo estado → mesma escrita). `lastEventAt` registra o último evento.
 *   - Rate-limit por IP + logger filho.
 */

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    state?: string;
    statusReason?: number;
    // qrcode.updated pode trazer o objeto QR; não usamos o conteúdo aqui.
    [k: string]: unknown;
  };
  sender?: string;
  date_time?: string;
}

/**
 * Valida o JWT enviado pela Evolution no header Authorization.
 * Retorna { ok, reason } para o caller logar o motivo da recusa.
 */
async function verifyEvolutionJwt(
  authHeader: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;

  if (!secret) {
    const isProd = process.env.NODE_ENV === "production";
    const bypass = process.env.ALLOW_UNSIGNED_EVOLUTION_WEBHOOK === "1";
    if (isProd && !bypass) {
      return { ok: false, reason: "secret_missing_in_prod" };
    }
    return { ok: true }; // dev/preview ou bypass explícito
  }

  if (!authHeader) return { ok: false, reason: "authorization_header_missing" };

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, reason: "bearer_token_missing" };

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    // A ASSINATURA HS256 (com o segredo compartilhado) é a autenticação real —
    // jwtVerify já cobre algoritmo, assinatura e expiração (exp). As claims
    // app/action são uma checagem ADICIONAL: rejeitamos só se vierem PRESENTES e
    // ERRADAS. Se a Evolution (ou uma versão futura) não emitir as claims, não
    // rejeitamos um webhook legítimo já autenticado pela assinatura.
    if (payload.app !== undefined && payload.app !== "evolution") {
      return { ok: false, reason: "claim_app_mismatch" };
    }
    if (payload.action !== undefined && payload.action !== "webhook") {
      return { ok: false, reason: "claim_action_mismatch" };
    }
    return { ok: true };
  } catch {
    // jwtVerify já cobre expiração (exp), assinatura e algoritmo.
    return { ok: false, reason: "jwt_verify_failed" };
  }
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limited = rateLimitResponse(`webhook:evolution:${ip}`, {
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (limited) {
    log.warn("Rate limit excedido", { ip });
    return limited;
  }

  const auth = await verifyEvolutionJwt(request.headers.get("authorization"));
  if (!auth.ok) {
    log.warn("JWT inválido", { ip, reason: auth.reason });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: EvolutionWebhookPayload;
  try {
    payload = (await request.json()) as EvolutionWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const event = payload.event;
  const instance = payload.instance;
  if (!event || !instance) {
    return NextResponse.json({ error: "malformed event" }, { status: 400 });
  }

  // Isolamento: resolve a empresa pelo instanceName único. Desconhecido → 404.
  const conn = await prisma.whatsappConnection.findUnique({
    where: { instanceName: instance },
    select: { id: true, companyId: true, status: true },
  });
  if (!conn) {
    log.warn("Instância desconhecida no webhook", { instance, event });
    return NextResponse.json({ error: "unknown instance" }, { status: 404 });
  }

  try {
    const now = new Date();

    switch (event) {
      case "connection.update": {
        const state = payload.data?.state;
        // open → conectado; close → desconectado; connecting → conectando.
        if (state === "open") {
          const number = extractNumber(payload.sender);
          await prisma.whatsappConnection.update({
            where: { id: conn.id },
            data: {
              status: "CONNECTED",
              connectedNumber: number,
              connectedAt: now,
              lastEventAt: now,
              lastError: null,
            },
          });
        } else if (state === "close") {
          await prisma.whatsappConnection.update({
            where: { id: conn.id },
            data: {
              status: "DISCONNECTED",
              disconnectedAt: now,
              lastEventAt: now,
            },
          });
        } else {
          // connecting / desconhecido: registra o evento sem mudar o número.
          await prisma.whatsappConnection.update({
            where: { id: conn.id },
            data: { status: "CONNECTING", lastEventAt: now },
          });
        }
        break;
      }

      case "qrcode.updated": {
        await prisma.whatsappConnection.update({
          where: { id: conn.id },
          data: { status: "CONNECTING", lastQrAt: now, lastEventAt: now },
        });
        break;
      }

      case "messages.upsert": {
        const parsed = parseInboundMessage(payload.data);
        if (parsed) {
          await persistInboundMessage(conn.companyId, parsed);
        }
        // outbound/inválido: ignora silenciosamente, ainda 200
        await prisma.whatsappConnection.update({
          where: { id: conn.id },
          data: { lastEventAt: now },
        });
        break;
      }

      default:
        // Evento não relevante para B1: apenas marca recebimento.
        await prisma.whatsappConnection.update({
          where: { id: conn.id },
          data: { lastEventAt: now },
        });
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("Erro ao processar evento Evolution", { instance, event, error: errMsg });
    // 500 para a Evolution reenviar.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

/** Extrai só os dígitos do JID do remetente (ex: 5511999999999@s.whatsapp.net). */
function extractNumber(sender: string | undefined): string | null {
  if (!sender) return null;
  const digits = sender.split("@")[0]?.replace(/\D/g, "");
  return digits || null;
}
