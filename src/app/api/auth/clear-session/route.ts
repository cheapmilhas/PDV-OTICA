import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/clear-session
 * Limpa completamente a sessão do usuário e redireciona para login
 */
export async function GET() {
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

  // Redirecionar para login
  return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "http://localhost:3000"));
}
