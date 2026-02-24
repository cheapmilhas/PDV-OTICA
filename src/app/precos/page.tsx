import { Header } from "@/components/landing/header";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta-section";
import { Footer } from "@/components/landing/footer";

export default function PrecosPage() {
  return (
    <div className="bg-gray-950 min-h-screen">
      <Header />
      <div className="pt-20">
        <Pricing />
      </div>
      <FAQ />
      <CTASection />
      <Footer />
    </div>
  );
}
