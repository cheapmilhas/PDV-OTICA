import { PricingProdutoSwitch } from "@/components/home/pricing-produto-switch";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd, buildProductJsonLd } from "@/components/seo/json-ld";
import { prisma } from "@/lib/prisma";

export default async function PrecosPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>;
}) {
  // `?produto=clinica` abre a página já na aba de clínicas (link direto de
  // campanha). Sem o parâmetro, abre em ÓTICA — o padrão desta página.
  const { produto } = await searchParams;
  const inicial = produto === "clinica" ? "clinica" : "otica";

  // Blindado: falha de banco (coluna ausente em deploy, indisponibilidade) não derruba
  // a página — apenas omite o JSON-LD de Product.
  //
  // `platformProduct: VIS_APP` é OBRIGATÓRIO mesmo com a aba de clínicas na tela: o
  // structured data descreve a IDENTIDADE da página, e esta é a página de preços da
  // ÓTICA (é o que o canonical e o título dizem). Sem o filtro, o Google passaria a
  // associar à /precos um preço de clínica (R$ 89,90) menor que o Básico ótico
  // (R$ 149,90) — o menor preço anunciado do produto errado.
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
      {/* O respiro do topo mora dentro do switch (que precisa dele antes das
          abas); aqui só a folga do header fixo. */}
      <div className="pt-16">
        <PricingProdutoSwitch inicial={inicial} />
      </div>
      {/* FAQ e CTA final são ÓTICOS na copy ("Perguntas que todo dono de ótica
          faz", "Sua ótica merece"). Quem chega por `?produto=clinica` terminava
          a página de preços dentro do funil do outro produto — pior ainda por
          ser o último bloco antes de sair. Na aba de clínica a página encerra
          no próprio grid de planos, que já tem o CTA correto por card. */}
      {inicial === "otica" && (
        <>
          <FaqSection />
          <FinalCta />
        </>
      )}
    </>
  );
}
