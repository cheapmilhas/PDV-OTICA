import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { parseProductContext, PRODUCT_COOKIE } from "@/lib/admin-product-context";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const product = parseProductContext(body?.product);

  const res = NextResponse.json({ product });
  // Expira o cookie LEGADO com path:"/admin" na MESMA resposta. Sem isto, quem já
  // tinha o cookie antigo ficaria com DOIS cookies homônimos (path "/admin" e "/");
  // em `/admin/*` o browser envia ambos e `cookies().get()` resolve por ordem do
  // parser (ambíguo). Zerar o antigo garante uma leitura única.
  res.cookies.set(PRODUCT_COOKIE, "", { path: "/admin", maxAge: 0 });
  // path:"/" (não "/admin"): com "/admin" o browser NÃO envia o cookie para
  // `/api/admin/*` (path diferente por segmento), então getProductContext() em
  // route handlers e exports caía sempre em VIS_APP — a lente só funcionava em
  // Server Components. "/" faz a lente valer em toda a superfície do admin
  // (telas + APIs + exports). É contexto de UX (httpOnly/sameSite:lax), não
  // autorização — o access-scope (getAccessibleCompanyIds) é a fronteira real.
  res.cookies.set(PRODUCT_COOKIE, product, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
