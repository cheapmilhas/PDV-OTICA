import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { jwtVerify } from "jose";
import { decode } from "next-auth/jwt";
import { readRequestId, REQUEST_ID_HEADER } from "@/lib/observability/request-context";

// Auth para rotas do PDV (Edge-safe)
const pdvAuth = NextAuth(authConfig).auth;

/**
 * Carimba o `x-request-id` no RESPONSE para que o browser/logs vejam o id.
 * Aditivo: não altera status, redirect ou lógica de auth.
 */
function withRequestId(res: NextResponse, request: NextRequest): NextResponse {
  res.headers.set(REQUEST_ID_HEADER, readRequestId(request.headers));
  return res;
}

/**
 * Propaga o pathname atual via header `x-current-path` no REQUEST,
 * para que server components possam ler com `headers().get(...)`.
 * (Usado pelo gate em (dashboard)/layout.tsx do feature gating.)
 *
 * Importante: setar no request, NÃO no response — request headers chegam ao
 * RSC; response headers vão ao browser.
 */
function nextWithCurrentPath(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", request.nextUrl.pathname);
  // Propaga o request-id no REQUEST para que RSCs possam ler.
  requestHeaders.set(REQUEST_ID_HEADER, readRequestId(request.headers));
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // E também no RESPONSE para o browser ver.
  return withRequestId(res, request);
}

const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
if (!authSecret) throw new Error("AUTH_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(authSecret);

const SESSION_COOKIE_NAME = "next-auth.session-token";
const SECURE_SESSION_COOKIE_NAME = "__Secure-next-auth.session-token";

async function verifyAdminToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

async function verifyPdvSession(token: string, cookieName: string) {
  try {
    const payload = await decode({
      token,
      secret: authSecret!,
      salt: cookieName,
    });
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas /admin/** e /api/admin/**
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    // Sempre permitir API de auth
    if (pathname.startsWith("/api/admin/auth")) {
      return nextWithCurrentPath(request);
    }

    // Página de login: se já tem token válido, redirecionar para /admin
    if (pathname === "/admin/login") {
      const tokenLogin = request.cookies.get("admin.session-token")?.value;
      if (tokenLogin) {
        const payloadLogin = await verifyAdminToken(tokenLogin);
        if (payloadLogin?.isAdmin) {
          return withRequestId(NextResponse.redirect(new URL("/admin", request.url)), request);
        }
      }
      return nextWithCurrentPath(request);
    }

    // Verificar token admin
    const token = request.cookies.get("admin.session-token")?.value;
    const isApiRoute = pathname.startsWith("/api/");

    if (!token) {
      if (isApiRoute) {
        return withRequestId(NextResponse.json({ error: "Não autorizado" }, { status: 401 }), request);
      }
      return withRequestId(NextResponse.redirect(new URL("/admin/login", request.url)), request);
    }

    const payload = await verifyAdminToken(token);

    if (!payload || !payload.isAdmin) {
      if (isApiRoute) {
        return withRequestId(NextResponse.json({ error: "Não autorizado" }, { status: 401 }), request);
      }
      // Token inválido ou expirado
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete("admin.session-token");
      return withRequestId(response, request);
    }

    return nextWithCurrentPath(request);
  }

  // Permitir rotas públicas (landing page, auth, etc.)
  const publicRoutes = ["/", "/precos", "/contato", "/sobre", "/login", "/force-logout", "/impersonate", "/registro", "/termos", "/privacidade"];
  if (
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/public") ||
    // Health check é público (uptime monitors) e não expõe internals.
    pathname.startsWith("/api/health") ||
    // Webhooks e crons NÃO usam cookie de sessão — têm auth própria:
    // webhooks validam HMAC/token do provedor; crons validam CRON_SECRET
    // (Bearer no header). Sem este bypass o middleware barra com 401 ANTES
    // do handler e os webhooks (Asaas/Focus) + crons nunca executam.
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/")
  ) {
    return nextWithCurrentPath(request);
  }

  // Rotas /dashboard/** (PDV multi-tenant)
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/")) {
    // Obter token de sessão (NextAuth)
    const insecureToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const secureToken = request.cookies.get(SECURE_SESSION_COOKIE_NAME)?.value;
    const sessionToken = insecureToken || secureToken;
    const cookieName = insecureToken ? SESSION_COOKIE_NAME : SECURE_SESSION_COOKIE_NAME;

    if (!sessionToken) {
      // Sem autenticação: redirecionar para login (se não for API)
      if (pathname.startsWith("/dashboard")) {
        return withRequestId(NextResponse.redirect(new URL("/login", request.url)), request);
      }
      // Se for API, retornar 401
      return withRequestId(NextResponse.json({ error: "Não autenticado" }, { status: 401 }), request);
    }

    // CRÍTICO: validar assinatura criptográfica do JWT.
    // Sem isso, um cookie forjado passaria pelo middleware e dependeria
    // de cada route handler chamar auth() corretamente para barrar acesso.
    const payload = await verifyPdvSession(sessionToken, cookieName);

    if (!payload) {
      if (pathname.startsWith("/dashboard")) {
        const response = NextResponse.redirect(new URL("/login", request.url));
        response.cookies.delete(SESSION_COOKIE_NAME);
        response.cookies.delete(SECURE_SESSION_COOKIE_NAME);
        return withRequestId(response, request);
      }
      return withRequestId(NextResponse.json({ error: "Não autenticado" }, { status: 401 }), request);
    }

    return nextWithCurrentPath(request);
  }

  // Demais rotas → PDV auth
  // Fallback do NextAuth: retorna um valor assíncrono que não controlamos
  // sincronamente aqui, então NÃO envolvemos com withRequestId (deixado as-is).
  return (pdvAuth as any)(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).*)"],
};
