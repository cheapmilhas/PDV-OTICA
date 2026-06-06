import { PricingSection } from "@/components/home/pricing-section";
import { FaqSection } from "@/components/home/faq-section";
import { FinalCta } from "@/components/home/final-cta";
import { JsonLd, buildProductJsonLd } from "@/components/seo/json-ld";
import { prisma } from "@/lib/prisma";

export default async function PrecosPage() {
  const priced = await prisma.plan.findMany({
    where: { isActive: true, status: "ACTIVE", priceMonthly: { gt: 0 } },
    select: { name: true, priceMonthly: true },
  });

  return (
    <>
      {priced.length > 0 && (
        <JsonLd
          data={buildProductJsonLd(
            priced.map((p) => ({ name: p.name, price: p.priceMonthly / 100 })),
          )}
        />
      )}
      <div className="pt-10">
        <PricingSection />
      </div>
      <FaqSection />
      <FinalCta />
    </>
  );
}
