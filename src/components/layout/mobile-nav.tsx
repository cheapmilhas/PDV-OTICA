"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useWhatsappEnabled } from "@/hooks/useWhatsappEnabled";
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
  Glasses,
  Truck,
  Store,
  CreditCard,
  CalendarClock,
  MessageCircle,
  Filter,
  Sparkles,
} from "lucide-react";

const primaryNav = [
  { icon: Home, label: "Início", href: "/dashboard" },
  { icon: ShoppingCart, label: "PDV", href: "/dashboard/pdv", permission: "sales.create" },
  { icon: Users, label: "Clientes", href: "/dashboard/clientes", permission: "customers.view" },
  { icon: ClipboardList, label: "OS", href: "/dashboard/ordens-servico", permission: "service_orders.view" },
  { icon: BookOpen, label: "Receitas", href: "/dashboard/livro-receitas", permission: "prescriptions.view" },
];

const moreNav = [
  { icon: FileText, label: "Vendas", href: "/dashboard/vendas", permission: "sales.view" },
  { icon: Filter, label: "Funil", href: "/dashboard/funil", permission: "leads.access" },
  { icon: Package, label: "Produtos", href: "/dashboard/produtos", permission: "products.view" },
  { icon: Warehouse, label: "Estoque", href: "/dashboard/estoque", permission: "stock.view" },
  { icon: FileText, label: "Contas Pagar/Receber", href: "/dashboard/financeiro", permission: "financial.view" },
  { icon: Wallet, label: "Caixa", href: "/dashboard/caixa", permission: "cash_shift.view" },
  { icon: Wallet, label: "Cashback", href: "/dashboard/cashback", permission: "cashback.view" },
  { icon: Target, label: "Metas", href: "/dashboard/metas", permissionAny: ["goals.view", "reports.sales", "settings.edit"] },
  { icon: BarChart3, label: "Relatórios", href: "/dashboard/relatorios", permission: "reports.sales" },
  { icon: TrendingUp, label: "Rel. Avançados", href: "/dashboard/relatorios/avancados", permission: "reports.sales" },
  { icon: DollarSign, label: "Dashboard Fin.", href: "/dashboard/financeiro/dashboard", permission: "financial.view" },
  { icon: BookOpen, label: "DRE", href: "/dashboard/financeiro/dre", permission: "financial.view", feature: "dre_report" },
  { icon: ArrowLeftRight, label: "Fluxo Caixa", href: "/dashboard/financeiro/fluxo-caixa", permission: "financial.view", feature: "cash_flow" },
  { icon: Receipt, label: "Lançamentos", href: "/dashboard/financeiro/lancamentos", permission: "financial.view", feature: "finance_entries" },
  { icon: Building2, label: "Contas Fin.", href: "/dashboard/financeiro/contas", permission: "financial.view", feature: "finance_accounts" },
  { icon: ListTree, label: "Plano Contas", href: "/dashboard/financeiro/plano-contas", permission: "financial.view", feature: "chart_of_accounts" },
  { icon: RotateCcw, label: "Devoluções", href: "/dashboard/financeiro/devolucoes", permission: "sales.refund", feature: "sales_refunds" },
  { icon: RefreshCw, label: "Conciliação", href: "/dashboard/financeiro/conciliacao", permission: "financial.view", feature: "bank_reconciliation" },
  { icon: Boxes, label: "Lotes Estoque", href: "/dashboard/financeiro/lotes-estoque", permission: "financial.view", feature: "inventory_lots" },
  { icon: PieChart, label: "BI Analítico", href: "/dashboard/financeiro/bi", permission: "financial.view", feature: "bi_analytics" },
  // Q7.4 P3-2: 5 features que faltavam no mobile-nav
  { icon: Glasses, label: "Tratamentos", href: "/dashboard/tratamentos", permission: "settings.view", feature: "lens_treatments" },
  { icon: Truck, label: "Transferências", href: "/dashboard/estoque/transferencias", permission: "stock.view", feature: "stock_transfers" },
  { icon: Store, label: "Comp. Lojas", href: "/dashboard/relatorios/comparativo-lojas", permission: "reports.sales", feature: "branch_comparison" },
  { icon: CreditCard, label: "Cartões", href: "/dashboard/financeiro/cartoes", permission: "financial.view", feature: "card_receivables" },
  { icon: CalendarClock, label: "Desp. Recorrentes", href: "/dashboard/financeiro/despesas-recorrentes", permission: "financial.view", feature: "recurring_expenses" },
  { icon: MessageCircle, label: "WhatsApp", href: "/dashboard/configuracoes/whatsapp", permission: "settings.edit", flag: "whatsapp" as const },
  { icon: Sparkles, label: "IA", href: "/dashboard/configuracoes/ia", permission: "settings.edit" },
  { icon: Settings, label: "Config", href: "/dashboard/configuracoes", permission: "settings.view" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const { hasPermission, isAdmin } = usePermissions();
  const { hasFeature } = usePlanFeatures();
  const { enabled: whatsappEnabled } = useWhatsappEnabled();

  // O PDV é tela de foco no mobile e traz a própria barra de ação fixa
  // (Total + Finalizar). Ocultamos a bottom-nav global lá para não empilhar
  // duas barras no rodapé. (Após os hooks — não viola as regras de hooks.)
  const isPdv = pathname === "/dashboard/pdv" || pathname.startsWith("/dashboard/pdv/");
  if (isPdv) return null;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const isVisible = (item: { permission?: string; permissionAny?: string[]; feature?: string; flag?: "whatsapp" }) => {
    const permissionOk =
      isAdmin ||
      (!item.permission && !item.permissionAny) ||
      (item.permission ? hasPermission(item.permission) : false) ||
      (item.permissionAny ? item.permissionAny.some((p) => hasPermission(p)) : false);
    const featureOk = !item.feature || hasFeature(item.feature);
    const flagOk = item.flag !== "whatsapp" || whatsappEnabled;
    return permissionOk && featureOk && flagOk;
  };

  const visiblePrimaryNav = primaryNav.filter(isVisible);
  const visibleMoreNav = moreNav.filter(isVisible);

  return (
    <>
      {/* Overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
          onClick={() => setShowMore(false)}
        />
      )}

      {/* Sheet "Mais" */}
      {showMore && (
        <div className="fixed bottom-[60px] left-0 right-0 z-50 md:hidden bg-card border-t shadow-elevated rounded-t-2xl pb-safe">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mais opções</span>
            <button
              onClick={() => setShowMore(false)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted hover:bg-muted/70 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
            {visibleMoreNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMore(false)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-xl text-[10px] font-medium transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className="leading-tight text-center">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/95 backdrop-blur-sm border-t pb-safe">
        <div className="flex items-stretch justify-around h-[58px]">
          {visiblePrimaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 w-full text-[10px] font-medium transition-colors duration-150 pt-1",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center h-6 w-10 rounded-full transition-all duration-150",
                  active ? "bg-primary/10" : ""
                )}>
                  <Icon className={cn("h-4.5 w-4.5", active && "stroke-[2.5]")} />
                </div>
                {item.label}
              </Link>
            );
          })}

          {visibleMoreNav.length > 0 && (
            <button
              onClick={() => setShowMore(!showMore)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-full text-[10px] font-medium transition-colors duration-150 pt-1",
                showMore ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center h-6 w-10 rounded-full transition-all duration-150",
                showMore ? "bg-primary/10" : ""
              )}>
                <MoreHorizontal className={cn("h-4.5 w-4.5", showMore && "stroke-[2.5]")} />
              </div>
              Mais
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
