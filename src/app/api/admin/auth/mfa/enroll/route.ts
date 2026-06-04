import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { generateMfaSecret } from "@/lib/totp";
import { handleApiError } from "@/lib/error-handler";
import { logger } from "@/lib/logger";
import { adminRateLimit } from "@/lib/rate-limit";

const log = logger.child({ route: "admin/auth/mfa/enroll" });

/**
 * POST /api/admin/auth/mfa/enroll
 *
 * Q8.3.1: inicia o cadastro do MFA. Gera um segredo TOTP, salva-o (ainda com
 * mfaEnabled=false — só ativa após o /verify confirmar o 1º código) e devolve
 * o QR Code (data URL) para o admin escanear no app autenticador.
 *
 * Idempotente do ponto de vista de segurança: re-chamar gera um segredo NOVO e
 * sobrescreve o pendente (enquanto não confirmado). Não permite re-enroll se o
 * MFA já está ATIVO (evita trocar segredo sem reautenticar).
 */
export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const limited = adminRateLimit("admin-mfa-enroll", session.id, request);
    if (limited) return limited;

    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { email: true, mfaEnabled: true },
    });
    if (!admin) {
      return NextResponse.json({ error: "Admin não encontrado" }, { status: 404 });
    }
    if (admin.mfaEnabled) {
      return NextResponse.json(
        { error: "MFA já está ativo. Desative antes de gerar um novo segredo." },
        { status: 409 },
      );
    }

    const secret = generateMfaSecret(admin.email);

    // Guarda o segredo PENDENTE (mfaEnabled segue false até o /verify).
    await prisma.adminUser.update({
      where: { id: session.id },
      data: { mfaSecret: secret.base32, mfaEnabled: false },
    });

    const qrDataUrl = await QRCode.toDataURL(secret.otpauthUrl);

    log.info("MFA enroll iniciado", { adminId: session.id });

    // manualEntryKey: caso o app não leia o QR, o admin digita o segredo à mão.
    return NextResponse.json({ qrDataUrl, manualEntryKey: secret.base32 });
  } catch (err) {
    return handleApiError(err);
  }
}
