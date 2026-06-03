import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { verifyTotp, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/auth/mfa/verify" });

const verifySchema = z.object({ token: z.string().min(6).max(8) });

/**
 * POST /api/admin/auth/mfa/verify
 *
 * Q8.3.1: confirma o cadastro do MFA. Valida o 1º código TOTP contra o segredo
 * pendente (gravado no /enroll). Se válido: ativa mfaEnabled=true e gera os
 * códigos de recuperação (retornados UMA ÚNICA VEZ; só os hashes ficam no banco).
 */
export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const { token } = verifySchema.parse(await request.json());

    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { mfaSecret: true, mfaEnabled: true },
    });
    if (!admin?.mfaSecret) {
      return NextResponse.json(
        { error: "Nenhum cadastro de MFA pendente. Gere o QR Code primeiro." },
        { status: 400 },
      );
    }
    if (admin.mfaEnabled) {
      return NextResponse.json({ error: "MFA já está ativo." }, { status: 409 });
    }

    if (!verifyTotp(admin.mfaSecret, token)) {
      log.warn("Código MFA inválido no enroll", { adminId: session.id });
      return NextResponse.json({ error: "Código inválido. Tente novamente." }, { status: 401 });
    }

    // Gera os códigos de recuperação; só os hashes vão pro banco.
    const recoveryCodes = generateRecoveryCodes(10);
    await prisma.adminUser.update({
      where: { id: session.id },
      data: {
        mfaEnabled: true,
        mfaRecoveryCodes: recoveryCodes.map(hashRecoveryCode),
      },
    });

    await prisma.globalAudit
      .create({
        data: {
          actorType: "ADMIN",
          actorId: session.id,
          action: "MFA_ENABLED",
          metadata: { adminId: session.id },
        },
      })
      .catch(() => {});

    log.info("MFA ativado", { adminId: session.id });

    // recoveryCodes em texto plano — ÚNICA vez que o admin os vê.
    return NextResponse.json({ success: true, recoveryCodes });
  } catch (err) {
    return handleApiError(err);
  }
}
