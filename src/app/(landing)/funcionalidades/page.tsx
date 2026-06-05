import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { features, featureIcons } from "@/content/features";
import { SectionHeading } from "@/components/home/section-heading";
import { FinalCta } from "@/components/home/final-cta";

const TITLE = "Funcionalidades do Vis | Sistema para Ótica";
const DESCRIPTION =
  "Conheça as funcionalidades do Vis: PDV, ordem de serviço de lentes, estoque, financeiro e leitura de receita por IA. Tudo para gerir sua ótica.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/funcionalidades" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/funcionalidades",
    type: "website",
  },
};

export default function FuncionalidadesPage() {
  return (
    <>
      {/* Hero curto */}
      <section className="pt-32 pb-12">
        <div className="container-custom">
          <SectionHeading
            eyebrow="Funcionalidades"
            title="Tudo o que sua ótica precisa, num só lugar"
            subtitle="Conheça em detalhe cada parte do Vis — do balcão ao laboratório."
            align="center"
          />
        </div>
      </section>

      {/* Grid de funcionalidades */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Object.values(features).map((f) => {
              const Icon = featureIcons[f.icon] ?? Sparkles;
              return (
                <Link
                  key={f.slug}
                  href={`/funcionalidades/${f.slug}`}
                  className="vis-card group flex flex-col"
                >
                  <div
                    className="flex items-center justify-center h-12 w-12 rounded-xl mb-4"
                    style={{ background: "var(--brand-tint)", color: "var(--brand-primary)" }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3
                    className="font-heading font-bold text-lg mb-2"
                    style={{ color: "var(--lp-foreground)" }}
                  >
                    {f.name}
                  </h3>
                  <p
                    className="line-clamp-2 flex-1"
                    style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
                  >
                    {f.subtitle}
                  </p>
                  <span
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: "var(--brand-primary)" }}
                  >
                    Ver detalhes
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
