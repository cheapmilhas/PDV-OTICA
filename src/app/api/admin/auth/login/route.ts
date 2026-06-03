import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { verifyTotp, matchRecoveryCode } from "@/lib/totp";

const log = logger.child({ route: "admin/auth/login" });

const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!authSecret) throw new Error("AUTH_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(authSecret);

export async function POST(request: Request) {
  try {
    // Rate limit: 5 tentativas por IP em 15 minutos
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "unknown";
    const limited = rateLimitResponse(`admin-login:${ip}`, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;

    const { email, password, mfaToken } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha são obrigatórios" },
        { status: 400 }
      );
    }

    // Buscar AdminUser
    const admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin) {
      log.warn("Admin não encontrado", { email });
      return NextResponse.json(
        { error: "Email ou senha inválidos" },
        { status: 401 }
      );
    }

    if (!admin.active) {
      log.warn("Admin inativo", { email });
      return NextResponse.json(
        { error: "Conta desativada" },
        { status: 401 }
      );
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, admin.password);

    if (!passwordMatch) {
      log.warn("Senha incorreta", { email });
      return NextResponse.json(
        { error: "Email ou senha inválidos" },
        { status: 401 }
      );
    }

    // Q8.3.1: segundo fator (TOTP). Só exige se o admin ativou o MFA e o
    // kill-switch de emergência não está ligado. Senha já validada acima.
    const mfaDisabled = process.env.DISABLE_ADMIN_MFA === "true";
    if (admin.mfaEnabled && admin.mfaSecret && !mfaDisabled) {
      const submitted = typeof mfaToken === "string" ? mfaToken.trim() : "";
      if (!submitted) {
        // Sinaliza ao front que falta o 2º fator — NÃO emite cookie ainda.
        return NextResponse.json({ mfaRequired: true }, { status: 401 });
      }

      // Rate-limit dedicado ao passo MFA (anti força-bruta do código 6 dígitos).
      const mfaLimited = rateLimitResponse(`admin-mfa:${admin.id}`, {
        maxRequests: 5,
        windowMs: 15 * 60 * 1000,
      });
      if (mfaLimited) return mfaLimited;

      const totpOk = verifyTotp(admin.mfaSecret, submitted);
      let recoveryUsed = false;

      if (!totpOk) {
        // Tenta como código de recuperação (uso único).
        const matchedHash = admin.mfaRecoveryCodes.find((h) =>
          matchRecoveryCode(submitted, h),
        );
        if (matchedHash) {
          recoveryUsed = true;
          // Consome o código usado (remove o hash da lista).
          await prisma.adminUser.update({
            where: { id: admin.id },
            data: {
              mfaRecoveryCodes: admin.mfaRecoveryCodes.filter((h) => h !== matchedHash),
            },
          });
          await prisma.globalAudit
            .create({
              data: {
                actorType: "ADMIN",
                actorId: admin.id,
                action: "MFA_RECOVERY_CODE_USED",
                metadata: { remaining: admin.mfaRecoveryCodes.length - 1 },
              },
            })
            .catch(() => {});
        } else {
          log.warn("Código MFA inválido no login", { email });
          return NextResponse.json({ error: "Código de verificação inválido", mfaRequired: true }, { status: 401 });
        }
      }

      log.info("MFA verificado no login", { email, viaRecovery: recoveryUsed });
    }

    // Atualizar último login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // Criar JWT
    const token = await new SignJWT({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isAdmin: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(JWT_SECRET);

    // Setar cookie
    const cookieStore = await cookies();
    cookieStore.set("admin.session-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // 8 horas
    });

    log.info("Login bem-sucedido", { email, role: admin.role });

    return NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    log.error("Erro", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
