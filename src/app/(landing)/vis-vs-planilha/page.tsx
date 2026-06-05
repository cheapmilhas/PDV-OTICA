import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { SectionHeading } from "@/components/home/section-heading";
import { FinalCta } from "@/components/home/final-cta";
import { ComparisonTable } from "@/components/funcionalidades/comparison-table";
import { JsonLd, buildBreadcrumbJsonLd } from "@/components/seo/json-ld";
import { Breadcrumb } from "@/components/seo/breadcrumb";
import { SITE_URL } from "@/lib/constants";

const TITLE = "Vis vs Planilha: Sistema para Ótica ou Excel?";
const DESCRIPTION =
  "Compare gerir a ótica em planilha de Excel ou no Vis: estoque, OS de lentes, financeiro e relatórios sem erros manuais. Veja por que sair da planilha.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/vis-vs-planilha" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/vis-vs-planilha",
    type: "website",
  },
};

const dores = [
  "Some quando o computador queima",
  "Todo mundo enxerga e edita tudo",
  "Você fecha o caixa no chute",
  "A OS da lente vive num bloquinho",
  "Sem alerta quando o estoque acaba",
];

const solucoes = [
  "Backup automático na nuvem",
  "Cada cargo vê só o que precisa",
  "Caixa conferido e rastreável",
  "Cada OS com status, prazo e laboratório",
  "Aviso automático de estoque baixo",
];

export default function VisVsPlanilhaPage() {
  return (
    <>
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Início", url: SITE_URL },
          { name: "Vis vs Planilha", url: `${SITE_URL}/vis-vs-planilha` },
        ])}
      />
      {/* Hero curto */}
      <section className="pt-28 pb-12">
        <div className="container-custom">
          <Breadcrumb
            items={[
              { name: "Início", href: "/" },
              { name: "Vis vs Planilha" },
            ]}
          />
          <SectionHeading
            eyebrow="Comparativo"
            title="Planilha ou Vis? Veja a diferença na sua ótica."
            subtitle="A planilha funciona até o dia em que não funciona mais. Veja o que muda quando a gestão é de verdade."
            align="center"
          />
        </div>
      </section>

      {/* Bloco 1 — Antes/Depois */}
      <section className="section-padding">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Com planilha e caderno */}
            <div
              className="rounded-2xl p-8"
              style={{
                background: "var(--lp-background)",
                border: "1px solid var(--lp-border)",
              }}
            >
              <h3
                className="font-heading font-bold text-xl mb-6"
                style={{ color: "var(--lp-muted)" }}
              >
                Com planilha e caderno
              </h3>
              <ul className="space-y-4">
                {dores.map((dor) => (
                  <li key={dor} className="flex items-start gap-3">
                    <span
                      className="flex items-center justify-center h-6 w-6 rounded-full shrink-0 mt-0.5"
                      style={{ background: "rgba(220, 38, 38, 0.10)" }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" style={{ color: "#DC2626" }} />
                    </span>
                    <span style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}>{dor}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Com o Vis */}
            <div
              className="vis-card shadow-glow p-8"
              style={{ background: "var(--brand-tint)" }}
            >
              <h3
                className="font-heading font-bold text-xl mb-6"
                style={{ color: "var(--brand-primary)" }}
              >
                Com o Vis
              </h3>
              <ul className="space-y-4">
                {solucoes.map((sol) => (
                  <li key={sol} className="flex items-start gap-3">
                    <span
                      className="flex items-center justify-center h-6 w-6 rounded-full shrink-0 mt-0.5"
                      style={{ background: "rgba(22, 163, 74, 0.12)" }}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" style={{ color: "var(--brand-success)" }} />
                    </span>
                    <span style={{ color: "var(--lp-foreground)", lineHeight: 1.6 }}>{sol}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Bloco 2 — Tabela comparativa */}
      <section className="section-padding" style={{ background: "var(--lp-background)" }}>
        <div className="container-custom">
          <SectionHeading title="Recurso a recurso" align="center" />
          <ComparisonTable />
        </div>
      </section>

      {/* Bloco 3 — CTA final */}
      <FinalCta />
    </>
  );
}
