import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "auth/clear-session" });

/**
 * GET /api/auth/clear-session
 * Limpa completamente a sessão do usuário e redireciona para login
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();

  // Deletar TODOS os cookies
  const allCookies = cookieStore.getAll();

  allCookies.forEach((cookie) => {
    cookieStore.delete({
      name: cookie.name,
      path: "/",
      domain: undefined,
    });
  });

  log.info("Cookies deletados", { count: allCookies.length });

  // Redirecionar para login usando origin da requisição
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}
