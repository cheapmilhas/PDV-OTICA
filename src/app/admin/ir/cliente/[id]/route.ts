import { NextResponse } from "next/server";

import { getAdminSession, requireSupportScope } from "@/lib/admin-session";
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
 * 🚨 O GATE DE ESCOPO VEM ANTES DE LER `Company` — e isso não é zelo excessivo.
 * A URL é adivinhável (é só um id numa rota pública do painel). Sem o gate,
 * qualquer admin autenticado descobriria, por diferença de comportamento, se
 * uma empresa existe e QUAL PRODUTO ela é: o cookie só seria escrito quando o
 * registro existisse. Um redirecionador vira oráculo de existência com a mesma
 * facilidade que uma página.
 *
 * Por isso o comportamento é IDÊNTICO ao da ficha: escopo primeiro, e o mesmo
 * destino para "não existe" e "existe mas não é seu" — quem não tem escopo não
 * distingue os dois casos.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fichaUrl = new URL(`/admin/clientes/${id}`, request.url);

  const admin = await getAdminSession();
  // Sem sessão o proxy do admin já teria barrado antes de chegar aqui; este
  // ramo é defesa em profundidade. Manda para a ficha, que reexecuta o gate.
  if (!admin) return NextResponse.redirect(fichaUrl);

  // 🔑 ESCOPO ANTES DA LEITURA. Mesmo gate da ficha (`requireSupportScope`), e
  // pela razão que o comentário dela já registra: "a URL é adivinhável".
  const scoped = await requireSupportScope(admin.id, id);
  if (!scoped) {
    // Sem trocar o cookie: alinhar a lente para uma empresa que este admin não
    // pode ver já seria vazamento. A ficha responde notFound() — nunca 403 —
    // para não confirmar a existência do id.
    return NextResponse.redirect(fichaUrl);
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: { platformProduct: true },
  });

  const res = NextResponse.redirect(fichaUrl);

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
