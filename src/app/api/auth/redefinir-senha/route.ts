import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/emails/resend";
import { clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { splitToken, verifyToken } from "@/services/password-reset.service";

const log = logger.child({ route: "auth/redefinir-senha" });

/** Custo do bcrypt para o hash da nova senha. */
const BCRYPT_COST = 12;

/** Domínios de logins internos que NÃO são e-mails entregáveis. */
const INTERNAL_LOGIN_SUFFIXES = ["@login", "@funcionario.interno"];

/**
 * Senha: 8 a 72 caracteres. bcrypt trunca silenciosamente a partir de 72 bytes;
 * rejeitar >72 evita que o usuário defina uma senha longa que seja truncada sem
 * ele saber. token: string não-vazia.
 */
const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

/**
 * Resposta 400 genérica de token — IDÊNTICA para todos os motivos (não existe,
 * verifier errado, já usado, expirado, corrida perdida). Anti-enumeração de token.
 */
const invalidTokenResponse = () =>
  NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });

export async function POST(request: Request) {
  // 1. Rate-limit por IP (anti-abuso, pré-tudo).
  const ipLimit = rateLimitResponse(`reset-pw:ip:${clientIp(request)}`, {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (ipLimit) return ipLimit;

  // 2. Parse + validação do corpo (zod). token não-vazio, senha 8-72.
  let token: string;
  let password: string;
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    token = parsed.data.token;
    password = parsed.data.password;
  } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // 3. Split selector.verifier. Malformado → mesmo 400 genérico.
  const parts = splitToken(token);
  if (!parts) return invalidTokenResponse();

  // 4. Busca o token pelo selector (público, @unique) + usuário.
  const row = await prisma.passwordResetToken.findUnique({
    where: { selector: parts.selector },
    include: { user: true },
  });

  // 5. Validação do token — MESMO 400 genérico para todos os casos.
  if (!row) return invalidTokenResponse();
  if (!verifyToken({ verifierHash: row.verifierHash }, parts.verifier)) {
    return invalidTokenResponse();
  }
  if (row.usedAt !== null) return invalidTokenResponse();
  if (row.expiresAt.getTime() <= Date.now()) return invalidTokenResponse();

  // 6. Hash da senha SÓ AGORA (após token validado) — não gasta bcrypt à toa.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // 7. Consumo ATÔMICO + troca de senha + revogação + auditoria, numa transação.
  try {
    await prisma.$transaction(async (tx) => {
      // 7a. Consome o token: só UMA requisição concorrente vence o WHERE usedAt:null.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { selector: parts.selector, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) {
        // Outra requisição já consumiu este token (corrida perdida).
        throw new Error("ALREADY_CONSUMED");
      }

      // 7b. Troca a senha e carimba passwordChangedAt (revoga sessões — Task 5).
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });

      // 7c. Revoga quaisquer OUTROS tokens ativos do mesmo usuário.
      await tx.passwordResetToken.deleteMany({
        where: { userId: row.userId, usedAt: null },
      });

      // 7d. Auditoria. ATENÇÃO: GlobalAudit.actorId tem FK → AdminUser (NÃO User).
      //     Para uma ação de USER comum, actorId DEVE ser null; o userId vai no metadata.
      await tx.globalAudit.create({
        data: {
          actorType: "USER",
          actorId: null,
          companyId: row.user.companyId,
          action: "USER_PASSWORD_RESET_SELF",
          metadata: {
            userId: row.userId,
            companyId: row.user.companyId,
            via: "self-service-email",
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_CONSUMED") {
      return invalidTokenResponse();
    }
    // Falha inesperada na transação: loga e devolve 500 (senha não foi trocada).
    log.error("Falha na transação de redefinição de senha", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Não foi possível redefinir a senha. Tente novamente." },
      { status: 500 }
    );
  }

  // 8. E-mail de confirmação (best-effort, fora da transação). Não envia para
  //    logins internos (@login/@funcionario.interno — não são e-mails reais).
  const email = row.user.email;
  const isInternal = INTERNAL_LOGIN_SUFFIXES.some((suffix) =>
    email.endsWith(suffix)
  );
  if (!isInternal) {
    try {
      // TODO Task 6: renderEmailTemplate("password-changed", ...)
      const html =
        "<p>Sua senha de acesso ao Vis foi alterada.</p>" +
        "<p>Se não foi você, entre em contato com o suporte imediatamente.</p>";
      const text =
        "Sua senha de acesso ao Vis foi alterada.\n\n" +
        "Se não foi você, entre em contato com o suporte imediatamente.";
      await sendEmail({
        to: email,
        subject: "Sua senha foi alterada",
        html,
        text,
      });
    } catch (err) {
      // Não relança: falha no aviso não pode desfazer a troca já efetivada.
      log.error("Falha ao enviar e-mail de senha alterada", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 9. Sucesso.
  return NextResponse.json({
    success: true,
    message: "Senha alterada com sucesso.",
  });
}
