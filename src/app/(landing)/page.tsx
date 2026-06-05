import dynamic from "next/dynamic";
import { Hero } from "@/components/home/hero";
import { ProblemsSolutions } from "@/components/home/problems-solutions";

// Placeholder de carregamento para seções abaixo da dobra — reserva altura
// e evita layout shift (CLS) enquanto o chunk carrega.
const sectionFallback = () => <div className="section-padding" aria-hidden />;

// Seções abaixo da dobra — carregadas sob demanda para aliviar o bundle inicial.
// ssr: true mantém o conteúdo no HTML (bom para SEO), só separa o JS por chunk.
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

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemsSolutions />
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
