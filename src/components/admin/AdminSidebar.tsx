"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminLogoutButton } from "@/app/admin/AdminLogoutButton";

/**
 * Conteúdo interno da sidebar (logo + navegação + logout).
 * Renderizado de forma idêntica na sidebar fixa (desktop) e no drawer (mobile).
 */
function SidebarContent() {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">PDV Ótica</p>
            <p className="text-xs text-muted-foreground leading-tight">Admin Portal</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <AdminNav />

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border">
        <AdminLogoutButton />
      </div>
    </>
  );
}

/**
 * Sidebar fixa do desktop (≥lg). Escondida no mobile.
 * Mantém exatamente os mesmos tokens/classes do <aside> original.
 */
export function AdminSidebar() {
  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 border-r border-border bg-card flex-col">
      <SidebarContent />
    </aside>
  );
}

/**
 * Botão hambúrguer + drawer (Sheet) para mobile (<lg).
 * Pensado para viver na top bar do layout. Escondido no desktop.
 * O drawer fecha automaticamente em qualquer troca de rota (usePathname).
 */
export function AdminMobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o drawer ao navegar (qualquer mudança de rota).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0 bg-card flex flex-col">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );
}
