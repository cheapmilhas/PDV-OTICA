import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { checkSubscription } from "@/lib/subscription";
import { SubscriptionBanner } from "@/components/subscription/subscription-banner";
import { SubscriptionBlocked } from "@/components/subscription/subscription-blocked";
import { BranchProviderWrapper } from "@/components/providers/branch-provider-wrapper";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";
import { findBlockedFeature } from "@/lib/plan-feature-catalog";

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

  // Se empresa não existe no banco (JWT com companyId antigo), forçar logout
  if (subscriptionCheck && !subscriptionCheck.allowed && subscriptionCheck.message === "EMPRESA_NAO_ENCONTRADA") {
    redirect("/force-logout");
  }

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

  // Plan feature gating (Fase 4 do plano de feature gating).
  // Bloqueia 16 funcionalidades do plano Básico, redireciona para /dashboard com toast.
  // Kill switch DISABLE_PLAN_FEATURE_GATING desliga tudo.
  if (
    companyId &&
    process.env.DISABLE_PLAN_FEATURE_GATING !== "true"
  ) {
    const headersList = await headers();
    const currentPath = headersList.get("x-current-path") ?? "";

    if (currentPath.startsWith("/dashboard")) {
      try {
        const { features } = await getCachedPlanFeatures(companyId);
        const blocked = findBlockedFeature(currentPath, features);
        if (blocked && currentPath !== "/dashboard") {
          redirect(`/dashboard?upgrade-required=${blocked}`);
        }
      } catch (err) {
        // Fail-open: erro de DB transitório não deve bloquear a UI inteira.
        // (redirect dentro do try não cai aqui — usa NEXT_REDIRECT exception.)
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "plan_features_lookup_failed",
            companyId,
            path: currentPath,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }

  return (
    <ThemeProvider>
      <BranchProviderWrapper>
        {/* Coluna que POSSUI a viewport: banner + shell dividem os 100vh.
            Antes o shell era h-screen (100vh fixo) IRMÃO do banner — quando o
            banner aparecia, a altura virava banner+100vh > tela, gerando uma
            faixa branca rolável no fim de toda página do dashboard. */}
        <div className="flex flex-col h-screen overflow-hidden bg-background">
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

          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar - esconde em mobile */}
            <div className="hidden md:flex">
              <Sidebar />
            </div>

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden w-full md:w-auto">
              <Header />
              {/* pb-16 em mobile para não sobrepor o bottom nav */}
              <main id="main-scroll" className="flex-1 overflow-y-auto bg-background p-4 md:p-6 pb-20 md:pb-6">
                {children}
              </main>
            </div>
          </div>
        </div>

        {/* Navegação inferior — apenas mobile */}
        <MobileNav />

        {/* Atalhos de teclado globais */}
        <KeyboardShortcuts />
      </BranchProviderWrapper>
    </ThemeProvider>
  );
}
