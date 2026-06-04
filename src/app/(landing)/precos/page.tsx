import { PricingSection } from "@/components/home/pricing-section";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";

export default function PrecosPage() {
  return (
    <>
      <div className="pt-10">
        <PricingSection />
      </div>
      <FaqSection />
      <FinalCta />
    </>
  );
}
