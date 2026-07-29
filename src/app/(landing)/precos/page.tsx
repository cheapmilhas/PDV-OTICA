import { PricingSection } from "@/components/home/pricing-section";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd, buildProductJsonLd } from "@/components/seo/json-ld";
import { prisma } from "@/lib/prisma";

export default async function PrecosPage() {
  // Blindado: falha de banco (coluna ausente em deploy, indisponibilidade) não derruba
  // a página — apenas omite o JSON-LD de Product.
  //
  // `platformProduct: VIS_APP` é OBRIGATÓRIO: esta página vende ÓTICA. Sem o filtro, os
  // planos do Vis Medical entram no JSON-LD e o Google passa a associar à /precos um
  // preço de clínica (R$ 89,90) menor que o Básico ótico (R$ 149,90). Os preços do
  // Medical têm superfície própria em /medical.
  let priced: { name: string; priceMonthly: number }[] = [];
  try {
    priced = await prisma.plan.findMany({
      where: {
        isActive: true,
        status: "ACTIVE",
        priceMonthly: { gt: 0 },
        platformProduct: "VIS_APP",
      },
      select: { name: true, priceMonthly: true },
    });
  } catch {
    priced = [];
  }

  return (
    <>
      {priced.length > 0 && (
        <JsonLd
          data={buildProductJsonLd(
            priced.map((p) => ({ name: p.name, price: p.priceMonthly / 100 })),
          )}
        />
      )}
      <div className="pt-10">
        <PricingSection />
      </div>
      <FaqSection />
      <FinalCta />
    </>
  );
}
