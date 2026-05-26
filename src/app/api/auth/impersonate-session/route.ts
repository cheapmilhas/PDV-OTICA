import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decode } from "next-auth/jwt";

/**
 * GET /api/auth/impersonate-session?token=...&sessionId=...
 * Seta o cookie httpOnly de sessão server-side e redireciona para o dashboard.
 * Único jeito de setar cookie httpOnly via JS (document.cookie não consegue).
 *
 * SEGURANÇA: Valida criptograficamente o JWT contra AUTH_SECRET antes de setar
 * o cookie. Sem isso, qualquer atacante com um sessionId válido poderia forjar
 * um token e ganhar sessão administrativa.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const sessionId = searchParams.get("sessionId");

  if (!token || !sessionId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!authSecret) {
    console.error("[IMPERSONATE] AUTH_SECRET ausente");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // CRÍTICO: validar assinatura do JWT antes de aceitá-lo
  // O salt deve coincidir com o cookie name configurado em auth.ts
  let payload: Record<string, unknown> | null = null;
  try {
    payload = await decode({
      token,
      secret: authSecret,
      salt: "next-auth.session-token",
    });
  } catch (err) {
    console.error("[IMPERSONATE] JWT decode falhou:", err);
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verificar se a sessão de impersonação existe e não expirou
  const session = await prisma.impersonationSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.expiresAt < new Date() || session.endedAt) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(new URL("/dashboard", request.url));

  response.cookies.set("next-auth.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7200,
    secure: isProduction,
  });

  return response;
}
