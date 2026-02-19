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

  // Rotas /admin/**
  if (pathname.startsWith("/admin")) {
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

    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const payload = await verifyAdminToken(token);

    if (!payload || !payload.isAdmin) {
      // Token inválido ou expirado
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete("admin.session-token");
      return response;
    }

    return NextResponse.next();
  }

  // Demais rotas → PDV auth
  return (pdvAuth as any)(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
