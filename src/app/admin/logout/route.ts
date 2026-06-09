import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete("admin.session-token");
  // Destino é SEMPRE /admin/login no domínio configurado da aplicação.
  // Usar NEXTAUTH_URL (env confiável) evita open-redirect via Host header
  // spoofing que ocorreria se derivássemos a origin de request.url.
  // Em produção NEXTAUTH_URL DEVE ser o domínio público (ex.: https://vis.app.br);
  // só cai em request.url como último recurso de dev (localhost).
  const base = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  return NextResponse.redirect(new URL("/admin/login", base));
}
