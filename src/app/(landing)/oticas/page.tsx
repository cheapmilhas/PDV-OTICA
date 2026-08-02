import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Hero } from "@/components/home/hero";
import { ProblemsSolutions } from "@/components/home/problems-solutions";
import { TESTIMONIALS_ARE_PLACEHOLDER } from "@/components/home/testimonials-flag";
import { SITE_URL, OG_IMAGE } from "@/lib/constants";

/**
 * Landing do VIS PARA ÓTICAS.
 *
 * Estas seções viviam na home. Com a home virando institucional (a empresa e os
 * dois segmentos), elas mudaram de endereço em vez de serem duplicadas: são
 * específicas de ótica (ROI de lentes, integração com laboratório, ordem de
 * serviço) e ficariam incoerentes sob um título que fala de dois públicos.
 *
 * A ordem e os componentes são os MESMOS de antes — nenhuma seção foi reescrita
 * nesta migração, para que a mudança de rota possa ser avaliada isolada de
 * mudanças de conteúdo.
 */

export const metadata: Metadata = {
  title: "Vis para óticas — PDV, ordem de serviço e gestão",
  description:
    "PDV, ordens de serviço de lentes, estoque, financeiro e CRM para sua ótica num só sistema. Comece grátis.",
  alternates: { canonical: "/oticas" },
  openGraph: {
    title: "Vis para óticas — PDV, ordem de serviço e gestão",
    description:
      "PDV, ordens de serviço de lentes, estoque, financeiro e CRM para sua ótica num só sistema. Comece grátis.",
    url: `${SITE_URL}/oticas`,
    siteName: "Vis",
    type: "website",
    images: [OG_IMAGE],
    locale: "pt_BR",
  },
};

const sectionFallback = () => <div className="section-padding" aria-hidden />;

const TargetAudience = dynamic(
  () => import("@/components/home/target-audience").then((m) => m.TargetAudience),
  { loading: sectionFallback }
);
const FeaturesBento = dynamic(
  () => import("@/components/home/features-bento").then((m) => m.FeaturesBento),
  { loading: sectionFallback }
);
const StatsCounter = dynamic(
  () => import("@/components/home/stats-counter").then((m) => m.StatsCounter),
  { loading: sectionFallback }
);
const Testimonials = dynamic(
  () => import("@/components/home/testimonials").then((m) => m.Testimonials),
  { loading: sectionFallback }
);
const LabIntegration = dynamic(
  () => import("@/components/home/lab-integration").then((m) => m.LabIntegration),
  { loading: sectionFallback }
);
const Security = dynamic(
  () => import("@/components/home/security").then((m) => m.Security),
  { loading: sectionFallback }
);
const TrustProof = dynamic(
  () => import("@/components/home/trust-proof").then((m) => m.TrustProof),
  { loading: sectionFallback }
);
const HowItWorks = dynamic(
  () => import("@/components/home/how-it-works").then((m) => m.HowItWorks),
  { loading: sectionFallback }
);
const RoiCalculator = dynamic(
  () => import("@/components/home/roi-calculator").then((m) => m.RoiCalculator),
  { loading: sectionFallback }
);
const PricingSection = dynamic(
  () => import("@/components/home/pricing-section").then((m) => m.PricingSection),
  { loading: sectionFallback }
);
const FaqSection = dynamic(
  () => import("@/components/home/faq-section").then((m) => m.FaqSection),
  { loading: sectionFallback }
);
const FinalCta = dynamic(
  () => import("@/components/home/final-cta").then((m) => m.FinalCta),
  { loading: sectionFallback }
);

export default function OticasPage() {
  return (
    <>
      <Hero />
      <ProblemsSolutions />
      {!TESTIMONIALS_ARE_PLACEHOLDER && <Testimonials />}
      <TargetAudience />
      <FeaturesBento />
      <StatsCounter />
      <LabIntegration />
      <Security />
      <TrustProof />
      <HowItWorks />
      <RoiCalculator />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  );
}
