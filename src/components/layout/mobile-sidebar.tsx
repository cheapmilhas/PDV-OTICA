"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* Oculto: no mobile a navegação é a bottom-nav (mobile-nav.tsx) —
            evita dois menus redundantes (☰ topo + "Mais" na barra inferior).
            Mantido no código caso se queira reativar; nunca renderiza. */}
        <Button variant="ghost" size="icon" className="hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-72">
        <Sidebar onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
