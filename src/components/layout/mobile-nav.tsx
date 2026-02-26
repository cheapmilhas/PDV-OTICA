"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
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
  Target,
  BarChart3,
  Settings,
  Warehouse,
  X,
  BookOpen,
  ArrowLeftRight,
  Receipt,
  Building2,
  ListTree,
  RotateCcw,
  RefreshCw,
  Boxes,
  PieChart,
  TrendingUp,
} from "lucide-react";

const primaryNav = [
  { icon: Home, label: "Início", href: "/dashboard" },
  { icon: ShoppingCart, label: "PDV", href: "/dashboard/pdv", permission: "sales.create" },
  { icon: Users, label: "Clientes", href: "/dashboard/clientes", permission: "customers.view" },
  { icon: ClipboardList, label: "OS", href: "/dashboard/ordens-servico", permission: "service_orders.view" },
];

const moreNav = [
  { icon: FileText, label: "Vendas", href: "/dashboard/vendas", permission: "sales.view" },
  { icon: Package, label: "Produtos", href: "/dashboard/produtos", permission: "products.view" },
  { icon: Warehouse, label: "Estoque", href: "/dashboard/estoque", permission: "stock.view" },
  { icon: FileText, label: "Contas Pagar/Receber", href: "/dashboard/financeiro", permission: "financial.view" },
  { icon: Wallet, label: "Caixa", href: "/dashboard/caixa", permission: "cash_shift.view" },
  { icon: Wallet, label: "Cashback", href: "/dashboard/cashback", permission: "cashback.view" },
  { icon: Target, label: "Metas", href: "/dashboard/metas", permission: "goals.view" },
  { icon: BarChart3, label: "Relatórios", href: "/dashboard/relatorios", permission: "reports.sales" },
  { icon: TrendingUp, label: "Rel. Avançados", href: "/dashboard/relatorios/avancados", permission: "reports.sales" },
  { icon: DollarSign, label: "Dashboard Fin.", href: "/dashboard/financeiro/dashboard", permission: "financial.view" },
  { icon: BookOpen, label: "DRE", href: "/dashboard/financeiro/dre", permission: "financial.view" },
  { icon: ArrowLeftRight, label: "Fluxo Caixa", href: "/dashboard/financeiro/fluxo-caixa", permission: "financial.view" },
  { icon: Receipt, label: "Lançamentos", href: "/dashboard/financeiro/lancamentos", permission: "financial.view" },
  { icon: Building2, label: "Contas Fin.", href: "/dashboard/financeiro/contas", permission: "financial.view" },
  { icon: ListTree, label: "Plano Contas", href: "/dashboard/financeiro/plano-contas", permission: "financial.view" },
  { icon: RotateCcw, label: "Devoluções", href: "/dashboard/financeiro/devolucoes", permission: "financial.view" },
  { icon: RefreshCw, label: "Conciliação", href: "/dashboard/financeiro/conciliacao", permission: "financial.view" },
  { icon: Boxes, label: "Lotes Estoque", href: "/dashboard/financeiro/lotes-estoque", permission: "financial.view" },
  { icon: PieChart, label: "BI Analítico", href: "/dashboard/financeiro/bi", permission: "financial.view" },
  { icon: Settings, label: "Config", href: "/dashboard/configuracoes", permission: "settings.view" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const { hasPermission, isAdmin } = usePermissions();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  // Filtrar itens baseado nas permissões do usuário
  const visiblePrimaryNav = primaryNav.filter(
    (item) => !item.permission || isAdmin || hasPermission(item.permission)
  );

  const visibleMoreNav = moreNav.filter(
    (item) => !item.permission || isAdmin || hasPermission(item.permission)
  );

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
            {visibleMoreNav.map((item) => {
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
          {visiblePrimaryNav.map((item) => {
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

          {/* Botão Mais — só aparece se há itens no moreNav visíveis */}
          {visibleMoreNav.length > 0 && (
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
          )}
        </div>
      </nav>
    </>
  );
}
