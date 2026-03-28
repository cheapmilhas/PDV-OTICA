import { Header } from "@/components/landing-layout/header";
import { Footer } from "@/components/landing-layout/footer";
import { AnnouncementBar } from "@/components/landing-layout/announcement-bar";
import { WhatsAppButton } from "@/components/landing-layout/whatsapp-button";
import { ScrollProgress } from "@/components/landing-layout/scroll-progress";
import { ExitIntentPopup } from "@/components/landing-layout/exit-intent-popup";
import { CookieBanner } from "@/components/seo/cookie-banner";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-scope">
      <ScrollProgress />
      <AnnouncementBar />
      <Header />
      <main>{children}</main>
      <Footer />
      <WhatsAppButton />
      <ExitIntentPopup />
      <CookieBanner />
    </div>
  );
}
