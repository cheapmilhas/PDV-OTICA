import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/emails/resend";
import { renderEmailTemplate } from "@/lib/emails/templates";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { generateTokenParts } from "@/services/password-reset.service";

const log = logger.child({ route: "auth/esqueci-senha" });

/**
 * Piso de latência anti-enumeração (ms). TODA resposta — conta existe ou não,
 * e-mail válido ou não, rate-limit por e-mail estourado ou não — leva pelo menos
 * este tempo, para não vazar por timing se a conta existe. Exportado para os
 * testes poderem raciocinar sobre o valor.
 */
export const LATENCY_FLOOR_MS = 1200;

/** Token de reset expira em 1h. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Domínios de logins internos que NÃO são e-mails entregáveis. */
const INTERNAL_LOGIN_SUFFIXES = ["@login", "@funcionario.interno"];

const bodySchema = z.object({ email: z.string().email() });

/** Resposta genérica — IDÊNTICA em todos os casos (anti-enumeração). */
const genericResponse = () =>
  NextResponse.json({
    message:
      "Se houver uma conta com este e-mail, enviamos um link de recuperação.",
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  // 1. Rate-limit por IP (anti-abuso, pré-tudo). ÚNICO curto-circuito permitido:
  //    não distingue conta, apenas barra burst de um mesmo IP.
  const ipLimit = rateLimitResponse(
    `forgot-pw:ip:${clientIp(request)}`,
    { maxRequests: 10, windowMs: 15 * 60 * 1000 }
  );
  if (ipLimit) return ipLimit;

  // 2. Parse do e-mail. Se inválido, NÃO revelamos nada: caímos no mesmo fluxo
  //    simétrico (piso de latência + resposta genérica), sem trabalho real.
  let email: string | null = null;
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (parsed.success) email = parsed.data.email;
  } catch {
    // body ausente/malformado → email fica null → fluxo simétrico sem trabalho.
  }

  // 3. Piso de latência: trabalho real (passos 4-8) roda em paralelo ao sleep;
  //    a resposta só sai quando AMBOS terminam. Se não há e-mail válido, o
  //    trabalho é no-op mas o sleep AINDA roda — timing uniforme.
  await Promise.all([email ? doWork(email) : Promise.resolve(), sleep(LATENCY_FLOOR_MS)]);

  // 9. SEMPRE a mesma resposta 200.
  return genericResponse();
}

/**
 * Trabalho real: busca contas, filtra logins internos, respeita rate-limit por
 * e-mail e — se couber — cria tokens e envia UM e-mail. Nunca relança: qualquer
 * falha é logada e engolida para não virar oráculo de timing/erro.
 */
async function doWork(email: string): Promise<void> {
  try {
    const emailLower = email.toLowerCase();

    // 4. Busca contas com este e-mail (case-insensitive).
    const users = await prisma.user.findMany({
      where: { email: { equals: emailLower, mode: "insensitive" } },
      include: { company: true },
    });

    // 5. Exclui logins internos (não são e-mails reais entregáveis).
    const deliverable = users.filter(
      (u) => !INTERNAL_LOGIN_SUFFIXES.some((suffix) => u.email.endsWith(suffix))
    );

    // 6. Rate-limit por e-mail (anti-spam do MESMO alvo). Se estourado, NÃO
    //    fazemos trabalho — mas a resposta e o piso permanecem idênticos.
    const emailLimited =
      checkRateLimit(`forgot-pw:email:${emailLower}`, {
        maxRequests: 3,
        windowMs: 60 * 60 * 1000,
      }).allowed === false;

    if (emailLimited || deliverable.length === 0) return;

    // 7. Para CADA conta: uma transação que apaga tokens ativos e cria um novo.
    //    SEGURANÇA: a origem do link vem SÓ de env confiável — NUNCA de
    //    `request.url`/Host header. Derivar do Host permitiria "password reset
    //    poisoning": um atacante forja o Host, o link do e-mail aponta para o
    //    domínio dele e a vítima entrega o token ao clicar. Sem env → não
    //    montamos link nem enviamos (o usuário pode pedir de novo); logamos.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      log.error(
        "NEXT_PUBLIC_APP_URL ausente — link de reset não montado (não usar Host da requisição)"
      );
      return;
    }
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    const links: { selector: string; verifier: string; companyName?: string }[] = [];

    for (const u of deliverable) {
      const { selector, verifier, verifierHash } = generateTokenParts();
      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({
          where: { userId: u.id, usedAt: null },
        }),
        prisma.passwordResetToken.create({
          data: { userId: u.id, selector, verifierHash, expiresAt },
        }),
      ]);
      links.push({ selector, verifier, companyName: u.company?.name });
    }

    // 8. Envia UM e-mail com N links rotulados por empresa.
    if (links.length === 0) return;

    const templateLinks = links.map((l) => ({
      label: l.companyName
        ? `Redefinir senha — ${l.companyName}`
        : "Redefinir senha",
      url: `${baseUrl}/redefinir-senha?t=${l.selector}.${l.verifier}`,
    }));

    const { html, text } = renderEmailTemplate("password-reset", {
      links: templateLinks,
    });

    try {
      await sendEmail({
        to: emailLower,
        subject: "Recuperar acesso ao Vis",
        html,
        text,
      });
    } catch (err) {
      // Não relança: falha de envio não pode virar oráculo de timing/erro.
      log.error("Falha ao enviar e-mail de recuperação", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    // Qualquer falha inesperada: loga e engole (fluxo simétrico).
    log.error("Falha no fluxo de esqueci-senha", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
