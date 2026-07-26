import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/plans
 * Planos para landing/registro. Inclui ACTIVE e COMING_SOON (filtro isActive=true).
 * Sem auth. TTL curto (60s) para refletir alterações do admin.
 *
 * Produto por `?product=`: ausente/`optical` → ÓTICA (VIS_APP, padrão que os 3
 * consumidores existentes já usam sem query); `medical` → VIS_MEDICAL.
 *
 * O default ótico é o que fecha o P0 da Fase 0: sem separação, os planos medical
 * (ACTIVE, preço>0 desde o catálogo de 2026-07-19) vazavam na página de preços da
 * ótica — e o medical-profissional (R$89,90) é mais barato que o básico da ótica.
 */
export async function GET(request: Request) {
  // Produto resolvido por ALLOW-LIST, nunca pelo valor cru. Um parâmetro
  // desconhecido é ERRO (400), não "cai no default": falhar em silêncio aqui
  // esconderia um link errado no site e serviria o catálogo do outro produto.
  const raw = new URL(request.url).searchParams.get("product");
  if (raw !== null && raw !== "" && raw !== "medical" && raw !== "optical") {
    return NextResponse.json({ error: "Produto inválido" }, { status: 400 });
  }
  const isMedical = raw === "medical";

  const plans = await prisma.plan.findMany({
    where: isMedical
      ? {
          // Catálogo MEDICAL: precisa casar exatamente com o que o
          // register-medical aceita, senão a pessoa escolhe um plano que o
          // cadastro recusa. `selfServiceSelectable` exclui o "Interno — Domus"
          // (R$0), que existe só para uso interno e não pode ser vendido.
          // `status: ACTIVE` exclui COMING_SOON — sem isso a pessoa clicaria
          // num plano que ainda não existe para contratar.
          isActive: true,
          status: "ACTIVE",
          platformProduct: "VIS_MEDICAL",
          selfServiceSelectable: true,
        }
      : // Catálogo ÓTICO: INTOCADO. ⚠️ NUNCA acrescentar `selfServiceSelectable`
        // aqui — em produção os planos óticos têm essa flag em false e a página
        // de preços ficaria VAZIA (armadilha já documentada). O ramo medical
        // acima pode usá-la porque lá os planos vendáveis estão marcados.
        { isActive: true, platformProduct: "VIS_APP" },
    select: {
      id: true, name: true, slug: true, description: true,
      priceMonthly: true, priceYearly: true, trialDays: true,
      status: true, isFeatured: true, highlightFeatures: true,
      maxUsers: true, maxBranches: true, maxProducts: true,
      features: { select: { key: true, value: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(
    { plans },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
