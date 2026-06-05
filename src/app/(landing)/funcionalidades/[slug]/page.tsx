import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { featureSlugs, getFeature } from "@/content/features";
import { FeaturePageView } from "@/components/funcionalidades/feature-page";

interface FeatureSeo {
  title: string;
  description: string;
}

const SEO: Record<string, FeatureSeo> = {
  "pdv-para-otica": {
    title: "PDV para Ótica | Frente de Caixa Rápida — Vis",
    description:
      "PDV para ótica completo: venda com desconto, cashback e fechamento de caixa. Agilize a frente de caixa integrada a estoque e financeiro com o Vis.",
  },
  "ordem-de-servico-otica": {
    title: "Ordem de Serviço para Ótica | OS de Lentes — Vis",
    description:
      "Controle a OS de lentes do pedido à entrega: status, prazo, laboratório e garantia rastreável. Nunca mais perca uma lente no caminho com o Vis.",
  },
  "controle-de-estoque-otica": {
    title: "Controle de Estoque para Ótica | Armações e Lentes — Vis",
    description:
      "Controle o estoque de armações e lentes da sua ótica, multi-filial, com alerta de baixa e código de barras. Saiba o que tem e o que falta com o Vis.",
  },
  "gestao-financeira-otica": {
    title: "Gestão Financeira para Ótica | Caixa e DRE — Vis",
    description:
      "Contas a pagar e receber, fluxo de caixa, DRE e fechamento de caixa para sua ótica. Saiba se o mês fechou no azul, sem planilha, com o Vis.",
  },
  "leitura-de-receita-ia": {
    title: "Leitura de Receita por IA para Óticas — Vis",
    description:
      "Tire foto da receita e a IA do Vis extrai grau, eixo e DNP automaticamente. Menos digitação e menos erro no atendimento da sua ótica.",
  },
};

export function generateStaticParams() {
  return featureSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const f = getFeature(slug);
  if (!f) return {};

  const seo = SEO[slug];
  const title = seo?.title ?? `${f.name} | Vis`;
  const description = seo?.description ?? f.subtitle;
  const url = `/funcionalidades/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
  };
}

export default async function FeatureSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const f = getFeature(slug);
  if (!f) notFound();

  return <FeaturePageView data={f} />;
}
