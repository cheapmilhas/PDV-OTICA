import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-session";
import { PRODUCT_COOKIE } from "@/lib/admin-product-context";
import { prisma } from "@/lib/prisma";

/**
 * Vai para a ficha do cliente ALINHANDO o contexto de produto antes.
 *
 * 🔥 Por que esta rota existe: `/admin/clientes/[id]` faz `notFound()` quando o
 * produto da empresa difere do cookie `admin.product` ativo. Um alerta de
 * clínica clicado com o painel em "ótica" daria 404 — o operador concluiria que
 * o cliente sumiu, quando ele só estava atrás da outra lente.
 *
 * Tem que ser no SERVIDOR: o cookie é httpOnly, então nem o link nem o cliente
 * conseguem trocá-lo.
 *
 * ⚠️ Isto é UX de navegação, NÃO autorização. Trocar a lente não concede acesso
 * a nada: a fronteira real continua sendo o gate da própria ficha (que revalida
 * sessão e escopo). Por isso aqui basta exigir sessão — sem ela, um link
 * vazado viraria um oráculo de "esta empresa existe e é medical".
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await getAdminSession();
  if (!admin) {
    // Sem sessão vai para o login, não para a ficha: preserva o destino para
    // depois de autenticar.
    return NextResponse.redirect(
      new URL(`/admin/login?next=${encodeURIComponent(`/admin/clientes/${id}`)}`, _request.url)
    );
  }

  // Descobre o produto da empresa para alinhar a lente. `select` mínimo: esta
  // rota não precisa de mais nada, e não deve carregar dado do cliente.
  const company = await prisma.company.findUnique({
    where: { id },
    select: { platformProduct: true },
  });

  const res = NextResponse.redirect(new URL(`/admin/clientes/${id}`, _request.url));

  // Empresa inexistente: segue para a ficha assim mesmo e deixa ELA responder
  // 404. Decidir aqui duplicaria a regra de existência em dois lugares.
  if (company) {
    res.cookies.set(PRODUCT_COOKIE, company.platformProduct, {
      httpOnly: true,
      sameSite: "lax",
      path: "/", // mesmo path da rota de troca — senão /api/admin/* não recebe
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return res;
}
