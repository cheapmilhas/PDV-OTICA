"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Home,
  ShoppingCart,
  Users,
  ClipboardList,
  MoreHorizontal,
  Package,
  FileText,
  DollarSign,
  Wallet,
  Gift,
  Target,
  BarChart3,
  Settings,
  Warehouse,
  X,
} from "lucide-react";

const primaryNav = [
  { icon: Home, label: "Início", href: "/dashboard" },
  { icon: ShoppingCart, label: "PDV", href: "/dashboard/pdv" },
  { icon: Users, label: "Clientes", href: "/dashboard/clientes" },
  { icon: ClipboardList, label: "OS", href: "/dashboard/ordens-servico" },
];

const moreNav = [
  { icon: FileText, label: "Vendas", href: "/dashboard/vendas" },
  { icon: Package, label: "Produtos", href: "/dashboard/produtos" },
  { icon: Warehouse, label: "Estoque", href: "/dashboard/estoque" },
  { icon: DollarSign, label: "Financeiro", href: "/dashboard/financeiro" },
  { icon: Wallet, label: "Caixa", href: "/dashboard/caixa" },
  { icon: Gift, label: "Cashback", href: "/dashboard/cashback" },
  { icon: Target, label: "Metas", href: "/dashboard/metas" },
  { icon: BarChart3, label: "Relatórios", href: "/dashboard/relatorios" },
  { icon: Settings, label: "Config", href: "/dashboard/configuracoes" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Overlay do menu "Mais" */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* Sheet do menu "Mais" */}
      {showMore && (
        <div className="fixed bottom-16 left-0 right-0 z-50 md:hidden bg-background border-t rounded-t-2xl shadow-2xl pb-safe">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className="font-semibold text-sm text-muted-foreground">Mais opções</span>
            <button
              onClick={() => setShowMore(false)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 p-4">
            {moreNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Barra de navegação inferior */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background border-t pb-safe">
        <div className="flex items-center justify-around h-14">
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 w-full h-full text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                {item.label}
              </Link>
            );
          })}

          {/* Botão Mais */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 w-full h-full text-[10px] font-medium transition-colors",
              showMore ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className={cn("h-5 w-5", showMore && "stroke-[2.5]")} />
            Mais
          </button>
        </div>
      </nav>
    </>
  );
}
