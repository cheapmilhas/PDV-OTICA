import { NextResponse } from "next/server";

import { verifyVisDomus } from "@/lib/vis-domus-hmac";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "internal/domus/send-reset-email" });

/**
 * POST /api/internal/domus/send-reset-email — o Domus pede ao Vis que envie o
 * e-mail de "esqueci minha senha".
 *
 * Por que o Vis envia: o Domus não tem NENHUMA infraestrutura de e-mail (sem
 * biblioteca, chave ou remetente). Duplicá-la lá significaria duas filas, duas
 * chaves para rotacionar e dois lugares para investigar quando um e-mail some.
 * O Vis já faz isso e é a operadora — envio transacional é responsabilidade
 * dele.
 *
 * O Vis NÃO gera nem valida o token: ele chega pronto do Domus, que é o dono da
 * sessão. Aqui só se monta a mensagem e enfileira.
 */

// O corpo é minúsculo (e-mail + link). Um corpo grande é abuso.
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(req: Request) {
  const secret = process.env.DOMUS_VIS_API_SECRET;
  if (!secret) {
    // Fail-closed: sem segredo, não autentica ninguém.
    log.error("send-reset-email sem DOMUS_VIS_API_SECRET (fail-closed)");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const ts = Number(req.headers.get("x-domus-timestamp"));
  const signature = req.headers.get("x-domus-signature");
  const verify = verifyVisDomus(secret, ts, rawBody, signature, Date.now());
  if (!verify.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse depois de autenticar (não vaza forma antes do HMAC).
  let body: { email?: unknown; resetUrl?: unknown; userName?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const resetUrl = typeof body.resetUrl === "string" ? body.resetUrl.trim() : "";
  const userName = typeof body.userName === "string" ? body.userName.trim() : "";
  if (!email || !resetUrl) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // O link tem que apontar para um host NOSSO. Sem esta checagem, quem tivesse
  // o segredo mandaria o Vis assinar com sua reputação um e-mail apontando para
  // domínio de terceiro — o sistema viraria trampolim de phishing.
  if (!isHostPermitido(resetUrl)) {
    log.error("resetUrl com host não permitido — recusado", { email });
    return NextResponse.json({ error: "invalid_reset_url" }, { status: 400 });
  }

  // dedupeKey por MINUTO: se a pessoa clicar "enviar" várias vezes, ela recebe
  // um e-mail por minuto, não um por clique. Não é por token porque cada pedido
  // gera token novo — o que precisa ser contido é a repetição, não o token.
  const janela = Math.floor(Date.now() / 60_000);
  await prisma.emailQueue.upsert({
    where: { dedupeKey: `domus-reset:${email}:${janela}` },
    update: {},
    create: {
      to: email,
      subject: "Redefinir sua senha",
      template: "domus-password-reset",
      dedupeKey: `domus-reset:${email}:${janela}`,
      data: { name: userName || null, resetUrl },
    },
  });

  // Despacha na hora — um link de redefinição que chega horas depois já expirou.
  // Best-effort: o cron horário é a rede de segurança.
  try {
    const { processEmailQueue } = await import("@/services/email-queue.service");
    await processEmailQueue(5);
  } catch (err) {
    log.error("despacho imediato do reset falhou (cron reenvia)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Resposta sem detalhe: quem chama não precisa saber se o e-mail existe.
  return NextResponse.json({ ok: true });
}

/** Hosts para os quais o Vis aceita mandar link de redefinição. */
const HOSTS_PERMITIDOS = new Set([
  "medical.vis.app.br",
  "app.domussaude.com.br",
]);

function isHostPermitido(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return HOSTS_PERMITIDOS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
