import { Hero } from "@/components/home/hero";
import { ProblemsSolutions } from "@/components/home/problems-solutions";
import { TargetAudience } from "@/components/home/target-audience";
import { FeaturesBento } from "@/components/home/features-bento";
import { StatsCounter } from "@/components/home/stats-counter";
import { LiveSalesTicker } from "@/components/home/live-sales-ticker";
import { LabIntegration } from "@/components/home/lab-integration";
import { Security } from "@/components/home/security";
import { Testimonials } from "@/components/home/testimonials";
import { HowItWorks } from "@/components/home/how-it-works";
import { RoiCalculator } from "@/components/home/roi-calculator";
import { PricingSection } from "@/components/home/pricing-section";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";

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
