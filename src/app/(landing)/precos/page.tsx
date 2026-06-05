import { PricingSection } from "@/components/home/pricing-section";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd, buildProductJsonLd } from "@/components/seo/json-ld";
import { plans } from "@/content/pricing";

export default function PrecosPage() {
  return (
    <>
      <JsonLd
        data={buildProductJsonLd(
          plans.map((p) => ({ name: p.name, price: p.monthlyPrice })),
        )}
      />
      <div className="pt-10">
        <PricingSection />
      </div>
      <FaqSection />
      <FinalCta />
    </>
  );
}
