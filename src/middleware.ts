import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { jwtVerify } from "jose";

// Auth para rotas do PDV (Edge-safe)
const pdvAuth = NextAuth(authConfig).auth;

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me"
);

async function verifyAdminToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas /admin/** e /api/admin/**
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    // Sempre permitir API de auth
    if (pathname.startsWith("/api/admin/auth")) {
      return NextResponse.next();
    }

    // Página de login: se já tem token válido, redirecionar para /admin
    if (pathname === "/admin/login") {
      const tokenLogin = request.cookies.get("admin.session-token")?.value;
      if (tokenLogin) {
        const payloadLogin = await verifyAdminToken(tokenLogin);
        if (payloadLogin?.isAdmin) {
          return NextResponse.redirect(new URL("/admin", request.url));
        }
      }
      return NextResponse.next();
    }

    // Verificar token admin
    const token = request.cookies.get("admin.session-token")?.value;
    const isApiRoute = pathname.startsWith("/api/");

    if (!token) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const payload = await verifyAdminToken(token);

    if (!payload || !payload.isAdmin) {
      if (isApiRoute) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
      // Token inválido ou expirado
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete("admin.session-token");
      return response;
    }

    return NextResponse.next();
  }

  // Permitir rotas públicas (landing page, auth, etc.)
  const publicRoutes = ["/", "/precos", "/contato", "/sobre", "/login", "/force-logout", "/impersonate", "/registro"];
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/public")
  ) {
    return NextResponse.next();
  }

  // Rotas /dashboard/** (PDV multi-tenant)
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/")) {
    // Obter token de sessão (NextAuth)
    const sessionToken =
      request.cookies.get("next-auth.session-token")?.value ||
      request.cookies.get("__Secure-next-auth.session-token")?.value;

    if (!sessionToken) {
      // Sem autenticação: redirecionar para login (se não for API)
      if (pathname.startsWith("/dashboard")) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      // Se for API, retornar 401
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Token existe, permitir acesso
    // O NextAuth gerencia a autenticação e sessão
    // Não precisamos decodificar o token aqui, apenas verificar sua existência
    return NextResponse.next();
  }

  // Demais rotas → PDV auth
  return (pdvAuth as any)(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
