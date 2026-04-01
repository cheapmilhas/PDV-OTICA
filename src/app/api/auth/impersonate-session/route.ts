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

  // Setar apenas o cookie canônico — o mesmo configurado em auth.ts (sessionToken.name)
  // NÃO setar __Secure-next-auth.session-token: causaria conflito pois auth.ts usa apenas next-auth.session-token
  response.cookies.set("next-auth.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7200,
    secure: isProduction,
  });

  return response;
}
