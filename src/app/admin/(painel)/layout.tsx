import type { Metadata } from "next";
import { Toaster } from "sonner";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { SystemHealthBadge } from "@/components/admin/SystemHealthBadge";
import { AdminSidebar, AdminMobileMenu } from "@/components/admin/AdminSidebar";
import { AdminBreadcrumb } from "./admin-breadcrumb";
import { countOpenEvents } from "@/services/system-event.service";
import { getProductContext } from "@/lib/admin-product-context";

export const metadata: Metadata = {
  title: "PDV Ótica - Admin",
  description: "Portal de administração do PDV Ótica SaaS",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Zero-polling: contagem lida no servidor a cada navegação (best-effort → 0).
  const openIncidents = await countOpenEvents();
  // Produto ativo do cookie — passado ao seletor para ele nascer sincronizado
  // com o que o servidor realmente usa nas queries (senão o botão volta a
  // "Vis App" no reload enquanto o cookie está em "Vis Medical").
  const activeProduct = await getProductContext();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (desktop fixa + drawer mobile) */}
      <AdminSidebar activeProduct={activeProduct} />

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar: sticky com blur para dar sensação de app (não some ao rolar
            listagens longas). Altura fixa (h-14) mantém o ritmo vertical. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 h-14 px-4 sm:px-6 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hambúrguer só aparece no mobile (lg:hidden no próprio botão) */}
            <AdminMobileMenu activeProduct={activeProduct} />
            <AdminBreadcrumb />
          </div>
          <div className="flex items-center gap-1">
            <SystemHealthBadge openCount={openIncidents} />
            <NotificationBell />
          </div>
        </header>
        {/* Cada página gerencia seu próprio padding (p-6). A padronização do
            container entra na fase de redesign de cada tela. */}
        {children}
      </main>

      {/* Toaster do sonner: ~15 componentes do admin usam `toast` de "sonner"
          (ações de ticket, etc.) mas ele nunca era montado — sucesso e erro
          ficavam invisíveis (A1). richColors dá verde/vermelho semântico. */}
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
