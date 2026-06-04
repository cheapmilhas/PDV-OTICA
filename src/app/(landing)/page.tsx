import dynamic from "next/dynamic";
import { Hero } from "@/components/home/hero";
import { ProblemsSolutions } from "@/components/home/problems-solutions";

// Seções abaixo da dobra — carregadas sob demanda para aliviar o bundle inicial.
// ssr: true mantém o conteúdo no HTML (bom para SEO), só separa o JS por chunk.
const TargetAudience = dynamic(() =>
  import("@/components/home/target-audience").then((m) => m.TargetAudience)
);
const FeaturesBento = dynamic(() =>
  import("@/components/home/features-bento").then((m) => m.FeaturesBento)
);
const StatsCounter = dynamic(() =>
  import("@/components/home/stats-counter").then((m) => m.StatsCounter)
);
const LiveSalesTicker = dynamic(() =>
  import("@/components/home/live-sales-ticker").then((m) => m.LiveSalesTicker)
);
const LabIntegration = dynamic(() =>
  import("@/components/home/lab-integration").then((m) => m.LabIntegration)
);
const Security = dynamic(() =>
  import("@/components/home/security").then((m) => m.Security)
);
const Testimonials = dynamic(() =>
  import("@/components/home/testimonials").then((m) => m.Testimonials)
);
const HowItWorks = dynamic(() =>
  import("@/components/home/how-it-works").then((m) => m.HowItWorks)
);
const RoiCalculator = dynamic(() =>
  import("@/components/home/roi-calculator").then((m) => m.RoiCalculator)
);
const PricingSection = dynamic(() =>
  import("@/components/home/pricing-section").then((m) => m.PricingSection)
);
const FaqSection = dynamic(() =>
  import("@/components/home/faq-section").then((m) => m.FaqSection)
);
const FinalCta = dynamic(() =>
  import("@/components/home/final-cta").then((m) => m.FinalCta)
);

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemsSolutions />
      <TargetAudience />
      <FeaturesBento />
      <StatsCounter />
      <LiveSalesTicker />
      <LabIntegration />
      <Security />
      <Testimonials />
      <HowItWorks />
      <RoiCalculator />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  );
}
