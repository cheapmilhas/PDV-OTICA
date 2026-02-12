import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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

  console.log(`🧹 Cookies deletados: ${allCookies.length}`);

  // Redirecionar para login usando origin da requisição
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/login", url.origin));
}
