"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Lock } from "lucide-react";

import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNav } from "@/app/admin/(painel)/admin-nav";
import { AdminLogoutButton } from "@/app/admin/(painel)/AdminLogoutButton";

/**
 * Conteúdo interno da sidebar (logo + navegação + logout).
 * Renderizado de forma idêntica na sidebar fixa (desktop) e no drawer (mobile).
 */
type Product = "VIS_APP" | "VIS_MEDICAL";

function SidebarContent({ activeProduct }: { activeProduct: Product }) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-foreground leading-tight">PDV Ótica</p>
            <p className="text-xs text-muted-foreground leading-tight">Portal de administração</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <AdminNav activeProduct={activeProduct} />

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
export function AdminSidebar({ activeProduct }: { activeProduct: Product }) {
  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 border-r border-border bg-card flex-col">
      <SidebarContent activeProduct={activeProduct} />
    </aside>
  );
}

/**
 * Botão hambúrguer + drawer (Sheet) para mobile (<lg).
 * Pensado para viver na top bar do layout. Escondido no desktop.
 * O drawer fecha automaticamente em qualquer troca de rota (usePathname).
 */
export function AdminMobileMenu({ activeProduct }: { activeProduct: Product }) {
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
        <SidebarContent activeProduct={activeProduct} />
      </SheetContent>
    </Sheet>
  );
}
