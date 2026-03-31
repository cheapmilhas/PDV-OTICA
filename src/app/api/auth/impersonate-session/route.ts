import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/impersonate-session?token=...&sessionId=...
 * Seta o cookie httpOnly de sessão server-side e redireciona para o dashboard.
 * Único jeito de setar cookie httpOnly via JS (document.cookie não consegue).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const sessionId = searchParams.get("sessionId");

  if (!token || !sessionId) {
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

  // Usar a API de cookies do NextResponse para garantir que o Set-Cookie seja preservado no redirect
  response.cookies.set("next-auth.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7200,
    secure: isProduction,
  });

  // Setar também o prefixo __Secure- que o NextAuth pode usar em produção
  if (isProduction) {
    response.cookies.set("__Secure-next-auth.session-token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7200,
      secure: true,
    });
  }

  return response;
}
