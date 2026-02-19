import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { checkSubscription } from "@/lib/subscription";
import { SubscriptionBanner } from "@/components/subscription/subscription-banner";
import { SubscriptionBlocked } from "@/components/subscription/subscription-blocked";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const companyId = (session.user as any).companyId as string | undefined;

  // Se não tiver companyId, deixa passar (será tratado por cada página)
  let subscriptionCheck = companyId
    ? await checkSubscription(companyId)
    : null;

  // Se bloqueado, mostrar página de bloqueio em vez do dashboard
  if (subscriptionCheck && !subscriptionCheck.allowed) {
    return (
      <ThemeProvider>
        <SubscriptionBlocked
          status={subscriptionCheck.status}
          message={subscriptionCheck.message}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {/* Banner de aviso de assinatura (trial, past_due) */}
      {subscriptionCheck && (
        <SubscriptionBanner
          status={subscriptionCheck.status}
          message={subscriptionCheck.message}
          daysLeft={subscriptionCheck.daysLeft}
          daysOverdue={subscriptionCheck.daysOverdue}
          readOnly={subscriptionCheck.readOnly}
        />
      )}

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar - esconde em mobile */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden w-full md:w-auto">
          <Header />
          {/* pb-16 em mobile para não sobrepor o bottom nav */}
          <main className="flex-1 overflow-y-auto bg-muted/10 p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Navegação inferior — apenas mobile */}
      <MobileNav />
    </ThemeProvider>
  );
}
