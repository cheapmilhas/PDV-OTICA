import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { authAdminConfig } from "@/auth-admin.config";

// Auth para rotas do PDV
const pdvAuth = NextAuth(authConfig).auth;
// Auth para rotas do Admin
const adminAuth = NextAuth(authAdminConfig).auth;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas /admin/** → proteger com authAdminConfig
  if (pathname.startsWith("/admin")) {
    return (adminAuth as any)(request);
  }

  // Demais rotas → proteger com authConfig (PDV)
  return (pdvAuth as any)(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
