import type { Metadata } from "next";
import { Toaster } from "sonner";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { AdminSidebar, AdminMobileMenu } from "@/components/admin/AdminSidebar";
import { AdminBreadcrumb } from "./admin-breadcrumb";

export const metadata: Metadata = {
  title: "PDV Ótica - Admin",
  description: "Portal de administração do PDV Ótica SaaS",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (desktop fixa + drawer mobile) */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar: sticky com blur para dar sensação de app (não some ao rolar
            listagens longas). Altura fixa (h-14) mantém o ritmo vertical. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 h-14 px-4 sm:px-6 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2 min-w-0">
            {/* Hambúrguer só aparece no mobile (lg:hidden no próprio botão) */}
            <AdminMobileMenu />
            <AdminBreadcrumb />
          </div>
          <NotificationBell />
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
